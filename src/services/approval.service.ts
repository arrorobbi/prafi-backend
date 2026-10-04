import { APPROVABLE_ROLES, PRODUCT_APPROVER_ROLES, type Role } from '../constants/roles';
import { HttpError } from '../errors/HttpError';
import { Approval, Product, sequelize, User } from '../models';
import type { AuthUser } from '../types/express';
import { notify } from './notification.service';
import { endUserSessions } from '../realtime/socket';

/** What an approval can belong to. Add a new entry here (and a handler below) to support another model. */
export const APPROVAL_TYPES = ['user', 'product'] as const;
export type ApprovalType = (typeof APPROVAL_TYPES)[number];

export interface SetApprovalInput {
  isActive: boolean;
  /** Optional; defaults to "Activated by <role>" / "Deactivated by <role>". */
  reason?: string;
  /** type=user only: the target user's role, sent by the caller as a confirmation. Must match. */
  role?: Role;
}

const defaultReason = (actor: AuthUser, isActive: boolean) =>
  `${isActive ? 'Activated' : 'Deactivated'} by ${actor.role}`;

/**
 * Activates or deactivates a user or product. Creates the approval row the first time,
 * updates it afterwards.
 */
export async function setApproval(actor: AuthUser, type: ApprovalType, id: string, input: SetApprovalInput) {
  const values = { isActive: input.isActive, reason: input.reason ?? defaultReason(actor, input.isActive) };
  return type === 'user' ? setUserApproval(actor, id, input.role!, values) : setProductApproval(actor, id, values);
}

/** disnakertrans → admin accounts, admin → tenant accounts; the superadmin is read-only (see APPROVABLE_ROLES). */
async function setUserApproval(
  actor: AuthUser,
  userId: string,
  expectedRole: Role,
  values: { isActive: boolean; reason: string },
) {
  const user = await User.findByPk(userId, {
    attributes: ['id', 'email', 'role'],
    include: [{ association: 'approval' }],
  });
  if (!user) throw HttpError.notFound('Pengguna tidak ditemukan');

  // The submitted role is a confirmation only; a user's role is never changed here
  if (user.role !== expectedRole) {
    throw HttpError.badRequest('Validasi gagal', [
      { field: 'role', message: `role tidak sesuai dengan pengguna ini (pengguna ini adalah ${user.role})` },
    ]);
  }

  if (!APPROVABLE_ROLES[actor.role].includes(user.role)) {
    throw HttpError.forbidden(`Role ${actor.role} tidak dapat mengubah aktivasi akun ${user.role}`);
  }

  const wasActive = user.approval?.isActive === true;
  const approval = user.approval
    ? await user.approval.update(values)
    : await Approval.create({ ...values, userId: user.id });

  // Only a real change (active → inactive) notifies the superadmins (they oversee every deactivation)
  if (wasActive && !values.isActive) {
    await notify.userDeactivatedByAdmin(actor, user, approval.id);
  }
  // A deactivated user is disconnected from realtime right away
  if (!values.isActive) await endUserSessions(user.id, 'deactivated');

  return { type: 'user' as const, id: user.id, email: user.email, role: user.role, approval };
}

async function setProductApproval(actor: AuthUser, productId: string, values: { isActive: boolean; reason: string }) {
  if (!PRODUCT_APPROVER_ROLES.includes(actor.role)) {
    throw HttpError.forbidden(`Role ${actor.role} tidak dapat mengubah aktivasi produk`);
  }

  // Creating the approval and linking it to the product must succeed or fail together
  const { result, product, wasActive, approvalId } = await sequelize.transaction(async (transaction) => {
    const product = await Product.findByPk(productId, {
      attributes: ['id', 'name', 'approvalId', 'tenantId'],
      include: [{ association: 'approval' }],
      transaction,
    });
    if (!product) throw HttpError.notFound('Produk tidak ditemukan');

    let approval = product.approval;
    const wasActive = approval?.isActive === true;
    if (approval) {
      // Older product approvals may not have their owner recorded yet
      await approval.update({ ...values, type: 'product', userId: product.tenantId }, { transaction });
    } else {
      approval = await Approval.create({ ...values, type: 'product', userId: product.tenantId }, { transaction });
      await product.update({ approvalId: approval.id }, { transaction });
    }

    return { result: { type: 'product' as const, id: product.id, name: product.name }, product, wasActive, approvalId: approval.id };
  });

  // Notify only on a real change, after it is saved (re-sending the same value notifies nobody)
  if (wasActive !== values.isActive) {
    await notify.productActivationChanged(actor, { ...product.get(), approvalId }, values.isActive);
  }
  return { ...result, ...(await productApprovalView(approvalId)) };
}

/**
 * A product approval with who it belongs to:
 * { approval, user: { id, firstName, lastName, …, tenant: {…} | null, productId, product: {…} } }
 */
async function productApprovalView(approvalId: number) {
  const approval = await Approval.findByPk(approvalId, {
    include: [
      {
        association: 'user',
        attributes: ['id', 'firstName', 'lastName', 'email', 'phoneNumber', 'tenantName'],
        include: [
          {
            association: 'tenant',
            include: [{ association: 'category' }, { association: 'logo' }],
          },
        ],
      },
      { association: 'product', include: [{ association: 'image' }] },
    ],
  });
  if (!approval) throw HttpError.notFound('Persetujuan tidak ditemukan');

  const { user, product, ...rest } = approval.toJSON() as unknown as Record<string, any>;
  return {
    approval: rest,
    user: user && {
      ...user,
      tenant: user.tenant ?? null,
      productId: product?.id ?? null,
      product: product ?? null,
    },
  };
}
