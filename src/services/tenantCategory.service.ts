import { HttpError } from '../errors/HttpError';
import { TenantCategory } from '../models';

export interface ListCategoriesOptions {
  page: number;
  limit: number;
}

export async function list({ page, limit }: ListCategoriesOptions) {
  const { rows, count } = await TenantCategory.findAndCountAll({
    order: [['name', 'ASC']],
    limit,
    offset: (page - 1) * limit,
  });
  return { categories: rows, meta: { page, limit, total: count, totalPages: Math.ceil(count / limit) } };
}

export async function getById(id: number) {
  const category = await TenantCategory.findByPk(id);
  if (!category) throw HttpError.notFound('Kategori tenant tidak ditemukan');
  return category;
}

/** Duplicate name → UniqueConstraintError → 409 via the error handler. */
export async function create(name: string) {
  return TenantCategory.create({ name });
}

export async function update(id: number, name: string) {
  const category = await getById(id);
  return category.update({ name });
}

/** A category still used by tenants can't be deleted (RESTRICT) → 409 STILL_IN_USE via the error handler. */
export async function remove(id: number) {
  const category = await getById(id);
  await category.destroy();
}
