import { Op, type WhereOptions } from 'sequelize';
import { ROLES, type Role } from '../constants/roles';
import { HttpError } from '../errors/HttpError';
import { emailChangedNotice } from '../mail/templates';
import { Otp, sequelize, User } from '../models';
import { endUserSessions } from '../realtime/socket';
import * as emailVerification from './emailVerification.service';
import { sendMail } from './mail.service';

export interface ListUsersOptions {
  /** Roles the requester may see (from the `scopeReadableRoles` middleware). */
  readableRoles: Role[];
  /** Optional filter; must be one of `readableRoles`. */
  role?: Role;
  /** Optional search in the name, email, phone number and tenant (store) name. */
  q?: string;
  /** true: only accounts whose emails did not arrive (users.email_issue is set). */
  emailIssue?: boolean;
  page: number;
  limit: number;
}

export async function list({ readableRoles, role, q, emailIssue, page, limit }: ListUsersOptions) {
  const where: WhereOptions<User>[] = [{ role: role ?? readableRoles }];
  if (q) {
    const like = `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
    where.push({
      [Op.or]: [
        { firstName: { [Op.iLike]: like } },
        { lastName: { [Op.iLike]: like } },
        { email: { [Op.iLike]: like } },
        { phoneNumber: { [Op.iLike]: like } },
        { tenantName: { [Op.iLike]: like } },
        sequelize.where(sequelize.fn('concat', sequelize.col('first_name'), ' ', sequelize.col('last_name')), { [Op.iLike]: like }),
      ],
    } as WhereOptions<User>);
  }
  if (emailIssue) where.push({ emailIssue: { [Op.ne]: null } });

  const { rows, count } = await User.findAndCountAll({
    where: { [Op.and]: where },
    include: [
      { association: 'faceImage' },
      { association: 'approval' },
      // Tenants: their shop profile (null until they create it)
      { association: 'tenant', include: [{ association: 'logo' }] },
    ],
    order: [['createdAt', 'DESC']],
    limit,
    offset: (page - 1) * limit,
    distinct: true,
  });

  return {
    users: rows,
    meta: { page, limit, total: count, totalPages: Math.ceil(count / limit) },
  };
}

/**
 * PATCH /api/users/:id/email — an admin corrects a seller's (tenant's) email address. The new address must be
 * verified by the seller: the account's email counts as unverified (mailActive = false, so its sessions end and it
 * can't log in), a new OTP goes to the new address, and the old address is told about the change.
 */
export async function changeTenantEmail(id: string, email: string) {
  const user = await User.findByPk(id);
  if (!user) throw HttpError.notFound('Pengguna tidak ditemukan');
  if (user.role !== ROLES.TENANT) {
    throw HttpError.forbidden('Hanya email akun penjual (tenant) yang dapat diubah');
  }
  const newEmail = email.trim().toLowerCase();
  if (newEmail === user.email) {
    throw HttpError.badRequest('Validasi gagal', [{ field: 'email', message: 'Email baru sama dengan email saat ini' }]);
  }
  if (await User.findOne({ where: { email: newEmail }, attributes: ['id'] })) {
    throw new HttpError(409, 'Email sudah dipakai akun lain', 'EMAIL_TAKEN', [{ field: 'email', message: 'Email sudah dipakai akun lain' }]);
  }

  const oldEmail = user.email;
  await sequelize.transaction(async (transaction) => {
    await user.update(
      { email: newEmail, mailActive: false, emailIssue: null, emailIssueDetail: null, emailIssueAt: null },
      { transaction },
    );
    // Codes sent to the old address must not verify the new one
    await Otp.destroy({ where: { userId: user.id, purpose: ['otp', 'link'], usedAt: null }, transaction });
  });

  // Open tabs of the seller are logged out at once (their next request would be refused anyway)
  await endUserSessions(user.id, 'email_changed');
  const verification = await emailVerification.startVerification(user, { emailChanged: true });

  // Tell the old address, so the owner knows if the change was not theirs (a failure here is only logged)
  try {
    await sendMail({ to: oldEmail, ...emailChangedNotice(user, oldEmail, newEmail) });
  } catch (err) {
    console.error(`[mail] could not send the email-change notice to ${oldEmail}:`, (err as Error).message);
  }

  const fresh = await User.findByPk(user.id, {
    include: [{ association: 'faceImage' }, { association: 'approval' }, { association: 'tenant', include: [{ association: 'logo' }] }],
  });
  return { user: fresh!, verification };
}
