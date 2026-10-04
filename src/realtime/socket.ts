import type { Server as HttpServer } from 'node:http';
import { Server, type Socket } from 'socket.io';
import { env } from '../config/env';
import { REALTIME_EVENTS as E, type SessionEndReason } from '../constants/realtime';
import { HttpError } from '../errors/HttpError';
import { verifyAccess } from '../middlewares/auth';
import { Notification } from '../models';
import type { AuthUser } from '../types/express';

interface SocketData {
  user: AuthUser;
  jti?: string;
}

let io: Server | null = null;

const roomOf = (userId: string) => `user:${userId}`;

/** Token from the Socket.IO auth payload (`io(url, { auth: { token } })`) or an `Authorization: Bearer` header (Postman). */
function tokenFrom(socket: Socket) {
  const fromAuth = socket.handshake.auth?.token;
  if (typeof fromAuth === 'string' && fromAuth.trim()) return fromAuth.replace(/^Bearer\s+/i, '').trim();
  const header = socket.handshake.headers.authorization;
  if (header?.startsWith('Bearer ')) return header.slice('Bearer '.length).trim();
  return null;
}

/** Attaches Socket.IO to the HTTP server. Clients connect to the same host/port as the API. */
export function initRealtime(httpServer: HttpServer) {
  io = new Server(httpServer, {
    cors: { origin: env.corsOrigin.length ? env.corsOrigin : false, credentials: true },
  });

  // Same checks as the REST API; a failed check rejects the connection with { message, data: { code } }
  io.use(async (socket, next) => {
    try {
      const token = tokenFrom(socket);
      if (!token) throw HttpError.unauthorized('Token tidak ada: hubungkan dengan { auth: { token } } atau header Authorization: Bearer');
      const { user, token: info } = await verifyAccess(token);
      (socket.data as SocketData) = { user, jti: info.jti };

      // Disconnect when the token expires, so the client logs in again instead of staying connected forever
      // (capped: Node timers overflow above ~24.8 days)
      const msLeft = info.expiresAt.getTime() - Date.now();
      const timer = setTimeout(() => endSession(socket, 'token_expired'), Math.min(Math.max(msLeft, 0), 2_147_483_647));
      socket.on('disconnect', () => clearTimeout(timer));
      next();
    } catch (err) {
      const e = err instanceof HttpError ? err : HttpError.unauthorized('Token tidak valid');
      const error = new Error(e.message) as Error & { data?: unknown };
      error.data = { code: e.code, statusCode: e.statusCode };
      next(error);
    }
  });

  io.on('connection', async (socket) => {
    const { user } = socket.data as SocketData;
    await socket.join(roomOf(user.id));
    // Initial sync so the badge is correct right after connecting
    socket.emit(E.NOTIFICATION_UNREAD_COUNT, { count: await Notification.count({ where: { userId: user.id, readAt: null } }) });
  });

  return io;
}

const SESSION_MESSAGES: Record<SessionEndReason, string> = {
  token_expired: 'Sesi Anda telah berakhir, silakan login kembali',
  logged_out: 'Anda telah logout',
  deactivated: 'Akun Anda telah dinonaktifkan, hubungi administrator',
  password_reset: 'Kata sandi Anda telah diubah, silakan login kembali dengan kata sandi baru',
};

function endSession(socket: Socket, reason: SessionEndReason) {
  socket.emit(E.SESSION_ENDED, { reason, message: SESSION_MESSAGES[reason] });
  socket.disconnect(true);
}

/** Sends an event to every open connection (tab/device) of one user. No-op if realtime isn't started (e.g. scripts). */
export function emitToUser(userId: string, event: string, payload: unknown) {
  io?.to(roomOf(userId)).emit(event, payload);
}

/** Ends a user's open connections: all of them, or only those using one token (logout of one session). */
export async function endUserSessions(userId: string, reason: SessionEndReason, onlyJti?: string) {
  if (!io) return;
  const sockets = await io.in(roomOf(userId)).fetchSockets();
  for (const s of sockets) {
    if (!onlyJti || (s.data as SocketData).jti === onlyJti) {
      s.emit(E.SESSION_ENDED, { reason, message: SESSION_MESSAGES[reason] });
      s.disconnect(true);
    }
  }
}

export async function closeRealtime() {
  await io?.close();
  io = null;
}
