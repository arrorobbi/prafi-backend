import { literal, Op, type Includeable, type WhereOptions } from 'sequelize';
import { HttpError } from '../errors/HttpError';
import { Image, Tenant, User } from '../models';
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
  /** Optional (null = none) */
  instagramLink?: string | null;
  googleBusinessLink?: string | null;
  shopeeLink?: string | null;
  /** Required: upload the logo first via POST /api/images. */
  logoId: number;
}

export interface ListTenantsOptions {
  page: number;
  limit: number;
}

const tenantInclude = (withOwner: boolean): Includeable[] => [
  { association: 'logo' },
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

const findOwn = (user: AuthUser) => Tenant.findOne({ where: { userId: user.id } });

/** Every field a tenant profile needs before its owner can add products. */
const PROFILE_TEXT_FIELDS = [
  'name',
  'description',
  'address',
  'area',
  'operationalHours',
  'fbLink',
  'whatsappLink',
  'gmapsLink',
] as const;

/**
 * Required fields that are still blank. The optional links (Instagram, Google Bisnis, Shopee) never count.
 * `owner`: the tenant's own account also needs a profile photo (faceImageId) before products can be added.
 */
export function missingProfileFields(tenant: Tenant | null, owner?: { faceImageId: number | null } | null): string[] {
  const ownerMissing = owner && owner.faceImageId == null ? ['faceImageId'] : [];
  if (!tenant) return ['profile', ...ownerMissing];
  const missing: string[] = PROFILE_TEXT_FIELDS.filter((f) => !String(tenant[f] ?? '').trim());
  if (tenant.logoId == null) missing.push('logoId');
  return [...missing, ...ownerMissing];
}

const ownerOf = (user: AuthUser) => User.findByPk(user.id, { attributes: ['id', 'faceImageId'] });

/** Products can only be created once the tenant profile ("Profil UMKM") is complete and the account has a profile photo. */
export async function assertProfileComplete(user: AuthUser) {
  const missing = missingProfileFields(await findOwn(user), await ownerOf(user));
  if (missing.length) {
    const onlyPhoto = missing.length === 1 && missing[0] === 'faceImageId';
    throw new HttpError(
      403,
      onlyPhoto
        ? 'Unggah foto profil akun Anda terlebih dahulu (Pengaturan Akun) sebelum menambahkan produk'
        : missing.includes('profile')
          ? 'Buat profil UMKM (Profil Toko) terlebih dahulu sebelum menambahkan produk'
          : 'Lengkapi profil UMKM (Profil Toko) dan data akun Anda terlebih dahulu sebelum menambahkan produk',
      'TENANT_PROFILE_INCOMPLETE',
      { missingFields: missing },
    );
  }
}

// ---------- tenant: own profile ----------

/** The profile plus isComplete / missingFields, so the frontend knows whether products can be added. */
export async function getMine(user: AuthUser) {
  const tenant = await Tenant.findOne({ where: { userId: user.id }, include: tenantInclude(false) });
  if (!tenant) throw HttpError.notFound(NO_PROFILE);
  const missingFields = missingProfileFields(tenant, await ownerOf(user));
  return { ...tenant.toJSON(), isComplete: missingFields.length === 0, missingFields };
}

/** One tenant profile per tenant user. */
export async function createMine(user: AuthUser, input: Omit<TenantInput, 'name'> & { name?: string }) {
  if (await findOwn(user)) {
    throw HttpError.conflict('Anda sudah memiliki profil tenant, ubah melalui PATCH /api/tenants/me');
  }
  await assertLogoExists(input.logoId);

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

  const oldLogoId = tenant.logoId;
  await tenant.update(changes);
  // A new logo replaces the old one: its record and file are deleted
  if (changes.logoId !== undefined) await imageService.removeReplaced(oldLogoId, changes.logoId);
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

export async function list({ page, limit }: ListTenantsOptions) {
  const { rows, count } = await Tenant.findAndCountAll({
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

// ---------- public (landing page, no login) ----------

/** Approved products only, matched on the owner (products belong to the tenant user). */
const ACTIVE_PRODUCTS = `FROM products p JOIN approvals a ON a.id = p.approval_id
  WHERE p.tenant_id = "Tenant"."user_id" AND a.is_active = true`;

/** Public-safe: no owner email/phone. productCount, ratingAverage and reviewCount cover approved products. */
const PUBLIC_ATTRIBUTES = {
  include: [
    [literal(`(SELECT COUNT(*)::int ${ACTIVE_PRODUCTS})`), 'productCount'],
    [literal(`(SELECT ROUND(AVG(r.stars)::numeric, 1)::float FROM reviews r WHERE r.product_id IN (SELECT p.id ${ACTIVE_PRODUCTS}))`), 'ratingAverage'],
    [literal(`(SELECT COUNT(*)::int FROM reviews r WHERE r.product_id IN (SELECT p.id ${ACTIVE_PRODUCTS}))`), 'reviewCount'],
  ] as [ReturnType<typeof literal>, string][],
};

/** Only UMKM whose owner account is active are public. */
const PUBLIC_INCLUDE: Includeable[] = [
  { association: 'logo', attributes: ['id', 'imgUrl', 'url', 'altText'] },
  {
    association: 'owner',
    attributes: ['id', 'tenantName'],
    required: true,
    include: [{ association: 'approval', attributes: [], where: { isActive: true }, required: true }],
  },
];

export interface ListPublicTenantsOptions {
  page: number;
  limit: number;
  /** Part of the UMKM name, case-insensitive */
  q?: string;
}

export async function listPublic({ page, limit, q }: ListPublicTenantsOptions) {
  const where: WhereOptions = {
    ...(q && { name: { [Op.iLike]: `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%` } }),
  };
  const { rows, count } = await Tenant.findAndCountAll({
    where,
    attributes: PUBLIC_ATTRIBUTES,
    include: PUBLIC_INCLUDE,
    order: [['name', 'ASC']],
    limit,
    offset: (page - 1) * limit,
    distinct: true,
  });
  return { tenants: rows, meta: { page, limit, total: count, totalPages: Math.ceil(count / limit) } };
}

/** By the profile's id or its owner's user id (product.tenant.id), so product pages can link straight here. */
export async function getPublic(id: string) {
  const tenant = await Tenant.findOne({
    where: { [Op.or]: [{ id }, { userId: id }] },
    attributes: PUBLIC_ATTRIBUTES,
    include: PUBLIC_INCLUDE,
  });
  if (!tenant) throw HttpError.notFound('UMKM tidak ditemukan');
  return tenant;
}
