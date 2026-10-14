import path from 'node:path';

/** backend/images — resolved from this file so it works from both src/ (tsx) and dist/ (node). */
export const IMAGES_DIR = path.resolve(__dirname, '../../images');

/** URL path the images folder is served under, e.g. http://localhost:4000/images/<file> */
export const IMAGES_URL_PATH = '/images';

/** Largest picture that is stored: anything bigger is compressed to this (services/imageCompress.service.ts) */
export const MAX_IMAGE_SIZE = 3 * 1024 * 1024; // 3 MB

/**
 * Largest file accepted for upload (then compressed to MAX_IMAGE_SIZE). Kept under nginx's 10 MB limit for the
 * website (client_max_body_size), which counts the whole request.
 */
export const MAX_UPLOAD_SIZE = 9 * 1024 * 1024; // 9 MB

/** Allowed image types → file extension. SVG is excluded because it can carry scripts. */
export const IMAGE_MIME_TYPES: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/gif': '.gif',
};
