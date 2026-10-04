import { createHash, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';
import { Op } from 'sequelize';
import { env } from '../config/env';
import { EMAIL_VERIFICATION_METHOD, type Role } from '../constants/roles';
import { HttpError } from '../errors/HttpError';
import { accountCreatedOtp, disnakertransAccountCreated } from '../mail/templates';
import { Otp, sequelize, User } from '../models';
import type { OtpPurpose } from '../models/otp.model';
import { mailIsSimulated, sendMail } from './mail.service';

export const OTP_VALID_MINUTES = 15;
export const LINK_VALID_HOURS = 24;
/** Wrong OTP guesses allowed per code; after that a new code must be requested. */
export const OTP_MAX_ATTEMPTS = 5;
/** Minimum wait between two codes for the same user. */
export const RESEND_COOLDOWN_SECONDS = 60;

const hash = (value: string) => createHash('sha256').update(value).digest('hex');
const sameHash = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

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
}

/** The public activation link sent to disnakertrans accounts. */
export const activationLink = (userId: string, token: string) => `${env.appUrl}/api/auth/verify-email/${userId}?token=${token}`;

/**
 * Creates a new code for the user (replacing any unused one) and emails it:
 * an activation link for disnakertrans, a 6-digit OTP for admin/tenant.
 * A failed email does not throw: the account still exists and the user can ask for a new code.
 */
export async function startVerification(user: VerifiableUser, { resent = false } = {}): Promise<VerificationInfo> {
  const method = EMAIL_VERIFICATION_METHOD[user.role];
  const secret = method === 'otp' ? String(randomInt(0, 1_000_000)).padStart(6, '0') : randomBytes(32).toString('hex');
  const ttlMs = method === 'otp' ? OTP_VALID_MINUTES * 60_000 : LINK_VALID_HOURS * 3_600_000;
  const expiresAt = new Date(Date.now() + ttlMs);

  await sequelize.transaction(async (transaction) => {
    await Otp.destroy({ where: { userId: user.id, usedAt: null }, transaction });
    await Otp.create({ userId: user.id, purpose: method, code: hash(secret), expiresAt }, { transaction });
  });

  const link = method === 'link' ? activationLink(user.id, secret) : undefined;
  const content =
    method === 'otp' ? accountCreatedOtp(user, secret, OTP_VALID_MINUTES, resent) : disnakertransAccountCreated(user, link!, LINK_VALID_HOURS);

  let emailSent = true;
  try {
    await sendMail({ to: user.email, ...content });
  } catch (err) {
    emailSent = false;
    console.error(`[mail] could not send the verification email to ${user.email}:`, (err as Error).message);
  }

  const dev = mailIsSimulated && !env.isProduction;
  return {
    method,
    sentTo: user.email,
    expiresAt,
    emailSent,
    ...(dev && method === 'otp' && { devCode: secret }),
    ...(dev && method === 'link' && { devLink: link }),
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

/** Marks the code as used and the user's email as verified, together. */
async function complete(user: User, code: Otp) {
  await sequelize.transaction(async (transaction) => {
    await code.update({ usedAt: new Date() }, { transaction });
    await user.update({ mailActive: true }, { transaction });
    await Otp.destroy({ where: { userId: user.id, usedAt: null, id: { [Op.ne]: code.id } }, transaction });
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

/** GET /api/auth/verify-email/:userId?token= — disnakertrans: the activation link from the email. */
export async function verifyLink(userId: string, token: string) {
  const user = await findUnverifiedUser(userId);
  const code = await latestCode(user.id, 'link');

  if (!code || !sameHash(hash(token), code.code)) {
    throw new HttpError(400, 'Tautan aktivasi tidak valid atau sudah tidak berlaku', 'LINK_INVALID');
  }
  if (code.expiresAt.getTime() < Date.now()) {
    throw new HttpError(400, `Tautan aktivasi sudah kedaluwarsa (berlaku ${LINK_VALID_HOURS} jam), silakan minta tautan baru`, 'LINK_EXPIRED');
  }

  await complete(user, code);
}

/** POST /api/auth/resend-verification/:userId — a new OTP or link, at most once per RESEND_COOLDOWN_SECONDS. */
export async function resend(userId: string) {
  const user = await findUnverifiedUser(userId);

  const last = await Otp.findOne({ where: { userId: user.id }, order: [['createdAt', 'DESC']], attributes: ['createdAt'] });
  const waitSeconds = last ? Math.ceil(RESEND_COOLDOWN_SECONDS - (Date.now() - last.createdAt.getTime()) / 1000) : 0;
  if (waitSeconds > 0) {
    throw HttpError.tooManyRequests(`Tunggu ${waitSeconds} detik sebelum meminta kode baru`, { retryAfterSeconds: waitSeconds });
  }

  return startVerification(user, { resent: true });
}
