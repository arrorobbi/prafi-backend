import { randomUUID } from 'node:crypto';
import jwt, { type SignOptions } from 'jsonwebtoken';
import { env } from '../config/env';
import type { Role } from '../constants/roles';

export interface AccessTokenPayload {
  sub: string; // user id
  role: Role;
}

/** A verified token: our payload plus the standard claims added when signing. */
export interface VerifiedAccessToken extends AccessTokenPayload {
  /** Unique token id, used to revoke this token on logout (missing on tokens issued before logout existed). */
  jti?: string;
  iat: number;
  exp: number;
}

export function signAccessToken(payload: AccessTokenPayload): string {
  return jwt.sign(payload, env.jwt.secret, {
    expiresIn: env.jwt.expiresIn as SignOptions['expiresIn'],
    algorithm: 'HS256',
    jwtid: randomUUID(),
  });
}

/** Throws jsonwebtoken errors (TokenExpiredError, JsonWebTokenError) on invalid tokens. */
export function verifyAccessToken(token: string): VerifiedAccessToken {
  return jwt.verify(token, env.jwt.secret, { algorithms: ['HS256'] }) as VerifiedAccessToken;
}
