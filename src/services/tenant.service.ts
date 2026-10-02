import type { Includeable, WhereOptions } from 'sequelize';
import { HttpError } from '../errors/HttpError';
import { Image, Tenant, TenantCategory, User } from '../models';
import type { AuthUser } from '../types/express';
import * as imageService from './image.service';
import { notify } from './notification.service';

export interface TenantInput {
  /** Optional on create: defaults to the owner's tenantName. */
  name: string;
  description: string;
  address: string;
  area: string;
  operationalHours: string;
  fbLink: string;
  whatsappLink: string;
  gmapsLink: string;
  /** Required: upload the logo first via POST /api/images. */
  logoId: number;
  categoryId: number;
}

export interface ListTenantsOptions {
  page: number;
  limit: number;
  categoryId?: number;
}

const tenantInclude = (withOwner: boolean): Includeable[] => [
  { association: 'logo' },
  { association: 'category', attributes: ['id', 'name'] },
  ...(withOwner ? [{ association: 'owner', attributes: ['id', 'firstName', 'lastName', 'email', 'tenantName'] }] : []),
];

const NO_PROFILE = 'Anda belum memiliki profil tenant, buat terlebih dahulu melalui POST /api/tenants/me';

async function assertLogoExists(logoId: number) {
  const image = await Image.findByPk(logoId, { attributes: ['id'] });
  if (!image) {
    throw HttpError.badRequest('Validasi gagal', [
      { field: 'logoId', message: 'Gambar tidak ditemukan, unggah logo terlebih dahulu melalui POST /api/images' },
    ]);
  }
}

async function assertCategoryExists(categoryId: number) {
  const category = await TenantCategory.findByPk(categoryId, { attributes: ['id'] });
  if (!category) {
    throw HttpError.badRequest('Validasi gagal', [{ field: 'categoryId', message: 'Kategori tenant tidak ditemukan' }]);
  }
}

const findOwn = (user: AuthUser) => Tenant.findOne({ where: { userId: user.id } });

// ---------- tenant: own profile ----------

export async function getMine(user: AuthUser) {
  const tenant = await Tenant.findOne({ where: { userId: user.id }, include: tenantInclude(false) });
  if (!tenant) throw HttpError.notFound(NO_PROFILE);
  return tenant;
}

/** One tenant profile per tenant user. */
export async function createMine(user: AuthUser, input: Omit<TenantInput, 'name'> & { name?: string }) {
  if (await findOwn(user)) {
    throw HttpError.conflict('Anda sudah memiliki profil tenant, ubah melalui PATCH /api/tenants/me');
  }
  await assertLogoExists(input.logoId);
  await assertCategoryExists(input.categoryId);

  const name = input.name ?? (await User.findByPk(user.id, { attributes: ['tenantName'] }))?.tenantName;
  if (!name) {
    throw HttpError.badRequest('Validasi gagal', [{ field: 'name', message: 'name wajib diisi' }]);
  }

  // logoId already used by another tenant → UniqueConstraintError → 409 via the error handler
  await Tenant.create({ ...input, name, userId: user.id });
  return getMine(user);
}

/** Replacing the logo deletes the old logo image (it belonged only to this tenant). */
export async function updateMine(user: AuthUser, changes: Partial<TenantInput>) {
  const tenant = await findOwn(user);
  if (!tenant) throw HttpError.notFound(NO_PROFILE);
  if (changes.logoId !== undefined) await assertLogoExists(changes.logoId);
  if (changes.categoryId !== undefined) await assertCategoryExists(changes.categoryId);

  const oldLogoId = tenant.logoId;
  await tenant.update(changes);
  if (changes.logoId !== undefined && changes.logoId !== oldLogoId) {
    await imageService.remove(oldLogoId).catch(() => {});
  }
  await notify.tenantProfileUpdated(tenant);
  return getMine(user);
}

/** Deletes the tenant profile and its logo (image + file). The user's products are not affected. */
export async function deleteMine(user: AuthUser) {
  const tenant = await findOwn(user);
  if (!tenant) throw HttpError.notFound(NO_PROFILE);

  const { logoId } = tenant;
  await tenant.destroy();
  await imageService.remove(logoId).catch(() => {});
}

// ---------- superadmin / admin: read all ----------

export async function list({ page, limit, categoryId }: ListTenantsOptions) {
  const where: WhereOptions = categoryId !== undefined ? { categoryId } : {};
  const { rows, count } = await Tenant.findAndCountAll({
    where,
    include: tenantInclude(true),
    order: [['createdAt', 'DESC']],
    limit,
    offset: (page - 1) * limit,
    distinct: true,
  });
  return { tenants: rows, meta: { page, limit, total: count, totalPages: Math.ceil(count / limit) } };
}

export async function getById(id: string) {
  const tenant = await Tenant.findByPk(id, { include: tenantInclude(true) });
  if (!tenant) throw HttpError.notFound('Tenant tidak ditemukan');
  return tenant;
}
