import { Op, fn, col } from 'sequelize';
import { PRODUCT_APPROVER_ROLES, ROLES, type Role } from '../constants/roles';
import { NOTIFICATION_TYPES as T, type NotificationEntityType, type NotificationType } from '../constants/notifications';
import { REALTIME_EVENTS as E } from '../constants/realtime';
import { HttpError } from '../errors/HttpError';
import { Notification, User } from '../models';
import { emitToUser } from '../realtime/socket';
import type { AuthUser } from '../types/express';

interface Payload {
  type: NotificationType;
  name: string;
  description: string;
  entityType?: NotificationEntityType;
  entityId?: string;
  /** Activation notifications: the approval of the user/product the notification is about. */
  approvalId?: number | null;
}

/**
 * Activation notifications carry their approval, so the frontend knows what needs (de)activating and
 * its current status. To change it: PATCH /api/approvals/:entityId?type=<entityType>.
 */
const APPROVAL_INCLUDE = {
  association: 'approval',
  attributes: ['id', 'type', 'userId', 'isActive', 'reason', 'updatedAt'],
  // Whose approval it is: the account owner (type 'user') or the product owner (type 'product')
  include: [{ association: 'user', attributes: { exclude: ['password'] } }],
};

// ---------- sending ----------

/** Same shape as the REST API returns (no userId). */
function toClient(n: Notification) {
  const { userId: _userId, ...rest } = n.toJSON() as unknown as Record<string, unknown>;
  return rest;
}

async function toUsers(userIds: string[], payload: Payload) {
  if (!userIds.length) return;
  const created = await Notification.bulkCreate(
    userIds.map((userId) => ({
      userId,
      type: payload.type,
      name: payload.name,
      description: payload.description,
      entityType: payload.entityType ?? null,
      entityId: payload.entityId ?? null,
      approvalId: payload.approvalId ?? null,
      readAt: null,
    })),
  );
  // Reloaded so the pushed notification includes its approval, like GET /api/notifications
  const sent = await Notification.findAll({ where: { id: created.map((n) => n.id) }, include: [APPROVAL_INCLUDE] });

  // Realtime: push each copy to its recipient, with their new unread count
  const counts = (await Notification.findAll({
    attributes: ['userId', [fn('COUNT', col('id')), 'count']],
    where: { userId: userIds, readAt: null },
    group: ['userId'],
    raw: true,
  })) as unknown as { userId: string; count: string }[];
  const unread = new Map(counts.map((c) => [c.userId, Number(c.count)]));
  for (const n of sent) {
    emitToUser(n.userId, E.NOTIFICATION_NEW, { notification: toClient(n), unreadCount: unread.get(n.userId) ?? 0 });
  }
}

/** Realtime: tell every open tab of this user the new unread count. */
async function pushUnreadCount(user: AuthUser) {
  emitToUser(user.id, E.NOTIFICATION_UNREAD_COUNT, { count: await countUnread(user) });
}

/** Every user with this role (or any of these roles) gets their own copy. */
async function toRole(role: Role | Role[], payload: Payload) {
  const users = await User.findAll({ where: { role }, attributes: ['id'] });
  await toUsers(users.map((u) => u.id), payload);
}

/**
 * Notifications must never break the action that triggered them:
 * failures are logged and swallowed, and the caller does not wait on the result's success.
 */
async function safely(event: string, send: () => Promise<unknown>) {
  try {
    await send();
  } catch (err) {
    console.error(`[notifications] failed to send "${event}":`, err);
  }
}

const fullName = (u: { firstName: string; lastName: string }) => `${u.firstName} ${u.lastName}`;

interface NewUser {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  role: Role;
}

/** Superadmins hear about every new account, whatever its role. */
const userRegisteredToSuperadmins = (user: NewUser, approvalId: number) =>
  toRole(ROLES.SUPERADMIN, {
    type: T.USER_REGISTERED,
    name: `New ${user.role} account`,
    description: `${fullName(user)} (${user.email}) was registered as ${user.role}.`,
    entityType: 'user',
    entityId: user.id,
    approvalId,
  });

/** The events below are called from the services after their own change has been saved. */
export const notify = {
  /** disnakertrans: a new admin waits for activation; superadmin: a new account was created */
  adminRegistered: (admin: NewUser, approvalId: number) =>
    safely('adminRegistered', async () => {
      await toRole(ROLES.DISNAKERTRANS, {
        type: T.ADMIN_PENDING_ACTIVATION,
        name: 'New admin waiting for activation',
        description: `${fullName(admin)} (${admin.email}) signed up as admin and needs to be activated.`,
        entityType: 'user',
        entityId: admin.id,
        approvalId,
      });
      await userRegisteredToSuperadmins(admin, approvalId);
    }),

  /** admin: a new tenant signed up; superadmin: a new account was created */
  tenantRegistered: (tenant: NewUser & { tenantName?: string | null }, approvalId: number) =>
    safely('tenantRegistered', async () => {
      await toRole(ROLES.ADMIN, {
        type: T.TENANT_REGISTERED,
        name: 'New tenant registered',
        description: `${tenant.tenantName ?? fullName(tenant)} (${tenant.email}) just signed up as a tenant.`,
        entityType: 'user',
        entityId: tenant.id,
        approvalId,
      });
      await userRegisteredToSuperadmins(tenant, approvalId);
    }),

  /** superadmin: a superadmin created a disnakertrans account */
  disnakertransCreated: (user: NewUser, approvalId: number) =>
    safely('disnakertransCreated', () => userRegisteredToSuperadmins(user, approvalId)),

  /** superadmin: a new product exists; admin + disnakertrans: review it; tenant: it is under review */
  productSubmitted: (
    product: { id: string; name: string; approvalId: number | null },
    owner: { id: string; tenantName?: string | null },
  ) =>
    safely('productSubmitted', async () => {
      const by = owner.tenantName ?? 'A tenant';
      const link = { entityType: 'product' as const, entityId: product.id, approvalId: product.approvalId };
      await toRole(ROLES.SUPERADMIN, {
        type: T.PRODUCT_SUBMITTED,
        name: 'New product waiting for approval',
        description: `${by} created "${product.name}". It waits for an admin or disnakertrans to review and activate it.`,
        ...link,
      });
      await toRole(PRODUCT_APPROVER_ROLES, {
        type: T.PRODUCT_SUBMITTED,
        name: 'New product to review',
        description: `${by} created "${product.name}". Please review and activate it.`,
        ...link,
      });
      await toUsers([owner.id], {
        type: T.PRODUCT_UNDER_REVIEW,
        name: 'Product under review',
        description: `"${product.name}" was created and is under review. You will be notified when it is approved.`,
        ...link,
      });
    }),

  /** admin + disnakertrans: a tenant changed a product */
  productUpdated: (product: { id: string; name: string }, owner: { tenantName?: string | null }) =>
    safely('productUpdated', () =>
      toRole(PRODUCT_APPROVER_ROLES, {
        type: T.PRODUCT_UPDATED,
        name: 'Product updated',
        description: `${owner.tenantName ?? 'A tenant'} updated "${product.name}".`,
        entityType: 'product',
        entityId: product.id,
      }),
    ),

  /** admin: a tenant changed their tenant profile */
  tenantProfileUpdated: (tenant: { id: string; name: string }) =>
    safely('tenantProfileUpdated', () =>
      toRole(ROLES.ADMIN, {
        type: T.TENANT_PROFILE_UPDATED,
        name: 'Tenant profile updated',
        description: `${tenant.name} updated their tenant profile.`,
        entityType: 'tenant',
        entityId: tenant.id,
      }),
    ),

  /**
   * A product's activation changed (only real changes notify, not re-sending the same value).
   * activated → admin + disnakertrans: it is on the landing page; tenant: it is approved.
   * deactivated by an admin or disnakertrans → superadmin.
   */
  productActivationChanged: (
    actor: AuthUser,
    product: { id: string; name: string; tenantId: string; approvalId: number | null },
    isActive: boolean,
  ) =>
    safely('productActivationChanged', async () => {
      const link = { entityType: 'product' as const, entityId: product.id, approvalId: product.approvalId };
      if (isActive) {
        await toRole(PRODUCT_APPROVER_ROLES, {
          type: T.PRODUCT_PUBLISHED,
          name: 'Product published',
          description: `"${product.name}" was activated by ${actor.email} and is now on the landing page.`,
          ...link,
        });
        await toUsers([product.tenantId], {
          type: T.PRODUCT_APPROVED,
          name: 'Product approved',
          description: `"${product.name}" was approved and is now visible on the landing page.`,
          ...link,
        });
      } else if (PRODUCT_APPROVER_ROLES.includes(actor.role)) {
        await toRole(ROLES.SUPERADMIN, {
          type: T.PRODUCT_DEACTIVATED,
          name: `Product deactivated by ${actor.role === ROLES.ADMIN ? 'an admin' : 'a disnakertrans'}`,
          description: `${actor.email} deactivated the product "${product.name}".`,
          ...link,
        });
      }
    }),

  /** superadmin: a disnakertrans or admin deactivated a user account (only real changes notify) */
  userDeactivatedByAdmin: (actor: AuthUser, user: { id: string; email: string; role: Role }, approvalId: number) =>
    safely('userDeactivatedByAdmin', () =>
      toRole(ROLES.SUPERADMIN, {
        type: T.USER_DEACTIVATED,
        name: `User deactivated by ${actor.role}`,
        description: `${actor.email} deactivated the ${user.role} account ${user.email}.`,
        entityType: 'user',
        entityId: user.id,
        approvalId,
      }),
    ),
};

// ---------- reading (own notifications only) ----------

export interface ListNotificationsOptions {
  page: number;
  limit: number;
  unreadOnly: boolean;
}

export async function list(user: AuthUser, { page, limit, unreadOnly }: ListNotificationsOptions) {
  const where = { userId: user.id, ...(unreadOnly && { readAt: null }) };
  const [{ rows, count }, unreadCount] = await Promise.all([
    Notification.findAndCountAll({
      where,
      attributes: { exclude: ['userId'] },
      include: [APPROVAL_INCLUDE],
      order: [['createdAt', 'DESC'], ['id', 'DESC']],
      limit,
      offset: (page - 1) * limit,
    }),
    countUnread(user),
  ]);
  return { notifications: rows, meta: { page, limit, total: count, totalPages: Math.ceil(count / limit), unreadCount } };
}

export const countUnread = (user: AuthUser) => Notification.count({ where: { userId: user.id, readAt: null } });

async function findOwn(user: AuthUser, id: number) {
  const notification = await Notification.findOne({
    where: { id, userId: user.id },
    attributes: { exclude: ['userId'] },
    include: [APPROVAL_INCLUDE],
  });
  if (!notification) throw HttpError.notFound('Notifikasi tidak ditemukan');
  return notification;
}

export async function markRead(user: AuthUser, id: number) {
  const notification = await findOwn(user, id);
  if (!notification.readAt) {
    await notification.update({ readAt: new Date() });
    await pushUnreadCount(user);
  }
  return notification;
}

export async function markAllRead(user: AuthUser) {
  const [updated] = await Notification.update({ readAt: new Date() }, { where: { userId: user.id, readAt: { [Op.is]: null } } });
  if (updated) await pushUnreadCount(user);
  return { updated };
}

export async function remove(user: AuthUser, id: number) {
  const notification = await findOwn(user, id);
  const wasUnread = !notification.readAt;
  await notification.destroy();
  if (wasUnread) await pushUnreadCount(user);
}
