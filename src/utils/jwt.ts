import { randomUUID } from 'node:crypto';
import jwt, { type SignOptions } from 'jsonwebtoken';
import { env } from '../config/env';
import type { Role } from '../constants/roles';

export interface AccessTokenPayload {
  sub: string; // user id
  role: Role;
}

/** Carried over when a session is renewed, so every token of one login belongs together */
export interface SessionInfo {
  /** The session's id: the `jti` of the token issued at login. Logging out revokes it for all of them. */
  jti: string;
  /** When the login happened (seconds since 1970): renewing stops at the maximum session length */
  startedAt: number;
}

/** A verified token: our payload plus the standard claims added when signing. */
export interface VerifiedAccessToken extends AccessTokenPayload {
  /**
   * The session's id, the same in every token renewed from one login; used to revoke them all on logout
   * (missing on tokens issued before logout existed).
   */
  jti?: string;
  /** Session start: when the login happened, in seconds (missing on tokens from before sessions could be renewed) */
  sst?: number;
  iat: number;
  exp: number;
}

/**
 * A token valid for JWT_EXPIRES_IN from now. Without `session` it starts a new session (login); with it, it
 * continues that one (POST /api/auth/refresh): same id and start, a new end.
 */
export function signAccessToken(payload: AccessTokenPayload, session?: SessionInfo): string {
  return jwt.sign({ ...payload, sst: session?.startedAt ?? Math.floor(Date.now() / 1000) }, env.jwt.secret, {
    expiresIn: env.jwt.expiresIn as SignOptions['expiresIn'],
    algorithm: 'HS256',
    jwtid: session?.jti ?? randomUUID(),
  });
}

/** Throws jsonwebtoken errors (TokenExpiredError, JsonWebTokenError) on invalid tokens. */
export function verifyAccessToken(token: string): VerifiedAccessToken {
  return jwt.verify(token, env.jwt.secret, { algorithms: ['HS256'] }) as VerifiedAccessToken;
}
