import type { RequestHandler } from 'express';
import { HttpError } from '../errors/HttpError';
import * as productService from '../services/product.service';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

const TEXT_FIELDS = ['name', 'description', 'details'] as const;
const UPDATABLE_FIELDS: string[] = [...TEXT_FIELDS, 'price', 'categoryId', 'imageId'];
/** Rupiah (IDR); also keeps the value inside the INTEGER column */
const MAX_PRICE = 2_000_000_000;
const LOCKED_FIELDS: Record<string, string> = {
  id: 'id tidak dapat diubah',
  tenantId: 'produk selalu dimiliki oleh tenant yang membuatnya',
  approvalId: 'approvalId diatur oleh server',
  approval: 'hanya admin atau disnakertrans yang dapat mengaktifkan produk (PATCH /api/approvals/:id?type=product)',
  isActive: 'hanya admin atau disnakertrans yang dapat mengaktifkan produk (PATCH /api/approvals/:id?type=product)',
  qty: 'qty sudah tidak dipakai, gunakan price (harga dalam Rupiah)',
  isRecommended: 'isRecommended diatur otomatis: produk menjadi rekomendasi bila rata-rata ulasannya 4,8 bintang atau lebih',
  category: 'kirim categoryId (ID kategori produk)',
  ratingAverage: 'ratingAverage dihitung dari ulasan',
  reviewCount: 'reviewCount dihitung dari ulasan',
  createdAt: 'createdAt diatur oleh server',
  updatedAt: 'updatedAt diatur oleh server',
};

type FieldError = { field: string; message: string };

/** Validates a product body. `partial` = update (every field optional, at least one required). */
function parseProductBody(body: Record<string, unknown>, partial: boolean) {
  const errors: FieldError[] = [];
  const input: Partial<productService.ProductInput> = {};

  for (const field of Object.keys(body)) {
    if (LOCKED_FIELDS[field]) errors.push({ field, message: LOCKED_FIELDS[field] });
    else if (!UPDATABLE_FIELDS.includes(field)) errors.push({ field, message: `${field} bukan field produk` });
  }

  for (const field of TEXT_FIELDS) {
    if (body[field] === undefined) {
      if (!partial) errors.push({ field, message: `${field} wajib diisi` });
    } else if (typeof body[field] !== 'string' || !(body[field] as string).trim()) {
      errors.push({ field, message: `${field} tidak boleh kosong` });
    } else {
      input[field] = (body[field] as string).trim();
    }
  }

  if (body.price === undefined) {
    if (!partial) errors.push({ field: 'price', message: 'price (harga dalam Rupiah) wajib diisi' });
  } else if (!Number.isInteger(body.price) || (body.price as number) < 0 || (body.price as number) > MAX_PRICE) {
    errors.push({ field: 'price', message: 'price harus berupa angka Rupiah tanpa desimal, antara 0 dan 2.000.000.000' });
  } else {
    input.price = body.price as number;
  }

  if (body.categoryId === undefined) {
    if (!partial) errors.push({ field: 'categoryId', message: 'categoryId (kategori produk) wajib diisi' });
  } else if (!Number.isInteger(body.categoryId) || (body.categoryId as number) < 1) {
    errors.push({ field: 'categoryId', message: 'categoryId harus berupa ID kategori produk (bilangan bulat)' });
  } else {
    input.categoryId = body.categoryId as number;
  }

  if (body.imageId === undefined) {
    if (!partial) errors.push({ field: 'imageId', message: 'imageId wajib diisi, unggah gambar terlebih dahulu melalui POST /api/images' });
  } else if (!Number.isInteger(body.imageId)) {
    errors.push({ field: 'imageId', message: 'imageId harus berupa ID gambar (bilangan bulat)' });
  } else {
    input.imageId = body.imageId as number;
  }

  if (errors.length) throw HttpError.badRequest('Validasi gagal', errors);
  if (partial && Object.keys(input).length === 0) {
    throw HttpError.badRequest(`Kirim minimal satu field untuk diubah: ${UPDATABLE_FIELDS.join(', ')}`);
  }
  return input;
}

function parseId(value: unknown) {
  const id = String(value);
  if (!UUID_RE.test(id)) throw HttpError.badRequest('Validasi gagal', [{ field: 'id', message: 'id harus berupa UUID yang valid' }]);
  return id;
}

/** GET /api/products?page=&limit=&isActive=&categoryId= — superadmin/admin: all products, tenant: own products. */
export const list: RequestHandler = async (req, res) => {
  const { page = '1', limit = String(DEFAULT_LIMIT), isActive, categoryId } = req.query as Record<string, string | undefined>;

  const errors: FieldError[] = [];
  const pageNum = Number(page);
  if (!Number.isInteger(pageNum) || pageNum < 1) errors.push({ field: 'page', message: 'page harus berupa bilangan bulat positif' });
  const limitNum = Number(limit);
  if (!Number.isInteger(limitNum) || limitNum < 1 || limitNum > MAX_LIMIT) {
    errors.push({ field: 'limit', message: `limit harus berupa bilangan bulat antara 1 dan ${MAX_LIMIT}` });
  }
  if (isActive !== undefined && isActive !== 'true' && isActive !== 'false') {
    errors.push({ field: 'isActive', message: 'isActive harus bernilai true atau false' });
  }
  const categoryNum = categoryId === undefined ? undefined : Number(categoryId);
  if (categoryNum !== undefined && (!Number.isInteger(categoryNum) || categoryNum < 1)) {
    errors.push({ field: 'categoryId', message: 'categoryId harus berupa ID kategori produk (bilangan bulat)' });
  }
  if (errors.length) throw HttpError.badRequest('Validasi gagal', errors);

  const { products, meta } = await productService.list(req.user!, {
    page: pageNum,
    limit: limitNum,
    isActive: isActive === undefined ? undefined : isActive === 'true',
    categoryId: categoryNum,
  });
  res.json({ success: true, data: products, meta });
};

/**
 * GET /api/landing/products?page=&limit=&recommended=&tenantId=&categoryId=&sort= — public, no login: only products
 * with an active approval. recommended=true: only the recommended ones (reviews average 4.8+); tenantId: one owner's
 * products; categoryId: one category. sort: newest (default) or rating (best rated first, unrated last).
 */
export const listPublic: RequestHandler = async (req, res) => {
  const { page = '1', limit = String(DEFAULT_LIMIT), recommended, tenantId, categoryId, sort } = req.query as Record<
    string,
    string | undefined
  >;

  const errors: FieldError[] = [];
  const pageNum = Number(page);
  if (!Number.isInteger(pageNum) || pageNum < 1) errors.push({ field: 'page', message: 'page harus berupa bilangan bulat positif' });
  const limitNum = Number(limit);
  if (!Number.isInteger(limitNum) || limitNum < 1 || limitNum > MAX_LIMIT) {
    errors.push({ field: 'limit', message: `limit harus berupa bilangan bulat antara 1 dan ${MAX_LIMIT}` });
  }
  if (recommended !== undefined && recommended !== 'true' && recommended !== 'false') {
    errors.push({ field: 'recommended', message: 'recommended harus bernilai true atau false' });
  }
  if (tenantId !== undefined && !UUID_RE.test(tenantId)) {
    errors.push({ field: 'tenantId', message: 'tenantId harus berupa UUID yang valid (id pemilik produk)' });
  }
  const categoryNum = categoryId === undefined ? undefined : Number(categoryId);
  if (categoryNum !== undefined && (!Number.isInteger(categoryNum) || categoryNum < 1)) {
    errors.push({ field: 'categoryId', message: 'categoryId harus berupa ID kategori produk (bilangan bulat)' });
  }
  if (sort !== undefined && sort !== 'newest' && sort !== 'rating') {
    errors.push({ field: 'sort', message: 'sort harus bernilai newest atau rating' });
  }
  if (errors.length) throw HttpError.badRequest('Validasi gagal', errors);

  const { products, meta } = await productService.listActive({
    page: pageNum,
    limit: limitNum,
    recommended: recommended === undefined ? undefined : recommended === 'true',
    tenantId,
    categoryId: categoryNum,
    sort: sort as 'newest' | 'rating' | undefined,
  });
  res.json({ success: true, data: products, meta });
};

/** GET /api/landing/products/:id — public: one approved product, with its rating summary. */
export const getPublic: RequestHandler = async (req, res) => {
  res.json({ success: true, data: await productService.getActive(parseId(req.params.id)) });
};

export const getOne: RequestHandler = async (req, res) => {
  const product = await productService.getById(req.user!, parseId(req.params.id));
  res.json({ success: true, data: product });
};

/** POST /api/products — tenant only. The new product starts inactive (approval.isActive = false). */
export const create: RequestHandler = async (req, res) => {
  const input = parseProductBody((req.body ?? {}) as Record<string, unknown>, false) as productService.ProductInput;
  const product = await productService.create(req.user!, input);
  res.status(201).json({ success: true, data: product });
};

/** PATCH /api/products/:id — tenant only, own products. Send only the fields to change. */
export const update: RequestHandler = async (req, res) => {
  const id = parseId(req.params.id);
  const changes = parseProductBody((req.body ?? {}) as Record<string, unknown>, true);
  const product = await productService.update(req.user!, id, changes);
  res.json({ success: true, data: product });
};

/** DELETE /api/products/:id — tenant only, own products. Also deletes its approval and image. */
export const remove: RequestHandler = async (req, res) => {
  await productService.remove(req.user!, parseId(req.params.id));
  res.json({ success: true, data: null });
};
