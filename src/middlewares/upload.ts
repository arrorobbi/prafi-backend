import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import multer from 'multer';
import { IMAGE_MIME_TYPES, IMAGES_DIR, MAX_IMAGE_SIZE } from '../config/upload';
import { HttpError } from '../errors/HttpError';

fs.mkdirSync(IMAGES_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: IMAGES_DIR,
  // Random name + extension derived from the MIME type, never from the client's filename
  filename: (_req, file, cb) => cb(null, `${randomUUID()}${IMAGE_MIME_TYPES[file.mimetype]}`),
});

export const imageUpload = multer({
  storage,
  limits: { fileSize: MAX_IMAGE_SIZE, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (IMAGE_MIME_TYPES[file.mimetype]) return cb(null, true);
    cb(HttpError.badRequest(`Only ${Object.keys(IMAGE_MIME_TYPES).join(', ')} images are allowed`));
  },
});

/**
 * Accepts a single image in the multipart field `image` (max 5 MB) and stores it in backend/images.
 * The saved file is available as `req.file`.
 * @example router.post('/images', authenticate, uploadImage, handler)
 */
export const uploadImage = imageUpload.single('image');
