import type { RequestHandler } from 'express';
import { HttpError } from '../errors/HttpError';
import * as tenantService from '../services/tenant.service';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

const TEXT_FIELDS = ['name', 'description', 'address', 'area', 'operationalHours', 'whatsappLink', 'gmapsLink'] as const;
/** Required links: a real http(s) link (a "-" placeholder is refused) */
const REQUIRED_LINK_FIELDS = ['fbLink'] as const;
/** Optional links: a http(s) link, or null / "" for none */
const OPTIONAL_LINK_FIELDS = ['instagramLink', 'googleBusinessLink', 'shopeeLink'] as const;
const MAX_LINK = 255;
const ID_FIELDS = ['logoId'] as const;
const FIELDS: string[] = [...TEXT_FIELDS, ...REQUIRED_LINK_FIELDS, ...OPTIONAL_LINK_FIELDS, ...ID_FIELDS];
/** On create, `name` may be left out: it defaults to the owner's tenantName. */
const OPTIONAL_ON_CREATE = ['name'];
const LOCKED_FIELDS: Record<string, string> = {
  id: 'id tidak dapat diubah',
  userId: 'profil tenant selalu dimiliki oleh tenant yang sedang login',
  tenantCategoryId: 'tenantCategoryId sudah tidak dipakai: kategori kini dipilih per produk (categoryId pada POST/PATCH /api/products)',
  createdAt: 'createdAt diatur oleh server',
  updatedAt: 'updatedAt diatur oleh server',
};

type FieldError = { field: string; message: string };

const isLink = (value: string) => /^https?:\/\/\S+$/i.test(value.trim());

/** Validates a tenant body. `partial` = update (every field optional, at least one required). */
function parseTenantBody(body: Record<string, unknown>, partial: boolean) {
  const errors: FieldError[] = [];
  const input: Partial<tenantService.TenantInput> = {};

  for (const field of Object.keys(body)) {
    if (LOCKED_FIELDS[field]) errors.push({ field, message: LOCKED_FIELDS[field] });
    else if (!FIELDS.includes(field)) errors.push({ field, message: `${field} bukan field tenant` });
  }

  for (const field of TEXT_FIELDS) {
    if (body[field] === undefined) {
      if (!partial && !OPTIONAL_ON_CREATE.includes(field)) errors.push({ field, message: `${field} wajib diisi` });
    } else if (typeof body[field] !== 'string' || !(body[field] as string).trim()) {
      errors.push({ field, message: `${field} tidak boleh kosong` });
    } else {
      input[field] = (body[field] as string).trim();
    }
  }

  for (const field of REQUIRED_LINK_FIELDS) {
    const value = body[field];
    if (value === undefined) {
      if (!partial) errors.push({ field, message: `${field} wajib diisi` });
    } else if (typeof value !== 'string' || !isLink(value)) {
      errors.push({ field, message: `${field} wajib diisi dengan tautan yang diawali http:// atau https://` });
    } else if (value.trim().length > MAX_LINK) {
      errors.push({ field, message: `${field} maksimal ${MAX_LINK} karakter` });
    } else {
      input[field] = value.trim();
    }
  }

  for (const field of OPTIONAL_LINK_FIELDS) {
    const value = body[field];
    if (value === undefined) continue;
    if (value === null || (typeof value === 'string' && !value.trim())) {
      input[field] = null;
    } else if (typeof value !== 'string' || !isLink(value)) {
      errors.push({ field, message: `${field} harus berupa tautan yang diawali http:// atau https://, atau dikosongkan` });
    } else if (value.trim().length > MAX_LINK) {
      errors.push({ field, message: `${field} maksimal ${MAX_LINK} karakter` });
    } else {
      input[field] = value.trim();
    }
  }

  for (const field of ID_FIELDS) {
    if (body[field] === undefined) {
      if (!partial) {
        errors.push({ field, message: field === 'logoId' ? 'logoId wajib diisi, unggah logo terlebih dahulu melalui POST /api/images' : `${field} wajib diisi` });
      }
    } else if (!Number.isInteger(body[field])) {
      errors.push({ field, message: `${field} harus berupa ID (bilangan bulat)` });
    } else {
      input[field] = body[field] as number;
    }
  }

  if (errors.length) throw HttpError.badRequest('Validasi gagal', errors);
  if (partial && Object.keys(input).length === 0) {
    throw HttpError.badRequest(`Kirim minimal satu field untuk diubah: ${FIELDS.join(', ')}`);
  }
  return input;
}

// ---------- tenant: own profile (/api/tenants/me) ----------

export const getMine: RequestHandler = async (req, res) => {
  res.json({ success: true, data: await tenantService.getMine(req.user!) });
};

export const createMine: RequestHandler = async (req, res) => {
  const input = parseTenantBody((req.body ?? {}) as Record<string, unknown>, false);
  const tenant = await tenantService.createMine(req.user!, input as Parameters<typeof tenantService.createMine>[1]);
  res.status(201).json({ success: true, data: tenant });
};

export const updateMine: RequestHandler = async (req, res) => {
  const changes = parseTenantBody((req.body ?? {}) as Record<string, unknown>, true);
  res.json({ success: true, data: await tenantService.updateMine(req.user!, changes) });
};

export const deleteMine: RequestHandler = async (req, res) => {
  await tenantService.deleteMine(req.user!);
  res.json({ success: true, data: null });
};

// ---------- superadmin / admin: read all ----------

/** GET /api/tenants?page=&limit= */
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

  const { tenants, meta } = await tenantService.list({ page: pageNum, limit: limitNum });
  res.json({ success: true, data: tenants, meta });
};

export const getOne: RequestHandler = async (req, res) => {
  const id = String(req.params.id);
  if (!UUID_RE.test(id)) throw HttpError.badRequest('Validasi gagal', [{ field: 'id', message: 'id harus berupa UUID yang valid' }]);
  res.json({ success: true, data: await tenantService.getById(id) });
};

// ---------- public (landing page, no login) ----------

/** GET /api/landing/tenants?page=&limit=&q= — UMKM with an active owner, A→Z, with product count and rating. */
export const listPublic: RequestHandler = async (req, res) => {
  const { page = '1', limit = String(DEFAULT_LIMIT), q } = req.query as Record<string, string | undefined>;

  const errors: FieldError[] = [];
  const pageNum = Number(page);
  if (!Number.isInteger(pageNum) || pageNum < 1) errors.push({ field: 'page', message: 'page harus berupa bilangan bulat positif' });
  const limitNum = Number(limit);
  if (!Number.isInteger(limitNum) || limitNum < 1 || limitNum > MAX_LIMIT) {
    errors.push({ field: 'limit', message: `limit harus berupa bilangan bulat antara 1 dan ${MAX_LIMIT}` });
  }
  if (errors.length) throw HttpError.badRequest('Validasi gagal', errors);

  const { tenants, meta } = await tenantService.listPublic({
    page: pageNum,
    limit: limitNum,
    q: q?.trim() || undefined,
  });
  res.json({ success: true, data: tenants, meta });
};

/** GET /api/landing/tenants/:id — one UMKM by its profile id or its owner's user id (product.tenant.id). */
export const getPublic: RequestHandler = async (req, res) => {
  const id = String(req.params.id);
  if (!UUID_RE.test(id)) throw HttpError.badRequest('Validasi gagal', [{ field: 'id', message: 'id harus berupa UUID yang valid' }]);
  res.json({ success: true, data: await tenantService.getPublic(id) });
};
