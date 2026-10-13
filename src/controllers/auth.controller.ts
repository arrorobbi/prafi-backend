import type { RequestHandler } from 'express';
import { ROLES, type Role } from '../constants/roles';
import { HttpError } from '../errors/HttpError';
import * as authService from '../services/auth.service';
import * as emailVerification from '../services/emailVerification.service';
import * as passwordReset from '../services/passwordReset.service';
import { clientIp } from '../utils/clientIp';

const MIN_PASSWORD_LENGTH = 8;

export const login: RequestHandler = async (req, res) => {
  const { email, password } = (req.body ?? {}) as { email?: unknown; password?: unknown };

  const errors: { field: string; message: string }[] = [];
  if (typeof email !== 'string' || !email.trim()) errors.push({ field: 'email', message: 'Email wajib diisi' });
  if (typeof password !== 'string' || !password) errors.push({ field: 'password', message: 'Password wajib diisi' });
  if (errors.length) throw HttpError.badRequest('Validasi gagal', errors);

  const result = await authService.login(email as string, password as string, clientIp(req));
  res.json({ success: true, data: result });
};

/**
 * Registration for one role; the URL decides the role, so the body doesn't need `role`.
 * POST /api/auth/register/disnakertrans — superadmin only; active right away. No password in the body: a temporary
 *   one is emailed with the activation link, and the owner replaces it there (POST /api/auth/activate)
 * POST /api/auth/register/admin  — public sign-up; inactive until a disnakertrans activates it, verifies with an OTP
 * POST /api/auth/register/tenant — public sign-up; active right away, verifies with an OTP
 * Every new account has mailActive = false until its email is verified.
 */
const registerAs =
  (role: Role): RequestHandler =>
  async (req, res) => {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const errors: { field: string; message: string }[] = [];

    // Disnakertrans accounts get a temporary password by email; nobody chooses one for them
    const needsPassword = role !== ROLES.DISNAKERTRANS;
    for (const field of ['firstName', 'lastName', 'phoneNumber', 'email', ...(needsPassword ? (['password'] as const) : [])] as const) {
      if (typeof body[field] !== 'string' || !(body[field] as string).trim()) {
        errors.push({ field, message: `${field} wajib diisi` });
      }
    }
    if (needsPassword && typeof body.password === 'string' && body.password.length < MIN_PASSWORD_LENGTH) {
      errors.push({ field: 'password', message: `password minimal ${MIN_PASSWORD_LENGTH} karakter` });
    }
    if (!needsPassword && body.password !== undefined) {
      errors.push({ field: 'password', message: 'password tidak diisi untuk akun disnakertrans: kata sandi sementara dibuat otomatis dan dikirim ke email akun tersebut' });
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

    // No req.user on the public sign-up routes
    const { user, verification } = await authService.register(req.user ?? null, {
      firstName: (body.firstName as string).trim(),
      lastName: (body.lastName as string).trim(),
      phoneNumber: (body.phoneNumber as string).trim(),
      email: body.email as string,
      ...(needsPassword && { password: body.password as string }),
      role,
      faceImageId: faceImageId as number | null,
      ...(isTenant && { tenantName: (body.tenantName as string).trim() }),
    });
    res.status(201).json({ success: true, data: user, meta: { verification } });
  };

export const registerDisnakertrans = registerAs(ROLES.DISNAKERTRANS);
export const registerAdmin = registerAs(ROLES.ADMIN);
export const registerTenant = registerAs(ROLES.TENANT);

/** The old single endpoint: point clients to the new ones instead of a plain 404. */
export const registerMoved: RequestHandler = () => {
  throw new HttpError(
    410,
    'Endpoint ini telah dipisah: gunakan POST /api/auth/register/admin, /register/tenant, atau /register/disnakertrans',
    'ENDPOINT_MOVED',
  );
};

/** POST /api/auth/logout — revokes the token sent with this request. */
export const logout: RequestHandler = async (req, res) => {
  await authService.logout(req.user!, req.accessToken!);
  res.json({ success: true, data: { message: 'Berhasil logout, token ini tidak dapat digunakan lagi' } });
};

/** POST /api/auth/refresh — a token that lasts JWT_EXPIRES_IN from now, for the same session (sliding session). */
export const refresh: RequestHandler = (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json({ success: true, data: authService.refreshSession(req.user!, req.accessToken!) });
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
  mailActive: 'mailActive hanya berubah melalui verifikasi email',
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

// ---------- email verification (public: the user can't log in until the email is verified) ----------

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function parseUserId(value: unknown) {
  const id = String(value);
  if (!UUID_RE.test(id)) throw HttpError.badRequest('Validasi gagal', [{ field: 'userId', message: 'userId harus berupa UUID yang valid' }]);
  return id;
}

/** POST /api/auth/verify-otp/:userId — body { "otp": "123456" } (admin, tenant). */
export const verifyOtp: RequestHandler = async (req, res) => {
  const userId = parseUserId(req.params.userId);
  const body = (req.body ?? {}) as { otp?: unknown; OTP?: unknown };
  const otp = String(body.otp ?? body.OTP ?? '').trim();
  if (!/^\d{6}$/.test(otp)) {
    throw HttpError.badRequest('Validasi gagal', [{ field: 'otp', message: 'otp wajib diisi dengan 6 digit angka' }]);
  }
  await emailVerification.verifyOtp(userId, otp);
  res.json({ success: true, data: { message: 'Email berhasil diverifikasi, silakan login', user: await authService.getProfile(userId) } });
};

/** POST /api/auth/resend-verification/:userId — a new OTP (admin, tenant) or activation email (disnakertrans). */
export const resendVerification: RequestHandler = async (req, res) => {
  const verification = await emailVerification.resend(parseUserId(req.params.userId));
  const what = verification.method === 'link' ? 'Email aktivasi baru (tautan dan kata sandi sementara baru)' : 'Kode verifikasi baru';
  res.json({ success: true, data: { message: `${what} telah dikirim ke ${verification.sentTo}` }, meta: { verification } });
};

// ---------- forgot / reset password (public) ----------

/** POST /api/auth/forgot-password — body { email }. Always the same answer, whether or not the email has an account. */
export const forgotPassword: RequestHandler = async (req, res) => {
  const { email } = (req.body ?? {}) as { email?: unknown };
  if (typeof email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
    throw HttpError.badRequest('Validasi gagal', [{ field: 'email', message: 'email wajib diisi dengan alamat email yang valid' }]);
  }
  const { devLink } = await passwordReset.requestReset(email);
  res.json({
    success: true,
    data: {
      message: `Jika email terdaftar, tautan untuk mengatur ulang kata sandi telah dikirim. Tautan berlaku ${passwordReset.RESET_LINK_VALID_MINUTES} menit.`,
    },
    ...(devLink && { meta: { devLink } }),
  });
};

function parseResetBody(body: Record<string, unknown>, needPassword: boolean) {
  const errors: { field: string; message: string }[] = [];
  const userId = typeof body.userId === 'string' ? body.userId.trim() : '';
  const token = typeof body.token === 'string' ? body.token.trim() : '';
  if (!UUID_RE.test(userId)) errors.push({ field: 'userId', message: 'userId harus berupa UUID yang valid' });
  if (!token) errors.push({ field: 'token', message: 'token wajib diisi' });
  else if (!/^[0-9a-f]{64}$/i.test(token)) {
    // e.g. an unset Postman variable ("{{resetToken}}") or only part of the link copied
    errors.push({ field: 'token', message: 'token tidak lengkap: salin seluruh nilai token (64 karakter) dari tautan di email' });
  }
  const password = body.password;
  if (needPassword && (typeof password !== 'string' || password.length < MIN_PASSWORD_LENGTH)) {
    errors.push({ field: 'password', message: `password minimal ${MIN_PASSWORD_LENGTH} karakter` });
  }
  if (errors.length) throw HttpError.badRequest('Validasi gagal', errors);
  return { userId, token, password: password as string };
}

/** POST /api/auth/reset-password/check — body { userId, token }: is this reset link still usable? */
export const checkResetPassword: RequestHandler = async (req, res) => {
  const { userId, token } = parseResetBody((req.body ?? {}) as Record<string, unknown>, false);
  res.json({ success: true, data: await passwordReset.checkReset(userId, token) });
};

/** POST /api/auth/reset-password — body { userId, token, password }. Logs the account out everywhere. */
export const resetPassword: RequestHandler = async (req, res) => {
  const { userId, token, password } = parseResetBody((req.body ?? {}) as Record<string, unknown>, true);
  await passwordReset.resetPassword(userId, token, password);
  res.json({ success: true, data: { message: 'Kata sandi berhasil diubah, silakan login dengan kata sandi baru' } });
};

// ---------- disnakertrans account activation (public: the link in the email goes to the frontend's /aktivasi) ----------

/** POST /api/auth/activate/check — body { userId, token }: is this activation link still usable? */
export const checkActivation: RequestHandler = async (req, res) => {
  const { userId, token } = parseResetBody((req.body ?? {}) as Record<string, unknown>, false);
  res.json({ success: true, data: await emailVerification.checkActivation(userId, token) });
};

/**
 * POST /api/auth/activate — body { userId, token, temporaryPassword, password }: replaces the temporary password from
 * the email with the person's own, and marks the email as verified.
 */
export const activate: RequestHandler = async (req, res) => {
  const body = (req.body ?? {}) as Record<string, unknown>;
  // Pasted from the email: spaces around it are not part of it
  const temporaryPassword = typeof body.temporaryPassword === 'string' ? body.temporaryPassword.trim() : '';
  if (!temporaryPassword) {
    throw HttpError.badRequest('Validasi gagal', [{ field: 'temporaryPassword', message: 'temporaryPassword wajib diisi dengan kata sandi sementara dari email' }]);
  }
  const { userId, token, password } = parseResetBody(body, true);
  await emailVerification.activate(userId, token, temporaryPassword, password);
  res.json({
    success: true,
    data: { message: 'Akun berhasil diaktifkan, silakan login dengan kata sandi baru Anda', user: await authService.getProfile(userId) },
  });
};
