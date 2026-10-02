/**
 * Socket.IO event names shared with the frontend.
 *
 * Connect:  io(API_URL, { auth: { token: accessToken } })   (or header `Authorization: Bearer <token>`)
 * Each user only receives their own events.
 */
export const REALTIME_EVENTS = {
  /** server → client: a new notification for you. Payload: { notification, unreadCount } */
  NOTIFICATION_NEW: 'notification:new',
  /** server → client: your unread count changed (on connect, mark read, read-all, delete). Payload: { count } */
  NOTIFICATION_UNREAD_COUNT: 'notification:unread-count',
  /**
   * server → client, right before the server disconnects you. Payload: { reason, message }
   * reason: 'token_expired' | 'logged_out' | 'deactivated' — log in again (or stop) instead of reconnecting with the same token.
   */
  SESSION_ENDED: 'session:ended',
} as const;

export type SessionEndReason = 'token_expired' | 'logged_out' | 'deactivated';
