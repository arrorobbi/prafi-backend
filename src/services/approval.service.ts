import { APPROVABLE_ROLES, PRODUCT_APPROVER_ROLES, type Role } from '../constants/roles';
import { HttpError } from '../errors/HttpError';
import { Approval, Product, sequelize, User } from '../models';
import type { AuthUser } from '../types/express';

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

/** superadmin → admin and tenant accounts, admin → tenant accounts (see APPROVABLE_ROLES). */
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
  if (!user) throw HttpError.notFound('User not found');

  // The submitted role is a confirmation only; a user's role is never changed here
  if (user.role !== expectedRole) {
    throw HttpError.badRequest('Validation failed', [
      { field: 'role', message: `role does not match this user (this user is a ${user.role})` },
    ]);
  }

  if (!APPROVABLE_ROLES[actor.role].includes(user.role)) {
    throw HttpError.forbidden(`Role ${actor.role} cannot change the activation of ${user.role} accounts`);
  }

  const approval = user.approval
    ? await user.approval.update(values)
    : await Approval.create({ ...values, userId: user.id });

  return { type: 'user' as const, id: user.id, email: user.email, role: user.role, approval };
}

async function setProductApproval(actor: AuthUser, productId: string, values: { isActive: boolean; reason: string }) {
  if (!PRODUCT_APPROVER_ROLES.includes(actor.role)) {
    throw HttpError.forbidden(`Role ${actor.role} cannot change the activation of products`);
  }

  // Creating the approval and linking it to the product must succeed or fail together
  return sequelize.transaction(async (transaction) => {
    const product = await Product.findByPk(productId, {
      attributes: ['id', 'name', 'approvalId'],
      include: [{ association: 'approval' }],
      transaction,
    });
    if (!product) throw HttpError.notFound('Product not found');

    let approval = product.approval;
    if (approval) {
      await approval.update(values, { transaction });
    } else {
      approval = await Approval.create(values, { transaction });
      await product.update({ approvalId: approval.id }, { transaction });
    }

    return { type: 'product' as const, id: product.id, name: product.name, approval };
  });
}
