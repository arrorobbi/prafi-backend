import type { RequestHandler } from 'express';
import { JsonWebTokenError, TokenExpiredError } from 'jsonwebtoken';
import { env } from '../config/env';
import type { Role } from '../constants/roles';
import { HttpError } from '../errors/HttpError';
import { RevokedToken, User } from '../models';
import { verifyAccessToken } from '../utils/jwt';

/**
 * Verifies the `Authorization: Bearer <token>` header and attaches the user to `req.user`.
 * The user is re-loaded from the database so deleted users or changed roles take effect immediately.
 */
export const authenticate: RequestHandler = async (req, _res, next) => {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    throw HttpError.unauthorized('Missing or malformed Authorization header');
  }

  const token = header.slice('Bearer '.length).trim();

  // A Postman/Insomnia variable that was never set is sent as literal text, e.g. "{{tenantToken}}"
  if (/^\{\{.+\}\}$/.test(token)) {
    throw HttpError.unauthorized(`Token variable ${token} is not set, log in first so it gets saved`);
  }

  let payload;
  try {
    payload = verifyAccessToken(token);
  } catch (err) {
    if (err instanceof TokenExpiredError) throw HttpError.unauthorized('Token has expired');
    if (err instanceof JsonWebTokenError) {
      // In development, say why (e.g. "jwt malformed" = not a JWT at all, "invalid signature" = wrong secret)
      throw HttpError.unauthorized(env.isProduction ? 'Invalid token' : `Invalid token (${err.message})`);
    }
    throw err;
  }

  // Tokens that were logged out stay invalid until they would have expired anyway
  if (payload.jti && (await RevokedToken.findByPk(payload.jti, { attributes: ['jti'] }))) {
    throw HttpError.unauthorized('Token has been revoked (logged out), log in again');
  }

  const user = await User.findByPk(payload.sub, {
    attributes: ['id', 'email', 'role'],
    include: [{ association: 'approval', attributes: ['isActive'] }],
  });
  if (!user) throw HttpError.unauthorized('User no longer exists');

  // Only activated accounts may use the API (no approval yet counts as not activated)
  if (user.approval?.isActive !== true) {
    throw HttpError.notActivated();
  }

  req.user = { id: user.id, email: user.email, role: user.role };
  req.accessToken = { jti: payload.jti, expiresAt: new Date(payload.exp * 1000) };
  next();
};

/**
 * Restricts a route to the given roles. Must be used after `authenticate`.
 * @example router.get('/admin', authenticate, authorize(ROLES.ADMIN), handler)
 */
export const authorize =
  (...allowedRoles: Role[]): RequestHandler =>
  (req, _res, next) => {
    if (!req.user) throw HttpError.unauthorized();
    if (!allowedRoles.includes(req.user.role)) {
      throw HttpError.forbidden('You do not have permission to access this resource');
    }
    next();
  };
