import type { RequestHandler } from 'express';
import { HttpError } from '../errors/HttpError';
import * as productService from '../services/product.service';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

const TEXT_FIELDS = ['name', 'description', 'details'] as const;
const UPDATABLE_FIELDS: string[] = [...TEXT_FIELDS, 'qty', 'imageId'];
const LOCKED_FIELDS: Record<string, string> = {
  id: 'id cannot be changed',
  tenantId: 'a product always belongs to the tenant who created it',
  approvalId: 'approvalId is set by the server',
  approval: 'only superadmin/admin can activate products (PATCH /api/approvals/:id?type=product)',
  isActive: 'only superadmin/admin can activate products (PATCH /api/approvals/:id?type=product)',
  createdAt: 'createdAt is set by the server',
  updatedAt: 'updatedAt is set by the server',
};

type FieldError = { field: string; message: string };

/** Validates a product body. `partial` = update (every field optional, at least one required). */
function parseProductBody(body: Record<string, unknown>, partial: boolean) {
  const errors: FieldError[] = [];
  const input: Partial<productService.ProductInput> = {};

  for (const field of Object.keys(body)) {
    if (LOCKED_FIELDS[field]) errors.push({ field, message: LOCKED_FIELDS[field] });
    else if (!UPDATABLE_FIELDS.includes(field)) errors.push({ field, message: `${field} is not a product field` });
  }

  for (const field of TEXT_FIELDS) {
    if (body[field] === undefined) {
      if (!partial) errors.push({ field, message: `${field} is required` });
    } else if (typeof body[field] !== 'string' || !(body[field] as string).trim()) {
      errors.push({ field, message: `${field} cannot be empty` });
    } else {
      input[field] = (body[field] as string).trim();
    }
  }

  if (body.qty === undefined) {
    if (!partial) errors.push({ field: 'qty', message: 'qty is required' });
  } else if (!Number.isInteger(body.qty) || (body.qty as number) < 0) {
    errors.push({ field: 'qty', message: 'qty must be a whole number, 0 or more' });
  } else {
    input.qty = body.qty as number;
  }

  if (body.imageId === undefined) {
    if (!partial) errors.push({ field: 'imageId', message: 'imageId is required, upload the image first via POST /api/images' });
  } else if (!Number.isInteger(body.imageId)) {
    errors.push({ field: 'imageId', message: 'imageId must be an integer image id' });
  } else {
    input.imageId = body.imageId as number;
  }

  if (errors.length) throw HttpError.badRequest('Validation failed', errors);
  if (partial && Object.keys(input).length === 0) {
    throw HttpError.badRequest(`Send at least one field to update: ${UPDATABLE_FIELDS.join(', ')}`);
  }
  return input;
}

function parseId(value: unknown) {
  const id = String(value);
  if (!UUID_RE.test(id)) throw HttpError.badRequest('Validation failed', [{ field: 'id', message: 'id must be a valid UUID' }]);
  return id;
}

/** GET /api/products?page=&limit=&isActive= — superadmin/admin: all products, tenant: own products. */
export const list: RequestHandler = async (req, res) => {
  const { page = '1', limit = String(DEFAULT_LIMIT), isActive } = req.query as Record<string, string | undefined>;

  const errors: FieldError[] = [];
  const pageNum = Number(page);
  if (!Number.isInteger(pageNum) || pageNum < 1) errors.push({ field: 'page', message: 'page must be a positive integer' });
  const limitNum = Number(limit);
  if (!Number.isInteger(limitNum) || limitNum < 1 || limitNum > MAX_LIMIT) {
    errors.push({ field: 'limit', message: `limit must be an integer between 1 and ${MAX_LIMIT}` });
  }
  if (isActive !== undefined && isActive !== 'true' && isActive !== 'false') {
    errors.push({ field: 'isActive', message: 'isActive must be true or false' });
  }
  if (errors.length) throw HttpError.badRequest('Validation failed', errors);

  const { products, meta } = await productService.list(req.user!, {
    page: pageNum,
    limit: limitNum,
    isActive: isActive === undefined ? undefined : isActive === 'true',
  });
  res.json({ success: true, data: products, meta });
};

/** GET /api/landing/products?page=&limit= — public, no login: only products with an active approval. */
export const listPublic: RequestHandler = async (req, res) => {
  const { page = '1', limit = String(DEFAULT_LIMIT) } = req.query as Record<string, string | undefined>;

  const errors: FieldError[] = [];
  const pageNum = Number(page);
  if (!Number.isInteger(pageNum) || pageNum < 1) errors.push({ field: 'page', message: 'page must be a positive integer' });
  const limitNum = Number(limit);
  if (!Number.isInteger(limitNum) || limitNum < 1 || limitNum > MAX_LIMIT) {
    errors.push({ field: 'limit', message: `limit must be an integer between 1 and ${MAX_LIMIT}` });
  }
  if (errors.length) throw HttpError.badRequest('Validation failed', errors);

  const { products, meta } = await productService.listActive({ page: pageNum, limit: limitNum });
  res.json({ success: true, data: products, meta });
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
