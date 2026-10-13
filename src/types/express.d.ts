import type { Role } from '../constants/roles';

export interface AuthUser {
  id: string;
  email: string;
  role: Role;
}

declare global {
  namespace Express {
    interface Request {
      /** Set by the `authenticate` middleware. */
      user?: AuthUser;
      /** Set by the `authenticate` middleware: the access token used for this request (for logout and renewing). */
      accessToken?: { jti?: string; expiresAt: Date; sessionStartedAt: Date };
      /** Set by the `scopeReadableRoles` middleware: roles whose accounts this user may see. */
      readableRoles?: Role[];
    }
  }
}
