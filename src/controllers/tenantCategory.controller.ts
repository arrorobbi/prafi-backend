import type { RequestHandler } from 'express';
import { HttpError } from '../errors/HttpError';
import * as categoryService from '../services/tenantCategory.service';

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;
const MAX_NAME_LENGTH = 255;
const LOCKED_FIELDS: Record<string, string> = {
  id: 'id tidak dapat diubah',
  createdAt: 'createdAt diatur oleh server',
  updatedAt: 'updatedAt diatur oleh server',
};

/** Body for create/update: only `name`. */
function parseName(body: Record<string, unknown>) {
  const errors: { field: string; message: string }[] = [];
  for (const field of Object.keys(body)) {
    if (LOCKED_FIELDS[field]) errors.push({ field, message: LOCKED_FIELDS[field] });
    else if (field !== 'name') errors.push({ field, message: `${field} bukan field kategori tenant` });
  }
  if (typeof body.name !== 'string' || !body.name.trim()) {
    errors.push({ field: 'name', message: 'name wajib diisi' });
  } else if (body.name.trim().length > MAX_NAME_LENGTH) {
    errors.push({ field: 'name', message: `name maksimal ${MAX_NAME_LENGTH} karakter` });
  }
  if (errors.length) throw HttpError.badRequest('Validasi gagal', errors);
  return (body.name as string).trim();
}

function parseId(value: unknown) {
  const id = Number(value);
  if (!Number.isInteger(id) || id < 1) {
    throw HttpError.badRequest('Validasi gagal', [{ field: 'id', message: 'id harus berupa bilangan bulat positif' }]);
  }
  return id;
}

/** GET /api/tenant-categories?page=&limit= — sorted by name. */
export const list: RequestHandler = async (req, res) => {
  const { page = '1', limit = String(DEFAULT_LIMIT) } = req.query as Record<string, string | undefined>;
  const errors: { field: string; message: string }[] = [];
  const pageNum = Number(page);
  if (!Number.isInteger(pageNum) || pageNum < 1) errors.push({ field: 'page', message: 'page harus berupa bilangan bulat positif' });
  const limitNum = Number(limit);
  if (!Number.isInteger(limitNum) || limitNum < 1 || limitNum > MAX_LIMIT) {
    errors.push({ field: 'limit', message: `limit harus berupa bilangan bulat antara 1 dan ${MAX_LIMIT}` });
  }
  if (errors.length) throw HttpError.badRequest('Validasi gagal', errors);

  const { categories, meta } = await categoryService.list({ page: pageNum, limit: limitNum });
  res.json({ success: true, data: categories, meta });
};

export const getOne: RequestHandler = async (req, res) => {
  res.json({ success: true, data: await categoryService.getById(parseId(req.params.id)) });
};

export const create: RequestHandler = async (req, res) => {
  const name = parseName((req.body ?? {}) as Record<string, unknown>);
  res.status(201).json({ success: true, data: await categoryService.create(name) });
};

export const update: RequestHandler = async (req, res) => {
  const id = parseId(req.params.id);
  const name = parseName((req.body ?? {}) as Record<string, unknown>);
  res.json({ success: true, data: await categoryService.update(id, name) });
};

export const remove: RequestHandler = async (req, res) => {
  await categoryService.remove(parseId(req.params.id));
  res.json({ success: true, data: null });
};
