import type { Request, RequestHandler } from 'express';
import type { LogLevel } from '../models/apiLog.model';
import * as apiLogService from '../services/apiLog.service';

/** Set by the errorHandler on res.locals, so the request's log row carries its error. */
export interface LoggedError {
  code: string;
  message: string;
  details?: unknown;
  /** Only for 5xx (server faults) */
  stack?: string;
}

/** Query parameters whose values are secrets (e.g. the email activation link's ?token=). */
const SECRET_PARAMS = /^(token|otp|password|code)$/i;

/** The query string with secret values replaced by ***, or null when there is none. */
function maskedQuery(originalUrl: string) {
  const i = originalUrl.indexOf('?');
  if (i < 0 || i === originalUrl.length - 1) return null;
  const params = new URLSearchParams(originalUrl.slice(i + 1));
  for (const key of params.keys()) if (SECRET_PARAMS.test(key)) params.set(key, '***');
  return decodeURIComponent(params.toString());
}

/** The client's IP: behind nginx/the frontend proxy the socket is local, so the first X-Forwarded-For entry wins. */
function clientIp(req: Request) {
  const forwarded = req.headers['x-forwarded-for'];
  const first = (Array.isArray(forwarded) ? forwarded[0] : forwarded)?.split(',')[0]?.trim();
  return (first || req.socket.remoteAddress || null)?.slice(0, 64) ?? null;
}

const levelOf = (status: number): LogLevel => (status >= 500 ? 'error' : status >= 400 ? 'warn' : 'info');

/**
 * Not saved to the database: reading the logs (it would log itself on every page of the log viewer),
 * and successful static files (every image on a page would be a row). Their failures are still saved.
 */
function skipDb(path: string, status: number) {
  if (path === '/api/logs' || path.startsWith('/api/logs/')) return true;
  return status < 400 && (path.startsWith('/images/') || path === '/docs' || path.startsWith('/docs/'));
}

/**
 * Logs one line per request when the response finishes, e.g.
 *   [14:05:12] POST /api/auth/register 201 254ms - admin admin1@prafi.test
 * and saves it to api_logs (GET /api/logs). Request bodies are never logged (they contain passwords).
 */
export const requestLogger: RequestHandler = (req, res, next) => {
  const start = process.hrtime.bigint();

  res.on('finish', () => {
    const ms = Number(process.hrtime.bigint() - start) / 1e6;
    const path = req.originalUrl.split('?')[0];
    const query = maskedQuery(req.originalUrl);
    const status = res.statusCode;

    const time = new Date().toLocaleTimeString('en-GB', { hour12: false });
    const who = req.user ? ` - ${req.user.role} ${req.user.email}` : '';
    const line = `[${time}] ${req.method} ${path}${query ? `?${query}` : ''} ${status} ${ms.toFixed(0)}ms${who}`;
    if (status >= 500) console.error(line);
    else if (status >= 400) console.warn(line);
    else console.log(line);

    if (skipDb(path, status)) return;
    const error = res.locals.apiError as LoggedError | undefined;
    apiLogService.record({
      level: levelOf(status),
      method: req.method,
      path,
      query,
      statusCode: status,
      durationMs: Math.round(ms),
      userId: req.user?.id ?? null,
      userEmail: req.user?.email ?? null,
      userRole: req.user?.role ?? null,
      ip: clientIp(req),
      userAgent: req.get('user-agent') ?? null,
      errorCode: error?.code ?? null,
      errorMessage: error?.message ?? null,
      errorDetails: error?.details ?? null,
      errorStack: error?.stack ?? null,
    });
  });

  next();
};
