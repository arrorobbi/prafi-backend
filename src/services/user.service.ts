import type { Role } from '../constants/roles';
import { User } from '../models';

export interface ListUsersOptions {
  /** Roles the requester may see (from the `scopeReadableRoles` middleware). */
  readableRoles: Role[];
  /** Optional filter; must be one of `readableRoles`. */
  role?: Role;
  page: number;
  limit: number;
}

export async function list({ readableRoles, role, page, limit }: ListUsersOptions) {
  const { rows, count } = await User.findAndCountAll({
    where: { role: role ?? readableRoles },
    include: [{ association: 'faceImage' }],
    order: [['createdAt', 'DESC']],
    limit,
    offset: (page - 1) * limit,
  });

  return {
    users: rows,
    meta: { page, limit, total: count, totalPages: Math.ceil(count / limit) },
  };
}
