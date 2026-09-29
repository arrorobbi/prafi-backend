import path from 'node:path';

/** backend/images — resolved from this file so it works from both src/ (tsx) and dist/ (node). */
export const IMAGES_DIR = path.resolve(__dirname, '../../images');

/** URL path the images folder is served under, e.g. http://localhost:4000/images/<file> */
export const IMAGES_URL_PATH = '/images';

export const MAX_IMAGE_SIZE = 5 * 1024 * 1024; // 5 MB

/** Allowed image types → file extension. SVG is excluded because it can carry scripts. */
export const IMAGE_MIME_TYPES: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/gif': '.gif',
};
