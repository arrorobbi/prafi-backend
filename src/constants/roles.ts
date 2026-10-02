export const ROLES = {
  SUPERADMIN: 'superadmin',
  ADMIN: 'admin',
  TENANT: 'tenant',
} as const;

export type Role = (typeof ROLES)[keyof typeof ROLES];

export const ALL_ROLES: Role[] = Object.values(ROLES);

/** Which roles each role is allowed to register (create) accounts for. */
export const CREATABLE_ROLES: Record<Role, Role[]> = {
  [ROLES.SUPERADMIN]: [ROLES.ADMIN],
  [ROLES.ADMIN]: [ROLES.TENANT],
  [ROLES.TENANT]: [],
};

/** Roles anyone can sign up for without logging in (POST /api/auth/register/tenant). */
export const PUBLIC_REGISTRATION_ROLES: Role[] = [ROLES.TENANT];

/** Roles allowed to register accounts of `role`, e.g. registrarsOf('admin') → ['superadmin']. */
export const registrarsOf = (role: Role): Role[] => ALL_ROLES.filter((r) => CREATABLE_ROLES[r].includes(role));

/**
 * Whether a newly registered account can log in right away.
 * Admins wait for a superadmin to activate them; tenants are active immediately.
 */
export const ACTIVE_ON_REGISTRATION: Record<Role, boolean> = {
  [ROLES.SUPERADMIN]: true,
  [ROLES.ADMIN]: false,
  [ROLES.TENANT]: true,
};

/** Which roles' accounts each role is allowed to list (GET /api/users). Tenants only have /api/auth/me. */
export const READABLE_ROLES: Record<Role, Role[]> = {
  [ROLES.SUPERADMIN]: ALL_ROLES,
  [ROLES.ADMIN]: [ROLES.TENANT],
  [ROLES.TENANT]: [],
};

/** Which roles' accounts each role may activate/deactivate (PATCH /api/approvals/:id?type=user). */
export const APPROVABLE_ROLES: Record<Role, Role[]> = {
  [ROLES.SUPERADMIN]: [ROLES.ADMIN, ROLES.TENANT],
  [ROLES.ADMIN]: [ROLES.TENANT],
  [ROLES.TENANT]: [],
};

/** Only admins activate/deactivate products; superadmins can read products but not change their activation. */
export const PRODUCT_APPROVER_ROLES: Role[] = [ROLES.ADMIN];

/** Only tenants create/update/delete products, and only their own products. */
export const PRODUCT_OWNER_ROLES: Role[] = [ROLES.TENANT];

/** Roles that can read every product (tenants only see their own). */
export const PRODUCT_READ_ALL_ROLES: Role[] = [ROLES.SUPERADMIN, ROLES.ADMIN];

/** Only tenant users create/read/update/delete a tenant profile, and only their own (/api/tenants/me). */
export const TENANT_OWNER_ROLES: Role[] = [ROLES.TENANT];

/** Roles that can read every tenant profile (GET /api/tenants, GET /api/tenants/:id). */
export const TENANT_READ_ALL_ROLES: Role[] = [ROLES.SUPERADMIN, ROLES.ADMIN];

/** Roles that create/read/update/delete tenant categories (/api/tenant-categories). */
export const TENANT_CATEGORY_MANAGER_ROLES: Role[] = [ROLES.SUPERADMIN, ROLES.ADMIN];
