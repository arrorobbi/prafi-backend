import type { RequestHandler } from 'express';
import { READABLE_ROLES } from '../constants/roles';
import { HttpError } from '../errors/HttpError';

/**
 * Decides which accounts the logged-in user may read and stores it in `req.readableRoles`.
 * superadmin → all roles, disnakertrans → admin only, admin → tenant only, tenant → 403 (tenants only have /api/auth/me).
 * Must be used after `authenticate`.
 */
export const scopeReadableRoles: RequestHandler = (req, _res, next) => {
  if (!req.user) throw HttpError.unauthorized();

  const readableRoles = READABLE_ROLES[req.user.role];
  if (!readableRoles.length) {
    throw HttpError.forbidden('Anda tidak memiliki izin untuk melihat akun lain, gunakan /api/auth/me');
  }

  req.readableRoles = readableRoles;
  next();
};
