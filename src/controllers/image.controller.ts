import type { RequestHandler } from 'express';
import { HttpError } from '../errors/HttpError';
import * as imageService from '../services/image.service';

/**
 * POST /api/images — multipart field `image`. `?purpose=face`: the picture is for an account photo and must show a
 * face (400 FACE_NOT_FOUND otherwise), so the person hears it right at upload.
 */
export const upload: RequestHandler = async (req, res) => {
  if (!req.file) throw new HttpError(400, 'Pilih file gambar terlebih dahulu (field multipart "image")', 'IMAGE_REQUIRED');

  const { altText } = (req.body ?? {}) as { altText?: unknown };
  const image = await imageService.createFromUpload(
    req.file,
    typeof altText === 'string' ? altText : undefined,
    req.user!.id,
    { face: req.query.purpose === 'face' },
  );
  res.status(201).json({ success: true, data: image });
};

export const remove: RequestHandler = async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) throw HttpError.badRequest('ID gambar tidak valid');

  await imageService.removeOwnUnused(req.user!, id);
  res.json({ success: true, data: null });
};
