import fs from 'node:fs/promises';
import path from 'node:path';
import { IMAGE_MIME_TYPES, MAX_IMAGE_SIZE } from '../config/upload';

/**
 * Keeps every stored picture at MAX_IMAGE_SIZE (3 MB) or less. The website already compresses before uploading;
 * this is for anything that still arrives bigger (another client, a browser that couldn't). The picture is turned the
 * right way up, scaled down to at most MAX_SIDE pixels, and saved again with less and less quality (and, if needed,
 * smaller) until it fits. JPEG and WebP keep their format; PNG and GIF become WebP (smaller, keeps transparency;
 * a GIF keeps only its first frame).
 */
const MAX_SIDE = 2560;
const QUALITIES = [85, 75, 65, 55, 45];

export interface UploadedFile {
  path: string;
  filename: string;
  mimetype: string;
  size: number;
}

/** Returns the file as stored: unchanged when it was small enough, otherwise the compressed copy (maybe a new name). */
export async function shrinkToLimit(file: UploadedFile): Promise<UploadedFile> {
  if (file.size <= MAX_IMAGE_SIZE) return file;
  const sharp = (await import('sharp')).default;
  const toWebp = file.mimetype === 'image/png' || file.mimetype === 'image/gif';
  const mimetype = toWebp ? 'image/webp' : file.mimetype;
  const source = await fs.readFile(file.path);

  let side = MAX_SIDE;
  let output: Buffer | null = null;
  for (let attempt = 0; attempt < 4 && !output; attempt++) {
    for (const quality of QUALITIES) {
      const image = sharp(source, { failOn: 'none' }).rotate().resize(side, side, { fit: 'inside', withoutEnlargement: true });
      const buffer = await (mimetype === 'image/jpeg' ? image.jpeg({ quality, mozjpeg: true }) : image.webp({ quality })).toBuffer();
      if (buffer.length <= MAX_IMAGE_SIZE) {
        output = buffer;
        break;
      }
    }
    side = Math.round(side * 0.75);
  }
  // Practically never: an extreme picture still too big at 1080 px and quality 45
  if (!output) return file;

  const filename = `${path.parse(file.filename).name}${IMAGE_MIME_TYPES[mimetype]}`;
  const target = path.join(path.dirname(file.path), filename);
  await fs.writeFile(target, output, { mode: 0o644 });
  if (target !== file.path) await fs.unlink(file.path).catch(() => {});
  return { path: target, filename, mimetype, size: output.length };
}
