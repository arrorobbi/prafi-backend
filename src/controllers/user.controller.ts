import type { RequestHandler } from 'express';
import type { Role } from '../constants/roles';
import { HttpError } from '../errors/HttpError';
import * as userService from '../services/user.service';

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

/** GET /api/users?role=&page=&limit= — superadmin sees every account, admin sees tenants only. */
export const list: RequestHandler = async (req, res) => {
  const readableRoles = req.readableRoles!;
  const { role, page = '1', limit = String(DEFAULT_LIMIT) } = req.query as Record<string, string | undefined>;

  const errors: { field: string; message: string }[] = [];
  if (role !== undefined && !readableRoles.includes(role as Role)) {
    errors.push({ field: 'role', message: `role harus salah satu dari: ${readableRoles.join(', ')}` });
  }
  const pageNum = Number(page);
  if (!Number.isInteger(pageNum) || pageNum < 1) {
    errors.push({ field: 'page', message: 'page harus berupa bilangan bulat positif' });
  }
  const limitNum = Number(limit);
  if (!Number.isInteger(limitNum) || limitNum < 1 || limitNum > MAX_LIMIT) {
    errors.push({ field: 'limit', message: `limit harus berupa bilangan bulat antara 1 dan ${MAX_LIMIT}` });
  }
  if (errors.length) throw HttpError.badRequest('Validasi gagal', errors);

  const { users, meta } = await userService.list({
    readableRoles,
    role: role as Role | undefined,
    page: pageNum,
    limit: limitNum,
  });
  res.json({ success: true, data: users, meta });
};
