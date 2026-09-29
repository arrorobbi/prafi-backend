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

/** Roles that are allowed to register other users. */
export const REGISTRAR_ROLES: Role[] = ALL_ROLES.filter((role) => CREATABLE_ROLES[role].length > 0);

/** Which roles' accounts each role is allowed to list (GET /api/users). Tenants only have /api/auth/me. */
export const READABLE_ROLES: Record<Role, Role[]> = {
  [ROLES.SUPERADMIN]: ALL_ROLES,
  [ROLES.ADMIN]: [ROLES.TENANT],
  [ROLES.TENANT]: [],
};
