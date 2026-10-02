/**
 * Notification event codes. The frontend switches on `type` to pick an icon/route;
 * `entityType` + `entityId` say what to open.
 *
 * Recipients:
 *   superadmin — ADMIN_PENDING_ACTIVATION, PRODUCT_SUBMITTED, USER_DEACTIVATED, PRODUCT_DEACTIVATED
 *   admin      — PRODUCT_SUBMITTED, PRODUCT_PUBLISHED, PRODUCT_UPDATED, TENANT_PROFILE_UPDATED, TENANT_REGISTERED
 *   tenant     — PRODUCT_UNDER_REVIEW, PRODUCT_APPROVED
 */
export const NOTIFICATION_TYPES = {
  /** A new admin was registered and waits for a superadmin to activate it. */
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
  /** A tenant changed their tenant profile. */
  TENANT_PROFILE_UPDATED: 'TENANT_PROFILE_UPDATED',
  /** A new tenant signed up. */
  TENANT_REGISTERED: 'TENANT_REGISTERED',
  /** To the tenant: their new product is under review. */
  PRODUCT_UNDER_REVIEW: 'PRODUCT_UNDER_REVIEW',
  /** To the tenant: their product was approved and is live. */
  PRODUCT_APPROVED: 'PRODUCT_APPROVED',
} as const;

export type NotificationType = (typeof NOTIFICATION_TYPES)[keyof typeof NOTIFICATION_TYPES];

export type NotificationEntityType = 'user' | 'product' | 'tenant';
