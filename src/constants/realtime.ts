/**
 * Socket.IO event names shared with the frontend.
 *
 * Connect:  io(API_URL, { auth: { token: accessToken } })   (or header `Authorization: Bearer <token>`)
 * Each user only receives their own events, plus events for their role (e.g. the superadmin's API logs).
 */
export const REALTIME_EVENTS = {
  /** server → client: a new notification for you. Payload: { notification, unreadCount } */
  NOTIFICATION_NEW: 'notification:new',
  /** server → client: your unread count changed (on connect, mark read, read-all, delete). Payload: { count } */
  NOTIFICATION_UNREAD_COUNT: 'notification:unread-count',
  /**
   * server → client, right before the server disconnects you. Payload: { reason, message }
   * reason: 'token_expired' | 'logged_out' | 'deactivated' | 'password_reset' — log in again (or stop) instead of reconnecting with the same token.
   */
  SESSION_ENDED: 'session:ended',
  /**
   * server → superadmins: a new API log row was saved (same shape as GET /api/logs, without errorStack).
   * Payload: { log }
   */
  LOG_NEW: 'log:new',
  /**
   * server → the product's seller (always) and admins + disnakertrans (reports and decisions): a review was posted,
   * reported, hidden, kept or shown again. The Ulasan pages reload. Payload: { reviewId, productId, action }
   * action: 'created' | 'reported' | 'hidden' | 'kept' | 'unhidden'
   */
  REVIEW_CHANGED: 'review:changed',
} as const;

export type ReviewChange = 'created' | 'reported' | 'hidden' | 'kept' | 'unhidden';

export type SessionEndReason = 'token_expired' | 'logged_out' | 'deactivated' | 'password_reset';
