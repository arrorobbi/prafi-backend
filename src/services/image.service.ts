import fs from 'node:fs/promises';
import path from 'node:path';
import { IMAGES_DIR, IMAGES_URL_PATH } from '../config/upload';
import { HttpError } from '../errors/HttpError';
import { Image } from '../models';

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
  const filename = path.basename(image.imgUrl);
  await fs.unlink(path.join(IMAGES_DIR, filename)).catch(() => {});
}
