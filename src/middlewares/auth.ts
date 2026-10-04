import type { RequestHandler } from 'express';
import { JsonWebTokenError, TokenExpiredError } from 'jsonwebtoken';
import { env } from '../config/env';
import type { Role } from '../constants/roles';
import { HttpError } from '../errors/HttpError';
import { RevokedToken, User } from '../models';
import type { AuthUser } from '../types/express';
import { verifyAccessToken } from '../utils/jwt';

/**
 * Verifies the `Authorization: Bearer <token>` header and attaches the user to `req.user`.
 * The user is re-loaded from the database so deleted users or changed roles take effect immediately.
 */
export const authenticate: RequestHandler = async (req, _res, next) => {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    throw HttpError.unauthorized('Header Authorization tidak ada atau formatnya salah (gunakan: Bearer <token>)');
  }

  const { user, token } = await verifyAccess(header.slice('Bearer '.length).trim());
  req.user = user;
  req.accessToken = token;
  next();
};

/**
 * All checks for an access token, shared by HTTP requests and WebSocket connections:
 * valid signature, not expired, not logged out, user still exists, email verified and activated.
 * Throws HttpError (401/403) otherwise.
 */
export async function verifyAccess(token: string): Promise<{ user: AuthUser; token: { jti?: string; expiresAt: Date } }> {
  // A Postman/Insomnia variable that was never set is sent as literal text, e.g. "{{tenantToken}}"
  if (/^\{\{.+\}\}$/.test(token)) {
    throw HttpError.unauthorized(`Variabel token ${token} belum diisi, login terlebih dahulu agar token tersimpan`);
  }

  let payload;
  try {
    payload = verifyAccessToken(token);
  } catch (err) {
    if (err instanceof TokenExpiredError) throw HttpError.unauthorized('Token sudah kedaluwarsa, silakan login kembali');
    if (err instanceof JsonWebTokenError) {
      // In development, say why (e.g. "jwt malformed" = not a JWT at all, "invalid signature" = wrong secret)
      throw HttpError.unauthorized(env.isProduction ? 'Token tidak valid' : `Token tidak valid (${err.message})`);
    }
    throw err;
  }

  // Tokens that were logged out stay invalid until they would have expired anyway
  if (payload.jti && (await RevokedToken.findByPk(payload.jti, { attributes: ['jti'] }))) {
    throw HttpError.unauthorized('Token sudah tidak berlaku (sudah logout), silakan login kembali');
  }

  const user = await User.findByPk(payload.sub, {
    attributes: ['id', 'email', 'role', 'mailActive'],
    include: [{ association: 'approval', attributes: ['isActive'] }],
  });
  if (!user) throw HttpError.unauthorized('Pengguna sudah tidak ada');

  // Only accounts with a verified email may use the API
  if (!user.mailActive) throw HttpError.emailNotVerified({ userId: user.id });

  // Only activated accounts may use the API (no approval yet counts as not activated)
  if (user.approval?.isActive !== true) {
    throw HttpError.notActivated();
  }

  return {
    user: { id: user.id, email: user.email, role: user.role },
    token: { jti: payload.jti, expiresAt: new Date(payload.exp * 1000) },
  };
}

/**
 * Restricts a route to the given roles. Must be used after `authenticate`.
 * @example router.get('/admin', authenticate, authorize(ROLES.ADMIN), handler)
 */
export const authorize =
  (...allowedRoles: Role[]): RequestHandler =>
  (req, _res, next) => {
    if (!req.user) throw HttpError.unauthorized();
    if (!allowedRoles.includes(req.user.role)) {
      throw HttpError.forbidden('Anda tidak memiliki izin untuk mengakses data ini');
    }
    next();
  };
