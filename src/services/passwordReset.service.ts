import { randomBytes } from 'node:crypto';
import { Op } from 'sequelize';
import { env } from '../config/env';
import { HttpError } from '../errors/HttpError';
import { passwordResetRequested } from '../mail/templates';
import { Otp, sequelize, User } from '../models';
import { endUserSessions } from '../realtime/socket';
import { hash, RESEND_COOLDOWN_SECONDS } from './emailVerification.service';
import { mailIsSimulated, sendMail } from './mail.service';

export const RESET_LINK_VALID_MINUTES = 30;
/** The frontend page the email links to; it reads userId + token from the query and calls POST /api/auth/reset-password. */
export const RESET_PAGE_PATH = '/reset-password';

export const resetLink = (userId: string, token: string) =>
  `${env.frontendUrl}${RESET_PAGE_PATH}?userId=${encodeURIComponent(userId)}&token=${encodeURIComponent(token)}`;

/** Development only (no SMTP configured): the link, so it can be tested without an inbox. */
export interface ResetRequestResult {
  devLink?: string;
}

/**
 * POST /api/auth/forgot-password — emails a reset link if the email belongs to an account.
 * The caller always gets the same answer, so it can't be used to find out which emails are registered.
 * At most one email per RESEND_COOLDOWN_SECONDS per account; extra requests are silently skipped.
 */
export async function requestReset(email: string): Promise<ResetRequestResult> {
  const user = await User.findOne({
    where: { email: email.trim().toLowerCase() },
    attributes: ['id', 'firstName', 'lastName', 'email', 'role'],
  });
  if (!user) return {};

  const last = await Otp.findOne({ where: { userId: user.id, purpose: 'reset' }, order: [['createdAt', 'DESC']], attributes: ['createdAt'] });
  if (last && Date.now() - last.createdAt.getTime() < RESEND_COOLDOWN_SECONDS * 1000) return {};

  const token = randomBytes(32).toString('hex');
  await sequelize.transaction(async (transaction) => {
    // Older links stop working because only the newest one is accepted; they are kept for a day so a
    // replaced link gets a clear error ("use the newest email") instead of a generic "invalid"
    await Otp.destroy({ where: { userId: user.id, purpose: 'reset', createdAt: { [Op.lt]: new Date(Date.now() - 86_400_000) } }, transaction });
    await Otp.create(
      { userId: user.id, purpose: 'reset', code: hash(token), expiresAt: new Date(Date.now() + RESET_LINK_VALID_MINUTES * 60_000) },
      { transaction },
    );
  });

  const link = resetLink(user.id, token);
  try {
    await sendMail({ to: user.email, ...passwordResetRequested(user, link, RESET_LINK_VALID_MINUTES) });
  } catch (err) {
    // Not reported to the caller (same answer for every email); logged for the server owner
    console.error(`[mail] could not send the password reset email to ${user.email}:`, (err as Error).message);
  }
  return mailIsSimulated && !env.isProduction ? { devLink: link } : {};
}

/**
 * Finds the reset code for `token` and checks it is the user's newest, unused, unexpired one.
 * Each failure has its own message so the person knows what to do (all use code RESET_LINK_INVALID except expiry).
 */
async function findValidReset(userId: string, token: string) {
  const invalid = (message: string) => new HttpError(400, message, 'RESET_LINK_INVALID');
  const user = await User.findByPk(userId, { attributes: ['id', 'email', 'mailActive'] });
  if (!user) throw invalid('Tautan atur ulang kata sandi tidak valid: pengguna tidak ditemukan, periksa userId pada tautan');

  const code = await Otp.findOne({ where: { userId, purpose: 'reset', code: hash(token) } });
  if (!code) {
    throw invalid('Tautan atur ulang kata sandi tidak valid: token tidak cocok, pastikan seluruh tautan dari email disalin');
  }
  if (code.usedAt) throw invalid('Tautan atur ulang kata sandi sudah digunakan, silakan minta tautan baru jika perlu');
  const newer = await Otp.count({ where: { userId, purpose: 'reset', createdAt: { [Op.gt]: code.createdAt } } });
  if (newer > 0) {
    throw invalid('Tautan ini sudah diganti oleh tautan yang lebih baru, gunakan tautan dari email atur ulang kata sandi yang terakhir');
  }
  if (code.expiresAt.getTime() < Date.now()) {
    throw new HttpError(
      400,
      `Tautan atur ulang kata sandi sudah kedaluwarsa (berlaku ${RESET_LINK_VALID_MINUTES} menit), silakan minta tautan baru`,
      'RESET_LINK_EXPIRED',
    );
  }
  return { user, code };
}

/** POST /api/auth/reset-password/check — lets the frontend check the link before showing the form. */
export async function checkReset(userId: string, token: string) {
  const { user, code } = await findValidReset(userId, token);
  return { valid: true, email: maskEmail(user.email), expiresAt: code.expiresAt };
}

/**
 * POST /api/auth/reset-password — sets the new password. The link proves the person owns the email, so the
 * email counts as verified too. Every existing session is ended (older tokens are refused from now on).
 */
export async function resetPassword(userId: string, token: string, password: string) {
  const { user, code } = await findValidReset(userId, token);

  await sequelize.transaction(async (transaction) => {
    await code.update({ usedAt: new Date() }, { transaction });
    // Saved through the instance so the User model's beforeSave hook hashes the password
    const account = await User.scope('withPassword').findByPk(user.id, { transaction });
    await account!.update({ password, mailActive: true, passwordChangedAt: new Date() }, { transaction });
  });

  await endUserSessions(user.id, 'password_reset');
}

/** a***i@gmail.com: enough for the person to recognise their account on the reset page. */
function maskEmail(email: string) {
  const [name, domain] = email.split('@');
  const visible = name.length <= 2 ? name[0] : `${name[0]}${'*'.repeat(Math.min(name.length - 2, 6))}${name[name.length - 1]}`;
  return `${visible}@${domain}`;
}
