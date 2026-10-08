/**
 * Notification event codes. The frontend switches on `type` to pick an icon/route;
 * `entityType` + `entityId` say what to open.
 *
 * Recipients:
 *   superadmin    — USER_REGISTERED (every new account), PRODUCT_SUBMITTED, USER_DEACTIVATED, PRODUCT_DEACTIVATED
 *   disnakertrans — ADMIN_PENDING_ACTIVATION, PRODUCT_SUBMITTED, PRODUCT_PUBLISHED, PRODUCT_UPDATED, PRODUCT_DELETED
 *   admin         — PRODUCT_SUBMITTED, PRODUCT_PUBLISHED, PRODUCT_UPDATED, PRODUCT_DELETED, TENANT_PROFILE_UPDATED,
 *                   TENANT_REGISTERED
 *   tenant        — about their own products: PRODUCT_UNDER_REVIEW, PRODUCT_APPROVED, PRODUCT_TAKEN_DOWN,
 *                   PRODUCT_CHANGES_SAVED, PRODUCT_REVIEWED
 */
export const NOTIFICATION_TYPES = {
  /** To superadmins: a new account of any role was created. */
  USER_REGISTERED: 'USER_REGISTERED',
  /** To disnakertrans: a new admin signed up and waits for a disnakertrans to activate it. */
  ADMIN_PENDING_ACTIVATION: 'ADMIN_PENDING_ACTIVATION',
  /** A tenant created a product that waits for approval. */
  PRODUCT_SUBMITTED: 'PRODUCT_SUBMITTED',
  /** An admin deactivated a user account. */
  USER_DEACTIVATED: 'USER_DEACTIVATED',
  /** An admin deactivated a product. */
  PRODUCT_DEACTIVATED: 'PRODUCT_DEACTIVATED',
  /** An admin activated a product, so it is now on the landing page. */
  PRODUCT_PUBLISHED: 'PRODUCT_PUBLISHED',
  /** A tenant changed one of their products. */
  PRODUCT_UPDATED: 'PRODUCT_UPDATED',
  /** To admins and disnakertrans: a tenant deleted one of their products (no link: the product is gone). */
  PRODUCT_DELETED: 'PRODUCT_DELETED',
  /** A tenant changed their tenant profile. */
  TENANT_PROFILE_UPDATED: 'TENANT_PROFILE_UPDATED',
  /** A new tenant signed up. */
  TENANT_REGISTERED: 'TENANT_REGISTERED',
  /** To the tenant: their new product is under review. */
  PRODUCT_UNDER_REVIEW: 'PRODUCT_UNDER_REVIEW',
  /** To the tenant: their product was approved and is live. */
  PRODUCT_APPROVED: 'PRODUCT_APPROVED',
  /** To the tenant: an admin or disnakertrans rejected / deactivated their product (with the reason). */
  PRODUCT_TAKEN_DOWN: 'PRODUCT_TAKEN_DOWN',
  /** To the tenant: their edit of a product was saved (and whether it waits for review). */
  PRODUCT_CHANGES_SAVED: 'PRODUCT_CHANGES_SAVED',
  /** To the tenant: a visitor reviewed their product. */
  PRODUCT_REVIEWED: 'PRODUCT_REVIEWED',
} as const;

export type NotificationType = (typeof NOTIFICATION_TYPES)[keyof typeof NOTIFICATION_TYPES];

export type NotificationEntityType = 'user' | 'product' | 'tenant';
