import type { RequestHandler } from 'express';
import { HttpError } from '../errors/HttpError';
import { MAX_STARS, MIN_STARS } from '../models/review.model';
import * as reviewService from '../services/review.service';
import { clientIp } from '../utils/clientIp';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 100;
const MAX_NAME = 100;
const MAX_REVIEW = 1000;
const FIELDS = ['name', 'stars', 'review'];

type FieldError = { field: string; message: string };

function parseProductId(value: unknown) {
  const id = String(value);
  if (!UUID_RE.test(id)) throw HttpError.badRequest('Validasi gagal', [{ field: 'id', message: 'id produk harus berupa UUID yang valid' }]);
  return id;
}

/** GET /api/landing/products/:id/reviews?page=&limit= — public. Newest first; meta has ratingAverage and reviewCount. */
export const list: RequestHandler = async (req, res) => {
  const productId = parseProductId(req.params.id);
  const { page = '1', limit = String(DEFAULT_LIMIT) } = req.query as Record<string, string | undefined>;
  const errors: FieldError[] = [];
  const pageNum = Number(page);
  if (!Number.isInteger(pageNum) || pageNum < 1) errors.push({ field: 'page', message: 'page harus berupa bilangan bulat positif' });
  const limitNum = Number(limit);
  if (!Number.isInteger(limitNum) || limitNum < 1 || limitNum > MAX_LIMIT) {
    errors.push({ field: 'limit', message: `limit harus berupa bilangan bulat antara 1 dan ${MAX_LIMIT}` });
  }
  if (errors.length) throw HttpError.badRequest('Validasi gagal', errors);

  const { reviews, meta } = await reviewService.list(productId, { page: pageNum, limit: limitNum });
  res.json({ success: true, data: reviews, meta });
};

/** POST /api/landing/products/:id/reviews — public, no login. Body: { name, stars (1-5), review }. */
export const create: RequestHandler = async (req, res) => {
  const productId = parseProductId(req.params.id);
  const body = (req.body ?? {}) as Record<string, unknown>;
  const errors: FieldError[] = [];

  for (const field of Object.keys(body)) {
    if (!FIELDS.includes(field)) errors.push({ field, message: `${field} bukan field ulasan` });
  }
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  if (!name) errors.push({ field: 'name', message: 'name (nama Anda) wajib diisi' });
  else if (name.length > MAX_NAME) errors.push({ field: 'name', message: `name maksimal ${MAX_NAME} karakter` });

  if (!Number.isInteger(body.stars) || (body.stars as number) < MIN_STARS || (body.stars as number) > MAX_STARS) {
    errors.push({ field: 'stars', message: `stars harus berupa bilangan bulat ${MIN_STARS} sampai ${MAX_STARS}` });
  }

  const review = typeof body.review === 'string' ? body.review.trim() : '';
  if (!review) errors.push({ field: 'review', message: 'review (isi ulasan) wajib diisi' });
  else if (review.length > MAX_REVIEW) errors.push({ field: 'review', message: `review maksimal ${MAX_REVIEW} karakter` });

  if (errors.length) throw HttpError.badRequest('Validasi gagal', errors);

  const result = await reviewService.create(productId, { name, stars: body.stars as number, review }, clientIp(req));
  res.status(201).json({ success: true, data: result.review, meta: { ratingAverage: result.ratingAverage, reviewCount: result.reviewCount } });
};
