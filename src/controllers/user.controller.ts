import type { RequestHandler } from 'express';
import type { Role } from '../constants/roles';
import { HttpError } from '../errors/HttpError';
import * as userService from '../services/user.service';

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

/**
 * GET /api/users?role=&q=&emailIssue=&page=&limit= — superadmin sees every account, disnakertrans admins, admin
 * tenants (with their shop profile). `q` searches name, email, phone and store name; `emailIssue=true` lists only
 * accounts whose emails did not arrive.
 */
export const list: RequestHandler = async (req, res) => {
  const readableRoles = req.readableRoles!;
  const { role, q, emailIssue, page = '1', limit = String(DEFAULT_LIMIT) } = req.query as Record<string, string | undefined>;

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
  if (q !== undefined && q.length > 100) errors.push({ field: 'q', message: 'q maksimal 100 karakter' });
  if (emailIssue !== undefined && !['true', 'false'].includes(emailIssue)) {
    errors.push({ field: 'emailIssue', message: 'emailIssue harus true atau false' });
  }
  if (errors.length) throw HttpError.badRequest('Validasi gagal', errors);

  const { users, meta } = await userService.list({
    readableRoles,
    role: role as Role | undefined,
    q: q?.trim() || undefined,
    emailIssue: emailIssue === 'true',
    page: pageNum,
    limit: limitNum,
  });
  res.json({ success: true, data: users, meta });
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * PATCH /api/users/:id/email { email } — admin: corrects a seller's email. The seller must confirm the new address
 * (one click on the link sent there) before logging in again; the old address gets a notice.
 */
export const changeEmail: RequestHandler = async (req, res) => {
  const { email } = (req.body ?? {}) as { email?: unknown };
  if (typeof email !== 'string' || !EMAIL_RE.test(email.trim()) || email.trim().length > 255) {
    throw HttpError.badRequest('Validasi gagal', [{ field: 'email', message: 'email harus berupa alamat email yang valid' }]);
  }
  const { user, verification } = await userService.changeTenantEmail(String(req.params.id), email);
  res.json({
    success: true,
    message: verification.emailSent
      ? `Email diubah. Tautan konfirmasi dikirim ke ${user.email}; penjual harus mengekliknya sebelum dapat login kembali.`
      : `Email diubah, tetapi tautan konfirmasi gagal dikirim ke ${user.email}. Penjual dapat meminta tautan baru saat login.`,
    data: { user, verification },
  });
};
