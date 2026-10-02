import fs from 'node:fs/promises';
import path from 'node:path';
import { IMAGES_DIR, IMAGES_URL_PATH } from '../config/upload';
import { HttpError } from '../errors/HttpError';
import { Image, Product, Tenant, User } from '../models';

/** Saves an uploaded file (from the `uploadImage` middleware) as an Image record. */
export async function createFromUpload(file: Express.Multer.File, altText?: string) {
  try {
    return await Image.create({
      name: file.originalname,
      imgUrl: `${IMAGES_URL_PATH}/${file.filename}`,
      altText: altText?.trim() || path.parse(file.originalname).name,
    });
  } catch (err) {
    // Don't leave orphan files behind if the DB insert fails
    await fs.unlink(file.path).catch(() => {});
    throw err;
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
