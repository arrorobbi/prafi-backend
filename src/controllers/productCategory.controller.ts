import type { RequestHandler } from 'express';
import { HttpError } from '../errors/HttpError';
import * as categoryService from '../services/productCategory.service';

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;
const MAX_NAME_LENGTH = 255;
const FIELDS = ['name', 'imageId'];
const LOCKED_FIELDS: Record<string, string> = {
  id: 'id tidak dapat diubah',
  productCount: 'productCount dihitung dari produk',
  createdAt: 'createdAt diatur oleh server',
  updatedAt: 'updatedAt diatur oleh server',
};

type FieldError = { field: string; message: string };

/**
 * Body for create/update: `name` and `imageId` (the carousel image, upload it first via POST /api/images). Both are
 * required on create; an update may replace the image but never remove it.
 */
function parseBody(body: Record<string, unknown>, partial: boolean) {
  const errors: FieldError[] = [];
  const input: Partial<categoryService.CategoryInput> = {};
  for (const field of Object.keys(body)) {
    if (LOCKED_FIELDS[field]) errors.push({ field, message: LOCKED_FIELDS[field] });
    else if (!FIELDS.includes(field)) errors.push({ field, message: `${field} bukan field kategori produk` });
  }

  if (body.name === undefined) {
    if (!partial) errors.push({ field: 'name', message: 'name wajib diisi' });
  } else if (typeof body.name !== 'string' || !body.name.trim()) {
    errors.push({ field: 'name', message: 'name tidak boleh kosong' });
  } else if (body.name.trim().length > MAX_NAME_LENGTH) {
    errors.push({ field: 'name', message: `name maksimal ${MAX_NAME_LENGTH} karakter` });
  } else {
    input.name = body.name.trim();
  }

  if (body.imageId === undefined) {
    if (!partial) errors.push({ field: 'imageId', message: 'imageId (gambar kategori) wajib diisi, unggah gambar terlebih dahulu melalui POST /api/images' });
  } else if (body.imageId === null) {
    errors.push({ field: 'imageId', message: 'Gambar kategori wajib ada: kirim imageId gambar baru untuk menggantinya' });
  } else if (!Number.isInteger(body.imageId)) {
    errors.push({ field: 'imageId', message: 'imageId harus berupa ID gambar (bilangan bulat)' });
  } else {
    input.imageId = body.imageId as number;
  }

  if (errors.length) throw HttpError.badRequest('Validasi gagal', errors);
  if (partial && Object.keys(input).length === 0) {
    throw HttpError.badRequest(`Kirim minimal satu field untuk diubah: ${FIELDS.join(', ')}`);
  }
  return input;
}

function parseId(value: unknown) {
  const id = Number(value);
  if (!Number.isInteger(id) || id < 1) {
    throw HttpError.badRequest('Validasi gagal', [{ field: 'id', message: 'id harus berupa bilangan bulat positif' }]);
  }
  return id;
}

/** GET /api/product-categories?page=&limit= — sorted by name, with image and productCount. */
export const list: RequestHandler = async (req, res) => {
  const { page = '1', limit = String(DEFAULT_LIMIT) } = req.query as Record<string, string | undefined>;
  const errors: FieldError[] = [];
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

/** GET /api/landing/categories — public: every category with its image and number of approved products. */
export const listPublic: RequestHandler = async (_req, res) => {
  res.json({ success: true, data: await categoryService.listPublic() });
};

export const getOne: RequestHandler = async (req, res) => {
  res.json({ success: true, data: await categoryService.getById(parseId(req.params.id)) });
};

export const create: RequestHandler = async (req, res) => {
  const input = parseBody((req.body ?? {}) as Record<string, unknown>, false) as categoryService.CategoryInput;
  res.status(201).json({ success: true, data: await categoryService.create(input) });
};

export const update: RequestHandler = async (req, res) => {
  const id = parseId(req.params.id);
  const changes = parseBody((req.body ?? {}) as Record<string, unknown>, true);
  res.json({ success: true, data: await categoryService.update(id, changes) });
};

export const remove: RequestHandler = async (req, res) => {
  await categoryService.remove(parseId(req.params.id));
  res.json({ success: true, data: null });
};
