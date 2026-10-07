export const ROLES = {
  SUPERADMIN: 'superadmin',
  DISNAKERTRANS: 'disnakertrans',
  ADMIN: 'admin',
  TENANT: 'tenant',
} as const;

export type Role = (typeof ROLES)[keyof typeof ROLES];

export const ALL_ROLES: Role[] = Object.values(ROLES);

/**
 * Which roles each role is allowed to register (create) accounts for.
 * superadmin → disnakertrans. Admins and tenants sign up themselves (PUBLIC_REGISTRATION_ROLES).
 */
export const CREATABLE_ROLES: Record<Role, Role[]> = {
  [ROLES.SUPERADMIN]: [ROLES.DISNAKERTRANS],
  [ROLES.DISNAKERTRANS]: [],
  [ROLES.ADMIN]: [],
  [ROLES.TENANT]: [],
};

/** Roles anyone can sign up for without logging in (POST /api/auth/register/admin, /register/tenant). */
export const PUBLIC_REGISTRATION_ROLES: Role[] = [ROLES.ADMIN, ROLES.TENANT];

/** Roles allowed to register accounts of `role`, e.g. registrarsOf('disnakertrans') → ['superadmin']. */
export const registrarsOf = (role: Role): Role[] => ALL_ROLES.filter((r) => CREATABLE_ROLES[r].includes(role));

/**
 * Whether a newly registered account is activated (approval.isActive) right away.
 * Admins wait for a disnakertrans to activate them; everyone else is active immediately.
 * Every new account must also verify its email (user.mailActive) before using the API.
 */
export const ACTIVE_ON_REGISTRATION: Record<Role, boolean> = {
  [ROLES.SUPERADMIN]: true,
  [ROLES.DISNAKERTRANS]: true,
  [ROLES.ADMIN]: false,
  [ROLES.TENANT]: true,
};

/**
 * How a new account verifies its email: disnakertrans (created by a superadmin) gets an activation link,
 * self-registered admins and tenants get a 6-digit OTP.
 */
export const EMAIL_VERIFICATION_METHOD: Record<Role, 'link' | 'otp'> = {
  [ROLES.SUPERADMIN]: 'link',
  [ROLES.DISNAKERTRANS]: 'link',
  [ROLES.ADMIN]: 'otp',
  [ROLES.TENANT]: 'otp',
};

/** Which roles' accounts each role is allowed to list (GET /api/users). Tenants only have /api/auth/me. */
export const READABLE_ROLES: Record<Role, Role[]> = {
  [ROLES.SUPERADMIN]: ALL_ROLES,
  [ROLES.DISNAKERTRANS]: [ROLES.ADMIN],
  [ROLES.ADMIN]: [ROLES.TENANT],
  [ROLES.TENANT]: [],
};

/**
 * Which roles' accounts each role may activate/deactivate (PATCH /api/approvals/:id?type=user).
 * The superadmin is read-only: it creates disnakertrans accounts (active right away) but approves nobody.
 */
export const APPROVABLE_ROLES: Record<Role, Role[]> = {
  [ROLES.SUPERADMIN]: [],
  [ROLES.DISNAKERTRANS]: [ROLES.ADMIN],
  [ROLES.ADMIN]: [ROLES.TENANT],
  [ROLES.TENANT]: [],
};

/** Roles that can activate/deactivate at least one kind of account. */
export const USER_APPROVER_ROLES: Role[] = ALL_ROLES.filter((r) => APPROVABLE_ROLES[r].length > 0);

/** Only admins activate/deactivate products. */
export const PRODUCT_APPROVER_ROLES: Role[] = [ROLES.ADMIN];

/** Only tenants create/update/delete products, and only their own products. */
export const PRODUCT_OWNER_ROLES: Role[] = [ROLES.TENANT];

/** Roles that can read every product (tenants only see their own). */
export const PRODUCT_READ_ALL_ROLES: Role[] = [ROLES.SUPERADMIN, ROLES.DISNAKERTRANS, ROLES.ADMIN];

/** Only tenant users create/read/update/delete a tenant profile, and only their own (/api/tenants/me). */
export const TENANT_OWNER_ROLES: Role[] = [ROLES.TENANT];

/** Roles that can read every tenant profile (GET /api/tenants, GET /api/tenants/:id). */
export const TENANT_READ_ALL_ROLES: Role[] = [ROLES.SUPERADMIN, ROLES.DISNAKERTRANS, ROLES.ADMIN];

/** Roles that read tenant categories (the superadmin is read-only). */
export const TENANT_CATEGORY_READER_ROLES: Role[] = [ROLES.SUPERADMIN, ROLES.ADMIN];

/** Roles that create/update/delete tenant categories. */
export const TENANT_CATEGORY_MANAGER_ROLES: Role[] = [ROLES.ADMIN];

/** Only the superadmin reads the API request/error logs (GET /api/logs). */
export const LOG_READER_ROLES: Role[] = [ROLES.SUPERADMIN];
