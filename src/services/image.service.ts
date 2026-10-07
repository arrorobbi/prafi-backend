import fs from 'node:fs/promises';
import path from 'node:path';
import { IMAGES_DIR, IMAGES_URL_PATH } from '../config/upload';
import { HttpError } from '../errors/HttpError';
import { Image, Product, Tenant, User } from '../models';

/** The first bytes of each allowed type, so a renamed non-image (e.g. a PDF saved as .jpg) is refused. */
const SIGNATURES: Record<string, (b: Buffer) => boolean> = {
  'image/jpeg': (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  'image/png': (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
  'image/gif': (b) => b.subarray(0, 4).toString('ascii') === 'GIF8',
  'image/webp': (b) => b.subarray(0, 4).toString('ascii') === 'RIFF' && b.subarray(8, 12).toString('ascii') === 'WEBP',
};

async function readHead(filePath: string) {
  const handle = await fs.open(filePath, 'r');
  try {
    const buffer = Buffer.alloc(12);
    await handle.read(buffer, 0, 12, 0);
    return buffer;
  } finally {
    await handle.close();
  }
}

/**
 * Saves an uploaded file (from the `uploadImage` middleware) as an Image record. Every failure says why in
 * Bahasa Indonesia, and the file is removed again so nothing is left behind.
 */
export async function createFromUpload(file: Express.Multer.File, altText?: string) {
  const discard = () => fs.unlink(file.path).catch(() => {});

  if (file.size === 0) {
    await discard();
    throw new HttpError(400, 'File gambar kosong (0 byte), pilih file lain', 'EMPTY_IMAGE');
  }
  const looksRight = SIGNATURES[file.mimetype];
  if (looksRight && !looksRight(await readHead(file.path))) {
    await discard();
    throw new HttpError(
      400,
      'Isi file bukan gambar yang valid atau file rusak. Gunakan foto JPG, PNG, WEBP, atau GIF',
      'INVALID_IMAGE_CONTENT',
      { received: file.mimetype },
    );
  }

  try {
    return await Image.create({
      name: file.originalname,
      imgUrl: `${IMAGES_URL_PATH}/${file.filename}`,
      altText: altText?.trim() || path.parse(file.originalname).name,
    });
  } catch (err) {
    // Don't leave orphan files behind if the DB insert fails
    await discard();
    if (err instanceof HttpError) throw err;
    const reason = err instanceof Error ? err.name : 'UnknownError';
    throw new HttpError(500, 'Gambar sudah terkirim tetapi gagal disimpan ke database, silakan coba lagi', 'IMAGE_SAVE_FAILED', { reason });
  }
}

/** Deletes an Image record and its file on disk. */
export async function remove(id: number) {
  const image = await Image.findByPk(id);
  if (!image) throw HttpError.notFound('Gambar tidak ditemukan');

  await image.destroy();
  await deleteFile(image.imgUrl);
}

/** The file of an imgUrl (e.g. /images/abc.png) in the images folder; basename keeps it inside that folder. */
const deleteFile = (imgUrl: string) => fs.unlink(path.join(IMAGES_DIR, path.basename(imgUrl))).catch(() => {});

/**
 * Called after a product image, face image or tenant logo was replaced (or removed):
 * deletes the old image record and file, unless something still uses it.
 * Never throws, so a cleanup problem can't fail the update that triggered it.
 */
export async function removeReplaced(oldImageId: number | null | undefined, newImageId?: number | null) {
  if (oldImageId == null || oldImageId === newImageId) return;
  try {
    const [products, tenants, users] = await Promise.all([
      Product.count({ where: { imageId: oldImageId } }),
      Tenant.count({ where: { logoId: oldImageId } }),
      User.count({ where: { faceImageId: oldImageId } }),
    ]);
    if (products + tenants + users > 0) return;

    const image = await Image.findByPk(oldImageId);
    if (!image) return;
    await image.destroy();
    await deleteFile(image.imgUrl);
  } catch (err) {
    console.error(`[images] could not delete replaced image ${oldImageId}:`, err);
  }
}
