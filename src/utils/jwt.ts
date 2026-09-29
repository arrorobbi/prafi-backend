import jwt, { type SignOptions } from 'jsonwebtoken';
import { env } from '../config/env';
import type { Role } from '../constants/roles';

export interface AccessTokenPayload {
  sub: string; // user id
  role: Role;
}

export function signAccessToken(payload: AccessTokenPayload): string {
  return jwt.sign(payload, env.jwt.secret, {
    expiresIn: env.jwt.expiresIn as SignOptions['expiresIn'],
    algorithm: 'HS256',
  });
}

/** Throws jsonwebtoken errors (TokenExpiredError, JsonWebTokenError) on invalid tokens. */
export function verifyAccessToken(token: string): AccessTokenPayload {
  return jwt.verify(token, env.jwt.secret, { algorithms: ['HS256'] }) as AccessTokenPayload;
}
