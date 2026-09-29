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
      /** Set by the `scopeReadableRoles` middleware: roles whose accounts this user may see. */
      readableRoles?: Role[];
    }
  }
}
