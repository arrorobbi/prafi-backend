import type { RequestHandler } from 'express';
import { HttpError } from '../errors/HttpError';
import { MAX_STARS, MIN_STARS } from '../models/review.model';
import { REPORT_STATUSES } from '../models/review.model';
import * as reviewService from '../services/review.service';
import { clientIp } from '../utils/clientIp';
import { assertHuman } from '../utils/turnstile';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 100;
const MAX_NAME = 100;
const MAX_REVIEW = 1000;
const FIELDS = ['name', 'stars', 'review', 'clientId', 'turnstileToken'];
/** The page's random browser id: letters, digits, dashes */
const CLIENT_ID_RE = /^[A-Za-z0-9-]{8,64}$/;
const MAX_NOTE = 500;

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

/**
 * POST /api/landing/products/:id/reviews — public, no login. Body: { name, stars (1-5), review, clientId, turnstileToken }.
 * clientId: the page's random browser id (with the IP: one review per product per day); turnstileToken: the
 * "not a robot" check (required when TURNSTILE_SECRET_KEY is set).
 */
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

  if (typeof body.clientId !== 'string' || !CLIENT_ID_RE.test(body.clientId)) {
    errors.push({ field: 'clientId', message: 'clientId (id browser, 8-64 huruf/angka/tanda hubung) wajib diisi' });
  }

  if (errors.length) throw HttpError.badRequest('Validasi gagal', errors);

  const ip = clientIp(req);
  await assertHuman(body.turnstileToken, ip);
  const result = await reviewService.create(productId, { name, stars: body.stars as number, review }, { ip, clientId: body.clientId as string });
  res.status(201).json({ success: true, data: result.review, meta: { ratingAverage: result.ratingAverage, reviewCount: result.reviewCount } });
};

// ---------- moderation ----------

function parsePaging(q: Record<string, string | undefined>, errors: FieldError[]) {
  const page = Number(q.page ?? 1);
  if (!Number.isInteger(page) || page < 1) errors.push({ field: 'page', message: 'page harus berupa bilangan bulat positif' });
  const limit = Number(q.limit ?? 20);
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_LIMIT) {
    errors.push({ field: 'limit', message: `limit harus berupa bilangan bulat antara 1 dan ${MAX_LIMIT}` });
  }
  return { page, limit };
}

function parseReviewId(value: unknown) {
  const id = Number(value);
  if (!Number.isInteger(id) || id < 1) throw HttpError.badRequest('Validasi gagal', [{ field: 'id', message: 'id ulasan harus berupa bilangan bulat positif' }]);
  return id;
}

/** Optional free text (reason / note): trimmed, null when empty */
function optionalText(value: unknown, field: string, errors: FieldError[]) {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string') {
    errors.push({ field, message: `${field} harus berupa teks` });
    return null;
  }
  const text = value.trim();
  if (text.length > MAX_NOTE) errors.push({ field, message: `${field} maksimal ${MAX_NOTE} karakter` });
  return text || null;
}

/** GET /api/reviews/mine?page=&limit=&productId= — tenant: reviews of their own products (hidden ones too). */
export const listMine: RequestHandler = async (req, res) => {
  const q = req.query as Record<string, string | undefined>;
  const errors: FieldError[] = [];
  const { page, limit } = parsePaging(q, errors);
  if (q.productId !== undefined && !UUID_RE.test(q.productId)) errors.push({ field: 'productId', message: 'productId harus berupa UUID yang valid' });
  if (errors.length) throw HttpError.badRequest('Validasi gagal', errors);
  const { reviews, meta } = await reviewService.listMine(req.user!, { page, limit, productId: q.productId });
  res.json({ success: true, data: reviews, meta });
};

/** POST /api/reviews/:id/report — tenant, reviews of their own products. Body: { reason } (required, max 500). */
export const report: RequestHandler = async (req, res) => {
  const id = parseReviewId(req.params.id);
  const body = (req.body ?? {}) as Record<string, unknown>;
  const errors: FieldError[] = [];
  for (const field of Object.keys(body)) if (field !== 'reason') errors.push({ field, message: `${field} bukan field laporan` });
  const reason = optionalText(body.reason, 'reason', errors);
  if (!reason && !errors.some((e) => e.field === 'reason')) errors.push({ field: 'reason', message: 'reason (alasan melaporkan) wajib diisi' });
  if (errors.length) throw HttpError.badRequest('Validasi gagal', errors);
  res.json({ success: true, data: await reviewService.report(req.user!, id, reason!) });
};

/** GET /api/reviews?status=pending|hidden|kept|all&page=&limit= — admin / disnakertrans: reported reviews. */
export const listReported: RequestHandler = async (req, res) => {
  const q = req.query as Record<string, string | undefined>;
  const errors: FieldError[] = [];
  const { page, limit } = parsePaging(q, errors);
  const status = (q.status ?? 'pending') as reviewService.ReportFilter;
  if (status !== 'all' && !REPORT_STATUSES.includes(status)) {
    errors.push({ field: 'status', message: `status harus salah satu dari: ${[...REPORT_STATUSES, 'all'].join(', ')}` });
  }
  if (errors.length) throw HttpError.badRequest('Validasi gagal', errors);
  const { reviews, meta } = await reviewService.listReported({ page, limit, status });
  res.json({ success: true, data: reviews, meta });
};

const ACTIONS: reviewService.ModerationAction[] = ['hide', 'keep', 'unhide'];

/** PATCH /api/reviews/:id/moderation — admin / disnakertrans. Body: { action: hide | keep | unhide, note? }. */
export const moderate: RequestHandler = async (req, res) => {
  const id = parseReviewId(req.params.id);
  const body = (req.body ?? {}) as Record<string, unknown>;
  const errors: FieldError[] = [];
  for (const field of Object.keys(body)) if (!['action', 'note'].includes(field)) errors.push({ field, message: `${field} bukan field moderasi` });
  if (!ACTIONS.includes(body.action as reviewService.ModerationAction)) {
    errors.push({ field: 'action', message: `action harus salah satu dari: ${ACTIONS.join(', ')}` });
  }
  const note = optionalText(body.note, 'note', errors);
  if (errors.length) throw HttpError.badRequest('Validasi gagal', errors);
  res.json({ success: true, data: await reviewService.moderate(req.user!, id, body.action as reviewService.ModerationAction, note) });
};
