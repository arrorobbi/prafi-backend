import type { Includeable, WhereOptions } from 'sequelize';
import { PRODUCT_READ_ALL_ROLES } from '../constants/roles';
import { HttpError } from '../errors/HttpError';
import { Approval, Image, Product, sequelize } from '../models';
import type { AuthUser } from '../types/express';
import * as imageService from './image.service';
import { notify } from './notification.service';

export interface ProductInput {
  name: string;
  description: string;
  details: string;
  qty: number;
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
    include: productInclude(isActive),
    order: [['createdAt', 'DESC']],
    limit,
    offset: (page - 1) * limit,
    distinct: true,
  });

  return { products: rows, meta: { page, limit, total: count, totalPages: Math.ceil(count / limit) } };
}

/**
 * Public landing page: only products whose approval is active, with public-safe fields
 * (no owner email/phone, no internal approval reason).
 */
export async function listActive({ page, limit }: Omit<ListProductsOptions, 'isActive'>) {
  const { rows, count } = await Product.findAndCountAll({
    attributes: { exclude: ['approvalId'] },
    include: [
      { association: 'image', attributes: ['id', 'imgUrl', 'url', 'altText'] },
      { association: 'approval', attributes: [], where: { isActive: true }, required: true },
      { association: 'tenant', attributes: ['id', 'tenantName', 'firstName', 'lastName'] },
    ],
    order: [['createdAt', 'DESC']],
    limit,
    offset: (page - 1) * limit,
    distinct: true,
  });

  return { products: rows, meta: { page, limit, total: count, totalPages: Math.ceil(count / limit) } };
}

/** Tenants get 404 for other tenants' products, so they can't tell which ids exist. */
export async function getById(user: AuthUser, id: string) {
  const product = await Product.findByPk(id, { include: productInclude() });
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

/** Creates the product with its own approval, inactive until a superadmin/admin activates it. */
export async function create(user: AuthUser, input: ProductInput) {
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
