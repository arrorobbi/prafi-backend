import { literal, type FindAttributeOptions, type Includeable, type WhereOptions } from 'sequelize';
import { PRODUCT_READ_ALL_ROLES } from '../constants/roles';
import { HttpError } from '../errors/HttpError';
import { Approval, Image, Product, sequelize } from '../models';
import type { AuthUser } from '../types/express';
import * as imageService from './image.service';
import { assertProfileComplete } from './tenant.service';
import { notify } from './notification.service';

export interface ProductInput {
  name: string;
  description: string;
  details: string;
  /** Rupiah (IDR), whole numbers */
  price: number;
  /** Optional, defaults to false */
  isRecommended?: boolean;
  /** Required: upload the image first via POST /api/images. */
  imageId: number;
}

export interface ListProductsOptions {
  page: number;
  limit: number;
  /** Optional filter on the product's approval. */
  isActive?: boolean;
}

const productInclude = (isActive?: boolean): Includeable[] => [
  { association: 'image' },
  {
    association: 'approval',
    attributes: ['id', 'isActive', 'reason', 'updatedAt'],
    ...(isActive !== undefined && { where: { isActive }, required: true }),
  },
  { association: 'tenant', attributes: ['id', 'tenantName', 'firstName', 'lastName', 'email'] },
];

const canReadAll = (user: AuthUser) => PRODUCT_READ_ALL_ROLES.includes(user.role);

/**
 * Every product response carries its reviews' summary: ratingAverage (1 decimal, null without reviews)
 * and reviewCount. Subqueries, so paging and counting the products stay correct.
 */
const RATING_ATTRIBUTES: [ReturnType<typeof literal>, string][] = [
  [literal('(SELECT ROUND(AVG(r.stars)::numeric, 1)::float FROM reviews r WHERE r.product_id = "Product"."id")'), 'ratingAverage'],
  [literal('(SELECT COUNT(*)::int FROM reviews r WHERE r.product_id = "Product"."id")'), 'reviewCount'],
];
const withRating = (exclude: string[] = []): FindAttributeOptions => ({ include: RATING_ATTRIBUTES, exclude });

async function assertImageExists(imageId: number) {
  const image = await Image.findByPk(imageId, { attributes: ['id'] });
  if (!image) {
    throw HttpError.badRequest('Validasi gagal', [
      { field: 'imageId', message: 'Gambar tidak ditemukan, unggah terlebih dahulu melalui POST /api/images' },
    ]);
  }
}

/** superadmin/admin: every product. tenant: only their own products. */
export async function list(user: AuthUser, { page, limit, isActive }: ListProductsOptions) {
  const where: WhereOptions = canReadAll(user) ? {} : { tenantId: user.id };

  const { rows, count } = await Product.findAndCountAll({
    where,
    attributes: withRating(),
    include: productInclude(isActive),
    order: [['createdAt', 'DESC']],
    limit,
    offset: (page - 1) * limit,
    distinct: true,
  });

  return { products: rows, meta: { page, limit, total: count, totalPages: Math.ceil(count / limit) } };
}

export interface ListActiveOptions {
  page: number;
  limit: number;
  /** Only the products their tenant marked as recommended */
  recommended?: boolean;
  /** Only this tenant user's products (the owner's user id, as in product.tenant.id) */
  tenantId?: string;
}

/** Public-safe shape: no owner email/phone, no internal approval reason. */
const PUBLIC_INCLUDE: Includeable[] = [
  { association: 'image', attributes: ['id', 'imgUrl', 'url', 'altText'] },
  { association: 'approval', attributes: [], where: { isActive: true }, required: true },
  {
    association: 'tenant',
    attributes: ['id', 'tenantName', 'firstName', 'lastName'],
    // The owner's UMKM profile, for "Lihat UMKM" links (GET /api/landing/tenants/:id)
    include: [{ association: 'tenant', attributes: ['id', 'name'] }],
  },
];

/** Public landing page: only products whose approval is active. */
export async function listActive({ page, limit, recommended, tenantId }: ListActiveOptions) {
  const where: WhereOptions = {
    ...(recommended !== undefined && { isRecommended: recommended }),
    ...(tenantId && { tenantId }),
  };
  const { rows, count } = await Product.findAndCountAll({
    where,
    attributes: withRating(['approvalId']),
    include: PUBLIC_INCLUDE,
    order: [['createdAt', 'DESC']],
    limit,
    offset: (page - 1) * limit,
    distinct: true,
  });

  return { products: rows, meta: { page, limit, total: count, totalPages: Math.ceil(count / limit) } };
}

/** Public: one approved product (404 for unknown or not-yet-approved ones). */
export async function getActive(id: string) {
  const product = await Product.findByPk(id, { attributes: withRating(['approvalId']), include: PUBLIC_INCLUDE });
  if (!product) throw HttpError.notFound('Produk tidak ditemukan');
  return product;
}

/** Tenants get 404 for other tenants' products, so they can't tell which ids exist. */
export async function getById(user: AuthUser, id: string) {
  const product = await Product.findByPk(id, { attributes: withRating(), include: productInclude() });
  if (!product || (!canReadAll(user) && product.tenantId !== user.id)) {
    throw HttpError.notFound('Produk tidak ditemukan');
  }
  return product;
}

/** A tenant's own product, or 404. */
async function findOwnProduct(user: AuthUser, id: string) {
  const product = await Product.findOne({ where: { id, tenantId: user.id } });
  if (!product) throw HttpError.notFound('Produk tidak ditemukan');
  return product;
}

/** Creates the product with its own approval, inactive until an admin or disnakertrans activates it. */
export async function create(user: AuthUser, input: ProductInput) {
  await assertProfileComplete(user);
  await assertImageExists(input.imageId);

  // imageId already used by another product → UniqueConstraintError → 409 via the error handler
  const product = await sequelize.transaction(async (transaction) => {
    const approval = await Approval.create(
      { type: 'product', userId: user.id, reason: 'Waiting for approval', isActive: false },
      { transaction },
    );
    return Product.create({ ...input, tenantId: user.id, approvalId: approval.id }, { transaction });
  });
  const created = await getById(user, product.id);
  await notify.productSubmitted(created, { id: user.id, tenantName: created.tenant?.tenantName });
  return created;
}

export async function update(user: AuthUser, id: string, changes: Partial<ProductInput>) {
  const product = await findOwnProduct(user, id);
  if (changes.imageId !== undefined) await assertImageExists(changes.imageId);

  const oldImageId = product.imageId;
  await product.update(changes);
  // A new image replaces the old one: its record and file are deleted
  if (changes.imageId !== undefined) await imageService.removeReplaced(oldImageId, changes.imageId);
  const updated = await getById(user, product.id);
  await notify.productUpdated(updated, { tenantName: updated.tenant?.tenantName });
  return updated;
}

/** Deletes the product together with its approval and its image (file included). */
export async function remove(user: AuthUser, id: string) {
  const product = await findOwnProduct(user, id);
  const { approvalId, imageId } = product;

  await sequelize.transaction(async (transaction) => {
    await product.destroy({ transaction });
    if (approvalId) await Approval.destroy({ where: { id: approvalId }, transaction });
  });
  if (imageId) await imageService.remove(imageId).catch(() => {});
}
