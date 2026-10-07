import type { Request } from 'express';

/** The client's IP: behind nginx/the frontend proxy the socket is local, so the first X-Forwarded-For entry wins. */
export function clientIp(req: Request) {
  const forwarded = req.headers['x-forwarded-for'];
  const first = (Array.isArray(forwarded) ? forwarded[0] : forwarded)?.split(',')[0]?.trim();
  return (first || req.socket.remoteAddress || null)?.slice(0, 64) ?? null;
}
