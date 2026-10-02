import bcrypt from 'bcryptjs';
import { Op } from 'sequelize';
import { ACTIVE_ON_REGISTRATION, CREATABLE_ROLES, PUBLIC_REGISTRATION_ROLES, ROLES, type Role } from '../constants/roles';
import { HttpError } from '../errors/HttpError';
import { Approval, Image, RevokedToken, sequelize, User } from '../models';
import type { AuthUser } from '../types/express';
import { signAccessToken } from '../utils/jwt';
import { notify } from './notification.service';
import { endUserSessions } from '../realtime/socket';

export interface RegisterInput {
  firstName: string;
  lastName: string;
  phoneNumber: string;
  email: string;
  password: string;
  role: Role;
  faceImageId?: number | null;
  /** Required for tenant accounts, not allowed for other roles. */
  tenantName?: string;
}

// Compared against when the email doesn't exist, so response time doesn't reveal which emails are registered
const DUMMY_HASH = bcrypt.hashSync('dummy-password-for-timing', 12);

export async function login(email: string, password: string) {
  const user = await User.scope('withPassword').findOne({
    where: { email: email.trim().toLowerCase() },
    include: [{ association: 'approval', attributes: ['isActive'] }],
  });

  const passwordOk = user
    ? await user.comparePassword(password)
    : await bcrypt.compare(password, DUMMY_HASH);

  if (!user || !passwordOk) {
    throw HttpError.unauthorized('Email atau password salah');
  }

  // Checked only after the password is correct, so activation status isn't revealed to anyone else
  if (user.approval?.isActive !== true) throw HttpError.notActivated();

  const accessToken = signAccessToken({ sub: user.id, role: user.role });
  return { accessToken, tokenType: 'Bearer', user: user.toJSON() };
}

/**
 * Creates a user together with their approval.
 * `creator` is the logged-in user (superadmin → admin, see CREATABLE_ROLES), or null for a public
 * sign-up, which is only allowed for PUBLIC_REGISTRATION_ROLES (tenants).
 * Admins start inactive (activate via PATCH /api/approvals/:id?type=user); tenants start active.
 */
export async function register(creator: AuthUser | null, input: RegisterInput) {
  if (creator === null) {
    if (!PUBLIC_REGISTRATION_ROLES.includes(input.role)) {
      throw HttpError.unauthorized(`Pendaftaran akun ${input.role} memerlukan login`);
    }
  } else if (!CREATABLE_ROLES[creator.role].includes(input.role)) {
    throw HttpError.forbidden(`Role ${creator.role} tidak dapat membuat akun ${input.role}`);
  }

  if (input.faceImageId != null) {
    const image = await Image.findByPk(input.faceImageId, { attributes: ['id'] });
    if (!image) {
      throw HttpError.badRequest('Validasi gagal', [
        { field: 'faceImageId', message: 'Gambar tidak ditemukan, unggah terlebih dahulu melalui POST /api/images' },
      ]);
    }
  }

  const isActive = ACTIVE_ON_REGISTRATION[input.role];
  const reason = isActive
    ? `Active on registration (${creator ? `created by ${creator.role}` : 'self-registered'})`
    : 'Waiting for activation by a superadmin';

  // The user and their approval are created together, so a user never exists without one.
  // Duplicate email / already-used faceImageId → UniqueConstraintError → 409 via the error handler
  const user = await sequelize.transaction(async (transaction) => {
    const created = await User.create({ ...input, faceImageId: input.faceImageId ?? null }, { transaction });
    await Approval.create({ userId: created.id, isActive, reason }, { transaction });
    return created;
  });

  if (user.role === ROLES.ADMIN) await notify.adminRegistered(user);
  else if (user.role === ROLES.TENANT) await notify.tenantRegistered(user);
  return getProfile(user.id);
}

export interface UpdateProfileInput {
  firstName?: string;
  lastName?: string;
  phoneNumber?: string;
  email?: string;
  /** New password; requires `currentPassword`. */
  password?: string;
  currentPassword?: string;
  /** Image id from POST /api/images, or null to remove the face image. */
  faceImageId?: number | null;
  /** Tenants only: change their tenant name (cannot be emptied). */
  tenantName?: string;
}

/** Updates the logged-in user's own account. id and role are never changed here. */
export async function updateProfile(userId: string, input: UpdateProfileInput) {
  const user = await User.scope('withPassword').findByPk(userId);
  if (!user) throw HttpError.notFound('Pengguna tidak ditemukan');

  const { currentPassword, ...changes } = input;

  if (changes.password !== undefined && !(await user.comparePassword(currentPassword ?? ''))) {
    throw HttpError.badRequest('Validasi gagal', [
      { field: 'currentPassword', message: 'Password saat ini salah' },
    ]);
  }

  if (changes.faceImageId != null) {
    const image = await Image.findByPk(changes.faceImageId, { attributes: ['id'] });
    if (!image) {
      throw HttpError.badRequest('Validasi gagal', [
        { field: 'faceImageId', message: 'Gambar tidak ditemukan, unggah terlebih dahulu melalui POST /api/images' },
      ]);
    }
  }

  // The password is hashed by the model's beforeSave hook.
  // Email taken / faceImageId used by another user → UniqueConstraintError → 409 via the error handler
  await user.update(changes);
  return getProfile(user.id);
}

/**
 * Logs out the token used for this request: it is rejected from now on, even though it hasn't expired.
 * Only this token is revoked, so the user's other sessions (other devices/logins) stay logged in.
 */
export async function logout(user: AuthUser, token: { jti?: string; expiresAt: Date }) {
  if (!token.jti) {
    throw HttpError.badRequest(
      `Token ini dibuat sebelum fitur logout tersedia dan tidak dapat dicabut; token akan kedaluwarsa pada ${token.expiresAt.toISOString()}. Silakan login kembali untuk mendapatkan token baru.`,
    );
  }

  // Revoked entries are only needed until the token would have expired anyway
  await RevokedToken.destroy({ where: { expiresAt: { [Op.lt]: new Date() } } });
  await RevokedToken.findOrCreate({
    where: { jti: token.jti },
    defaults: { jti: token.jti, userId: user.id, expiresAt: token.expiresAt },
  });
  // Close the WebSocket connections that use this token (other sessions stay connected)
  await endUserSessions(user.id, 'logged_out', token.jti);
}

export async function getProfile(userId: string) {
  const user = await User.findByPk(userId, {
    include: [{ association: 'faceImage' }, { association: 'approval' }],
  });
  if (!user) throw HttpError.notFound('Pengguna tidak ditemukan');
  return user;
}
