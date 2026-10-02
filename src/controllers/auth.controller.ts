import type { RequestHandler } from 'express';
import { ROLES, type Role } from '../constants/roles';
import { HttpError } from '../errors/HttpError';
import * as authService from '../services/auth.service';

const MIN_PASSWORD_LENGTH = 8;

export const login: RequestHandler = async (req, res) => {
  const { email, password } = (req.body ?? {}) as { email?: unknown; password?: unknown };

  const errors: { field: string; message: string }[] = [];
  if (typeof email !== 'string' || !email.trim()) errors.push({ field: 'email', message: 'Email wajib diisi' });
  if (typeof password !== 'string' || !password) errors.push({ field: 'password', message: 'Password wajib diisi' });
  if (errors.length) throw HttpError.badRequest('Validasi gagal', errors);

  const result = await authService.login(email as string, password as string);
  res.json({ success: true, data: result });
};

/**
 * Registration for one role; the URL decides the role, so the body doesn't need `role`.
 * POST /api/auth/register/admin  — admin starts inactive until a superadmin activates it
 * POST /api/auth/register/tenant — public sign-up (no token), tenant is active right away
 */
const registerAs =
  (role: Role): RequestHandler =>
  async (req, res) => {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const errors: { field: string; message: string }[] = [];

    for (const field of ['firstName', 'lastName', 'phoneNumber', 'email', 'password'] as const) {
      if (typeof body[field] !== 'string' || !(body[field] as string).trim()) {
        errors.push({ field, message: `${field} wajib diisi` });
      }
    }
    if (typeof body.password === 'string' && body.password.length < MIN_PASSWORD_LENGTH) {
      errors.push({ field: 'password', message: `password minimal ${MIN_PASSWORD_LENGTH} karakter` });
    }
    if (body.role !== undefined && body.role !== role) {
      errors.push({ field: 'role', message: `endpoint ini hanya membuat akun ${role}, gunakan POST /api/auth/register/${body.role}` });
    }
    const faceImageId = body.faceImageId ?? null;
    if (faceImageId !== null && !Number.isInteger(faceImageId)) {
      errors.push({ field: 'faceImageId', message: 'faceImageId harus berupa ID gambar (bilangan bulat)' });
    }
    // Every tenant must have a tenant name; other roles don't have one
    const isTenant = role === ROLES.TENANT;
    if (isTenant && (typeof body.tenantName !== 'string' || !body.tenantName.trim())) {
      errors.push({ field: 'tenantName', message: 'tenantName wajib diisi untuk akun tenant' });
    }
    if (!isTenant && body.tenantName !== undefined) {
      errors.push({ field: 'tenantName', message: 'tenantName hanya digunakan untuk akun tenant' });
    }
    if (errors.length) throw HttpError.badRequest('Validasi gagal', errors);

    // No req.user on the public tenant sign-up route
    const user = await authService.register(req.user ?? null, {
      firstName: (body.firstName as string).trim(),
      lastName: (body.lastName as string).trim(),
      phoneNumber: (body.phoneNumber as string).trim(),
      email: body.email as string,
      password: body.password as string,
      role,
      faceImageId: faceImageId as number | null,
      ...(isTenant && { tenantName: (body.tenantName as string).trim() }),
    });
    res.status(201).json({ success: true, data: user });
  };

export const registerAdmin = registerAs(ROLES.ADMIN);
export const registerTenant = registerAs(ROLES.TENANT);

/** The old single endpoint: point clients to the new ones instead of a plain 404. */
export const registerMoved: RequestHandler = () => {
  throw new HttpError(
    410,
    'Endpoint ini telah dipisah: gunakan POST /api/auth/register/admin atau POST /api/auth/register/tenant',
    'ENDPOINT_MOVED',
  );
};

/** POST /api/auth/logout — revokes the token sent with this request. */
export const logout: RequestHandler = async (req, res) => {
  await authService.logout(req.user!, req.accessToken!);
  res.json({ success: true, data: { message: 'Berhasil logout, token ini tidak dapat digunakan lagi' } });
};

export const me: RequestHandler = async (req, res) => {
  const user = await authService.getProfile(req.user!.id);
  res.json({ success: true, data: user });
};

const UPDATABLE_TEXT_FIELDS = ['firstName', 'lastName', 'phoneNumber', 'email'] as const;
const UPDATABLE_FIELDS = [...UPDATABLE_TEXT_FIELDS, 'password', 'currentPassword', 'faceImageId', 'tenantName'];
const LOCKED_FIELDS: Record<string, string> = {
  id: 'id tidak dapat diubah',
  role: 'role tidak dapat diubah',
  createdAt: 'createdAt diatur oleh server',
  updatedAt: 'updatedAt diatur oleh server',
};

/** PATCH /api/auth/me — the logged-in user updates their own account. Send only the fields to change. */
export const updateMe: RequestHandler = async (req, res) => {
  const body = (req.body ?? {}) as Record<string, unknown>;
  const errors: { field: string; message: string }[] = [];

  for (const field of Object.keys(body)) {
    if (LOCKED_FIELDS[field]) errors.push({ field, message: LOCKED_FIELDS[field] });
    else if (!UPDATABLE_FIELDS.includes(field)) errors.push({ field, message: `${field} bukan field yang dapat diubah` });
  }

  const input: authService.UpdateProfileInput = {};
  for (const field of UPDATABLE_TEXT_FIELDS) {
    if (body[field] === undefined) continue;
    if (typeof body[field] !== 'string' || !(body[field] as string).trim()) {
      errors.push({ field, message: `${field} tidak boleh kosong` });
    } else {
      input[field] = (body[field] as string).trim();
    }
  }

  if (body.password !== undefined) {
    if (typeof body.password !== 'string' || body.password.length < MIN_PASSWORD_LENGTH) {
      errors.push({ field: 'password', message: `password minimal ${MIN_PASSWORD_LENGTH} karakter` });
    } else if (typeof body.currentPassword !== 'string' || !body.currentPassword) {
      errors.push({ field: 'currentPassword', message: 'currentPassword wajib diisi untuk mengganti password' });
    } else {
      input.password = body.password;
      input.currentPassword = body.currentPassword;
    }
  }

  if (body.faceImageId !== undefined) {
    if (body.faceImageId !== null && !Number.isInteger(body.faceImageId)) {
      errors.push({ field: 'faceImageId', message: 'faceImageId harus berupa ID gambar (bilangan bulat), atau null untuk menghapusnya' });
    } else {
      input.faceImageId = body.faceImageId as number | null;
    }
  }

  if (body.tenantName !== undefined) {
    if (req.user!.role !== ROLES.TENANT) {
      errors.push({ field: 'tenantName', message: 'Hanya akun tenant yang memiliki tenantName' });
    } else if (typeof body.tenantName !== 'string' || !body.tenantName.trim()) {
      errors.push({ field: 'tenantName', message: 'tenantName tidak boleh kosong' });
    } else {
      input.tenantName = body.tenantName.trim();
    }
  }

  if (errors.length) throw HttpError.badRequest('Validasi gagal', errors);
  if (Object.keys(input).length === 0) {
    throw HttpError.badRequest(`Kirim minimal satu field untuk diubah: ${UPDATABLE_FIELDS.filter((f) => f !== 'currentPassword').join(', ')}`);
  }

  const user = await authService.updateProfile(req.user!.id, input);
  res.json({ success: true, data: user });
};
