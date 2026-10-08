import { literal, type FindAttributeOptions } from 'sequelize';
import { HttpError } from '../errors/HttpError';
import { Image, Product, ProductCategory } from '../models';
import * as imageService from './image.service';

export interface ListCategoriesOptions {
  page: number;
  limit: number;
}

export interface CategoryInput {
  name: string;
  /** Upload it first via POST /api/images; null removes the image */
  imageId?: number | null;
}

const IMAGE_INCLUDE = { association: 'image', attributes: ['id', 'imgUrl', 'url', 'altText'] };

/** productCount: every product in the category (any status) */
const WITH_COUNT: FindAttributeOptions = {
  include: [[literal('(SELECT COUNT(*)::int FROM products p WHERE p.category_id = "ProductCategory"."id")'), 'productCount']],
};

/** Approved products only, for the public list */
const WITH_ACTIVE_COUNT: FindAttributeOptions = {
  include: [
    [
      literal(`(SELECT COUNT(*)::int FROM products p JOIN approvals a ON a.id = p.approval_id
        WHERE p.category_id = "ProductCategory"."id" AND a.is_active = true)`),
      'productCount',
    ],
  ],
};

export async function list({ page, limit }: ListCategoriesOptions) {
  const { rows, count } = await ProductCategory.findAndCountAll({
    attributes: WITH_COUNT,
    include: [IMAGE_INCLUDE],
    order: [['name', 'ASC']],
    limit,
    offset: (page - 1) * limit,
  });
  return { categories: rows, meta: { page, limit, total: count, totalPages: Math.ceil(count / limit) } };
}

/** Public (landing page carousel): every category with its image and number of approved products, A→Z. */
export async function listPublic() {
  return ProductCategory.findAll({ attributes: WITH_ACTIVE_COUNT, include: [IMAGE_INCLUDE], order: [['name', 'ASC']] });
}

export async function getById(id: number) {
  const category = await ProductCategory.findByPk(id, { attributes: WITH_COUNT, include: [IMAGE_INCLUDE] });
  if (!category) throw HttpError.notFound('Kategori produk tidak ditemukan');
  return category;
}

async function assertImageExists(imageId: number | null | undefined) {
  if (imageId == null) return;
  const image = await Image.findByPk(imageId, { attributes: ['id'] });
  if (!image) {
    throw HttpError.badRequest('Validasi gagal', [
      { field: 'imageId', message: 'Gambar tidak ditemukan, unggah terlebih dahulu melalui POST /api/images' },
    ]);
  }
}

/** Duplicate name (or an image already used by another category) → UniqueConstraintError → 409 via the error handler. */
export async function create(input: CategoryInput) {
  await assertImageExists(input.imageId);
  const category = await ProductCategory.create({ name: input.name, imageId: input.imageId ?? null });
  return getById(category.id);
}

/** A new image (or null) replaces the old one: its record and file are deleted. */
export async function update(id: number, changes: Partial<CategoryInput>) {
  const category = await ProductCategory.findByPk(id);
  if (!category) throw HttpError.notFound('Kategori produk tidak ditemukan');
  await assertImageExists(changes.imageId);

  const oldImageId = category.imageId;
  await category.update(changes);
  if (changes.imageId !== undefined) await imageService.removeReplaced(oldImageId, changes.imageId);
  return getById(id);
}

/**
 * A category still used by products can't be deleted → 409 STILL_IN_USE (the RESTRICT foreign key backs this up).
 * Its image (record + file) is deleted with it.
 */
export async function remove(id: number) {
  const category = await ProductCategory.findByPk(id);
  if (!category) throw HttpError.notFound('Kategori produk tidak ditemukan');
  const used = await Product.count({ where: { categoryId: id } });
  if (used > 0) {
    throw new HttpError(
      409,
      `Kategori masih dipakai oleh ${used} produk sehingga tidak dapat dihapus. Pindahkan produknya ke kategori lain terlebih dahulu`,
      'STILL_IN_USE',
      { productCount: used },
    );
  }
  const { imageId } = category;
  await category.destroy();
  if (imageId) await imageService.removeReplaced(imageId, null);
}
