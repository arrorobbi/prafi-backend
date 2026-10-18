import { createHash, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';
import { Op } from 'sequelize';
import { env } from '../config/env';
import { EMAIL_VERIFICATION_METHOD, type Role } from '../constants/roles';
import { HttpError } from '../errors/HttpError';
import { accountCreatedOtp, disnakertransAccountCreated, emailChangeConfirm } from '../mail/templates';
import { Otp, sequelize, User } from '../models';
import type { OtpPurpose } from '../models/otp.model';
import { readablePassword } from '../utils/readablePassword';
import { recordSendFailure } from './bounceCheck.service';
import { mailIsSimulated, sendMail } from './mail.service';

export const OTP_VALID_MINUTES = 15;
export const LINK_VALID_HOURS = 24;
/** Wrong OTP guesses allowed per code; after that a new code must be requested. */
export const OTP_MAX_ATTEMPTS = 5;
/** Minimum wait between two codes for the same user. */
export const RESEND_COOLDOWN_SECONDS = 60;

export const hash = (value: string) => createHash('sha256').update(value).digest('hex');
export const sameHash = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

interface VerifiableUser {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  role: Role;
}

/** Sent back to the client after a code/link is emailed (never contains the code itself, except in development). */
export interface VerificationInfo {
  method: OtpPurpose;
  sentTo: string;
  expiresAt: Date;
  emailSent: boolean;
  /** Development only (no SMTP configured): the OTP / link, so it can be tested without an inbox. */
  devCode?: string;
  devLink?: string;
  /** Development only, disnakertrans: the link's token and the temporary password from the email. */
  devToken?: string;
  devTemporaryPassword?: string;
}

/** The frontend page the activation email links to; it asks for the temporary password and a new one. */
export const ACTIVATION_PAGE_PATH = '/aktivasi';

/** The activation link sent to disnakertrans accounts (a page of the frontend). */
export const activationLink = (userId: string, token: string) =>
  `${env.frontendUrl}${ACTIVATION_PAGE_PATH}?userId=${encodeURIComponent(userId)}&token=${encodeURIComponent(token)}`;

/** The frontend page the email-change confirmation links to; opening it confirms the address. */
export const CONFIRM_PAGE_PATH = '/konfirmasi-email';
export const CONFIRM_LINK_VALID_HOURS = 24;

const confirmLink = (userId: string, token: string) =>
  `${env.frontendUrl}${CONFIRM_PAGE_PATH}?userId=${encodeURIComponent(userId)}&token=${encodeURIComponent(token)}`;

/** Every kind of code that verifies an email address (not the password reset). */
const VERIFY_PURPOSES: OtpPurpose[] = ['otp', 'link', 'confirm'];

/**
 * Creates a new code for the user (replacing any unused one) and emails it:
 * a 6-digit OTP for admin/tenant; for disnakertrans an activation link together with a temporary password
 * (`temporaryPassword` when the account was just created with it; otherwise a new one is made and saved, since the
 * old one is only stored as a hash and can't be sent again).
 * A failed email does not throw: the account still exists and the user can ask for a new code.
 */
export async function startVerification(
  user: VerifiableUser,
  { resent = false, temporaryPassword }: { resent?: boolean; temporaryPassword?: string } = {},
): Promise<VerificationInfo> {
  const method = EMAIL_VERIFICATION_METHOD[user.role];
  const secret = method === 'otp' ? String(randomInt(0, 1_000_000)).padStart(6, '0') : randomBytes(32).toString('hex');
  const ttlMs = method === 'otp' ? OTP_VALID_MINUTES * 60_000 : LINK_VALID_HOURS * 3_600_000;
  const expiresAt = new Date(Date.now() + ttlMs);
  const newPassword = method === 'link' && !temporaryPassword ? readablePassword() : undefined;
  const emailedPassword = temporaryPassword ?? newPassword;

  await sequelize.transaction(async (transaction) => {
    await Otp.destroy({ where: { userId: user.id, purpose: method, usedAt: null }, transaction });
    await Otp.create({ userId: user.id, purpose: method, code: hash(secret), expiresAt }, { transaction });
    if (newPassword) {
      // Saved through the instance so the User model's beforeSave hook hashes it
      const account = await User.scope('withPassword').findByPk(user.id, { transaction });
      await account!.update({ password: newPassword }, { transaction });
    }
  });

  const link = method === 'link' ? activationLink(user.id, secret) : undefined;
  const content =
    method === 'otp'
      ? accountCreatedOtp(user, secret, OTP_VALID_MINUTES, resent)
      : disnakertransAccountCreated(user, link!, emailedPassword!, LINK_VALID_HOURS, resent);

  let emailSent = true;
  try {
    await sendMail({ to: user.email, ...content });
  } catch (err) {
    emailSent = false;
    console.error(`[mail] could not send the verification email to ${user.email}:`, (err as Error).message);
    await recordSendFailure(user.id, err as Error);
  }

  const dev = mailIsSimulated && !env.isProduction;
  return {
    method,
    sentTo: user.email,
    expiresAt,
    emailSent,
    ...(dev && method === 'otp' && { devCode: secret }),
    ...(dev && method === 'link' && { devLink: link, devToken: secret, devTemporaryPassword: emailedPassword }),
  };
}

async function findUnverifiedUser(userId: string) {
  const user = await User.findByPk(userId, { attributes: ['id', 'firstName', 'lastName', 'email', 'role', 'mailActive'] });
  if (!user) throw HttpError.notFound('Pengguna tidak ditemukan');
  if (user.mailActive) throw new HttpError(409, 'Email sudah terverifikasi, silakan login', 'EMAIL_ALREADY_VERIFIED');
  return user;
}

const latestCode = (userId: string, purpose: OtpPurpose) =>
  Otp.findOne({ where: { userId, purpose, usedAt: null }, order: [['createdAt', 'DESC']] });

/** A verified address evidently receives our emails: any earlier delivery problem is cleared. */
const EMAIL_OK = { emailIssue: null, emailIssueDetail: null, emailIssueAt: null };

/** Marks the code as used and the user's email as verified, together. */
async function complete(user: User, code: Otp) {
  await sequelize.transaction(async (transaction) => {
    await code.update({ usedAt: new Date() }, { transaction });
    await user.update({ mailActive: true, ...EMAIL_OK }, { transaction });
    await Otp.destroy({ where: { userId: user.id, purpose: VERIFY_PURPOSES, usedAt: null, id: { [Op.ne]: code.id } }, transaction });
  });
}

/** POST /api/auth/verify-otp/:userId — admin/tenant: checks the 6-digit code from the email. */
export async function verifyOtp(userId: string, otp: string) {
  const user = await findUnverifiedUser(userId);
  const code = await latestCode(user.id, 'otp');

  if (!code) {
    throw new HttpError(400, 'Kode OTP tidak ditemukan, silakan minta kode baru', 'OTP_INVALID');
  }
  if (code.expiresAt.getTime() < Date.now()) {
    throw new HttpError(400, `Kode OTP sudah kedaluwarsa (berlaku ${OTP_VALID_MINUTES} menit), silakan minta kode baru`, 'OTP_EXPIRED');
  }
  if (code.attempts >= OTP_MAX_ATTEMPTS) {
    throw new HttpError(400, 'Terlalu banyak percobaan kode OTP yang salah, silakan minta kode baru', 'OTP_INVALID');
  }
  if (!sameHash(hash(otp), code.code)) {
    const attemptsLeft = Math.max(OTP_MAX_ATTEMPTS - (code.attempts + 1), 0);
    await code.increment('attempts');
    throw new HttpError(400, 'Kode OTP salah', 'OTP_INVALID', { attemptsLeft });
  }

  await complete(user, code);
}

/** The user's newest activation link, checked against `token` (not used yet, not expired). */
async function findValidActivation(userId: string, token: string) {
  const user = await findUnverifiedUser(userId);
  const code = await latestCode(user.id, 'link');

  if (!code || !sameHash(hash(token), code.code)) {
    throw new HttpError(400, 'Tautan aktivasi tidak valid atau sudah diganti oleh email aktivasi yang lebih baru', 'LINK_INVALID');
  }
  if (code.expiresAt.getTime() < Date.now()) {
    throw new HttpError(400, `Tautan aktivasi sudah kedaluwarsa (berlaku ${LINK_VALID_HOURS} jam), silakan minta email aktivasi baru`, 'LINK_EXPIRED');
  }
  return { user, code };
}

/** POST /api/auth/activate/check — lets the frontend check the link before showing the form. */
export async function checkActivation(userId: string, token: string) {
  const { user, code } = await findValidActivation(userId, token);
  return { valid: true, email: user.email, expiresAt: code.expiresAt };
}

/**
 * POST /api/auth/activate — disnakertrans: the link from the email plus the temporary password in it prove the
 * person reads that inbox; they choose their own password, and only then the email counts as verified
 * (mailActive = true) and the account can log in. Wrong temporary passwords are limited like OTP guesses.
 */
export async function activate(userId: string, token: string, temporaryPassword: string, password: string) {
  const { user, code } = await findValidActivation(userId, token);

  if (code.attempts >= OTP_MAX_ATTEMPTS) {
    throw new HttpError(400, 'Terlalu banyak percobaan kata sandi sementara yang salah, silakan minta email aktivasi baru', 'TEMPORARY_PASSWORD_INVALID', {
      attemptsLeft: 0,
    });
  }
  const account = await User.scope('withPassword').findByPk(user.id);
  if (!account || !(await account.comparePassword(temporaryPassword))) {
    const attemptsLeft = Math.max(OTP_MAX_ATTEMPTS - (code.attempts + 1), 0);
    await code.increment('attempts');
    throw new HttpError(400, 'Kata sandi sementara salah, periksa kembali email aktivasi Anda', 'TEMPORARY_PASSWORD_INVALID', { attemptsLeft });
  }
  if (password === temporaryPassword) {
    throw HttpError.badRequest('Validasi gagal', [{ field: 'password', message: 'Kata sandi baru harus berbeda dari kata sandi sementara' }]);
  }

  await sequelize.transaction(async (transaction) => {
    await code.update({ usedAt: new Date() }, { transaction });
    // The model's beforeSave hook hashes the password
    await account.update({ password, mailActive: true, ...EMAIL_OK }, { transaction });
    await Otp.destroy({ where: { userId: user.id, purpose: ['otp', 'link'], usedAt: null, id: { [Op.ne]: code.id } }, transaction });
  });
}

/**
 * POST /api/auth/resend-verification/:userId — a new OTP, or a new activation link with a new temporary password
 * (disnakertrans), at most once per RESEND_COOLDOWN_SECONDS.
 */
export async function resend(userId: string) {
  const user = await findUnverifiedUser(userId);

  const last = await Otp.findOne({ where: { userId: user.id, purpose: VERIFY_PURPOSES }, order: [['createdAt', 'DESC']], attributes: ['createdAt', 'purpose'] });
  const waitSeconds = last ? Math.ceil(RESEND_COOLDOWN_SECONDS - (Date.now() - last.createdAt.getTime()) / 1000) : 0;
  if (waitSeconds > 0) {
    const what = last?.purpose === 'otp' ? 'kode' : 'tautan';
    throw HttpError.tooManyRequests(`Tunggu ${waitSeconds} detik sebelum meminta ${what} baru`, { retryAfterSeconds: waitSeconds });
  }

  // An admin changed this seller's email: a new confirmation link, not an OTP
  if (last?.purpose === 'confirm') return startEmailConfirmation(user, { resent: true });
  return startVerification(user, { resent: true });
}

/**
 * How this unverified account verifies its email now: 'confirm' while an admin's email change waits for its link to
 * be clicked, otherwise the role's method (OTP or activation link). Sent with 403 EMAIL_NOT_VERIFIED at login.
 */
export async function pendingMethod(user: { id: string; role: Role }): Promise<OtpPurpose> {
  const last = await Otp.findOne({ where: { userId: user.id, purpose: VERIFY_PURPOSES, usedAt: null }, order: [['createdAt', 'DESC']], attributes: ['purpose'] });
  return last?.purpose === 'confirm' ? 'confirm' : EMAIL_VERIFICATION_METHOD[user.role];
}

/**
 * After an admin changed a seller's email: emails a confirmation link (valid CONFIRM_LINK_VALID_HOURS) to the new
 * address. Opening it confirms the address (POST /api/auth/confirm-email). A failed email does not throw.
 */
export async function startEmailConfirmation(user: VerifiableUser, { resent = false } = {}): Promise<VerificationInfo> {
  const token = randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + CONFIRM_LINK_VALID_HOURS * 3_600_000);
  await sequelize.transaction(async (transaction) => {
    await Otp.destroy({ where: { userId: user.id, purpose: VERIFY_PURPOSES, usedAt: null }, transaction });
    await Otp.create({ userId: user.id, purpose: 'confirm', code: hash(token), expiresAt }, { transaction });
  });

  const link = confirmLink(user.id, token);
  let emailSent = true;
  try {
    await sendMail({ to: user.email, ...emailChangeConfirm(user, link, CONFIRM_LINK_VALID_HOURS, resent) });
  } catch (err) {
    emailSent = false;
    console.error(`[mail] could not send the email confirmation to ${user.email}:`, (err as Error).message);
    await recordSendFailure(user.id, err as Error);
  }

  const dev = mailIsSimulated && !env.isProduction;
  return { method: 'confirm', sentTo: user.email, expiresAt, emailSent, ...(dev && { devLink: link, devToken: token }) };
}

/** POST /api/auth/confirm-email — the link from the email-change confirmation: one click verifies the new address. */
export async function confirmEmail(userId: string, token: string) {
  const user = await findUnverifiedUser(userId);
  const code = await latestCode(user.id, 'confirm');
  if (!code || !sameHash(hash(token), code.code)) {
    throw new HttpError(400, 'Tautan konfirmasi tidak valid atau sudah diganti oleh email konfirmasi yang lebih baru', 'LINK_INVALID');
  }
  if (code.expiresAt.getTime() < Date.now()) {
    throw new HttpError(400, `Tautan konfirmasi sudah kedaluwarsa (berlaku ${CONFIRM_LINK_VALID_HOURS} jam), silakan minta tautan baru`, 'LINK_EXPIRED');
  }
  await complete(user, code);
  return { email: user.email };
}
