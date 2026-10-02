import type { RequestHandler } from 'express';
import { HttpError } from '../errors/HttpError';
import * as imageService from '../services/image.service';

export const upload: RequestHandler = async (req, res) => {
  if (!req.file) throw HttpError.badRequest('File gambar wajib diunggah (field multipart "image")');

  const { altText } = (req.body ?? {}) as { altText?: unknown };
  const image = await imageService.createFromUpload(
    req.file,
    typeof altText === 'string' ? altText : undefined,
  );
  res.status(201).json({ success: true, data: image });
};

export const remove: RequestHandler = async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) throw HttpError.badRequest('ID gambar tidak valid');

  await imageService.remove(id);
  res.json({ success: true, data: null });
};
