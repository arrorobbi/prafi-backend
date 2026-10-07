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
    // e.g. iPhone photos are image/heic: say what was sent, not only what's allowed
    cb(
      new HttpError(
        400,
        `Format gambar tidak didukung (${file.mimetype || 'tidak diketahui'}). Gunakan JPG, PNG, WEBP, atau GIF`,
        'UNSUPPORTED_IMAGE_TYPE',
        { allowed: Object.keys(IMAGE_MIME_TYPES), received: file.mimetype },
      ),
    );
  },
});

/**
 * Accepts a single image in the multipart field `image` (max 5 MB) and stores it in backend/images.
 * The saved file is available as `req.file`.
 * @example router.post('/images', authenticate, uploadImage, handler)
 */
export const uploadImage = imageUpload.single('image');
