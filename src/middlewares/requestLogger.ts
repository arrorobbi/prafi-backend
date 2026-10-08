import type { Request, RequestHandler } from 'express';
import { User } from '../models';
import type { LogLevel } from '../models/apiLog.model';
import * as apiLogService from '../services/apiLog.service';
import { clientIp } from '../utils/clientIp';

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

/** Only changes are stored: reads would be most rows and say little. */
const STORED_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/**
 * The response keys a log may keep. An allowlist on purpose: anything else (tokens, passwords, OTPs, phone
 * numbers, long texts) can never end up in the logs.
 */
const SUMMARY_KEYS = [
  'id',
  'name',
  'email',
  'role',
  'firstName',
  'lastName',
  'tenantName',
  'type',
  'isActive',
  'reason',
  'price',
  'isRecommended',
  'stars',
  'message',
  'updated',
];
/** Nested objects worth a line of their own (e.g. who an approval belongs to) */
const NESTED_KEYS = ['user', 'approval', 'product', 'tenant', 'category'];
const MAX_TEXT = 200;

function pick(value: Record<string, unknown>) {
  const out: Record<string, unknown> = {};
  for (const key of SUMMARY_KEYS) {
    const v = value[key];
    if (typeof v === 'string') out[key] = v.length > MAX_TEXT ? `${v.slice(0, MAX_TEXT)}...` : v;
    else if (typeof v === 'number' || typeof v === 'boolean' || v === null) out[key] = v;
  }
  return out;
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** `data` of a successful JSON response → its allowlisted fields (lists: just the count), or null. */
function summarize(body: unknown): Record<string, unknown> | null {
  if (!isObject(body) || body.success !== true) return null;
  const data = body.data;
  if (Array.isArray(data)) return { count: data.length };
  if (!isObject(data)) return null;
  const summary = pick(data);
  for (const key of NESTED_KEYS) {
    if (isObject(data[key])) {
      const nested = pick(data[key] as Record<string, unknown>);
      if (Object.keys(nested).length) summary[key] = nested;
    }
  }
  return Object.keys(summary).length ? summary : null;
}

/** Names of the sent fields, never their values (plus "image" for an uploaded file). */
function sentFields(body: unknown, hasFile: boolean) {
  const fields = isObject(body) ? Object.keys(body) : [];
  if (hasFile) fields.push('image');
  return fields.length ? fields.slice(0, 50) : null;
}

const levelOf = (status: number): LogLevel => (status >= 500 ? 'error' : status >= 400 ? 'warn' : 'info');

/**
 * Auth actions are always stored, even from guests: login (also a wrong email or password), sign-up, OTP,
 * activation link, resend, forgot / reset password, logout, profile changes. Not GET /api/auth/me, which every
 * dashboard page calls.
 */
function isAuthAction(method: string, path: string) {
  if (!path.startsWith('/api/auth/')) return false;
  return STORED_METHODS.has(method) || (method === 'GET' && path.startsWith('/api/auth/verify-email/'));
}

/**
 * Saved to the database: every auth action, plus create/update/delete requests from signed-in users — a valid
 * login, or at least a Bearer token (an expired/invalid one is still a session, not a guest). Other guest requests
 * (reviews, bots) and reads are not stored. The console still shows every request.
 */
const skipDb = (req: Request, path: string) =>
  !isAuthAction(req.method, path) &&
  (!STORED_METHODS.has(req.method) || (!req.user && !/^Bearer\s+\S+/i.test(req.get('authorization') ?? '')));

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * The email an auth action was about: the one typed (login, sign-up, forgot password), or the account of the
 * userId in the URL / body (OTP, activation link, resend, reset password). Never the password.
 */
async function authEmailOf(req: Request, path: string): Promise<string | null> {
  const body = isObject(req.body) ? req.body : {};
  if (typeof body.email === 'string' && body.email.trim()) return body.email.trim().toLowerCase().slice(0, 255);
  const fromPath = path.match(/^\/api\/auth\/(?:verify-otp|verify-email|resend-verification)\/([^/]+)$/)?.[1];
  const userId = fromPath ?? (typeof body.userId === 'string' ? body.userId : undefined);
  if (!userId || !UUID.test(userId)) return null;
  const user = await User.findByPk(userId, { attributes: ['email'] });
  return user?.email ?? null;
}

/**
 * Logs one line per request when the response finishes, e.g.
 *   [14:05:12] POST /api/auth/register 201 254ms - admin admin1@prafi.test
 * and saves signed-in users' create/update/delete requests to api_logs (GET /api/logs), with the names of the sent fields
 * and a safe summary of the response. Request body values are never logged (they contain passwords).
 */
export const requestLogger: RequestHandler = (req, res, next) => {
  const start = process.hrtime.bigint();

  // Keep the JSON response body for the summary (only for requests that are stored)
  if (STORED_METHODS.has(req.method)) {
    const json = res.json.bind(res);
    res.json = (body: unknown) => {
      res.locals.responseBody = body;
      return json(body);
    };
  }

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

    if (skipDb(req, path)) return;
    const error = res.locals.apiError as LoggedError | undefined;
    const entry = {
      level: levelOf(status),
      method: req.method,
      path,
      query,
      statusCode: status,
      durationMs: Math.round(ms),
      userId: req.user?.id ?? null,
      userEmail: req.user?.email ?? null,
      userRole: req.user?.role ?? null,
      authEmail: null as string | null,
      ip: clientIp(req),
      userAgent: req.get('user-agent') ?? null,
      errorCode: error?.code ?? null,
      errorMessage: error?.message ?? null,
      errorDetails: error?.details ?? null,
      errorStack: error?.stack ?? null,
      requestFields: sentFields(req.body, !!req.file),
      responseSummary: summarize(res.locals.responseBody),
    };
    if (!isAuthAction(req.method, path)) return apiLogService.record(entry);
    // Auth actions also keep the email they were about (looked up for userId-based ones)
    authEmailOf(req, path)
      .catch(() => null)
      .then((authEmail) => apiLogService.record({ ...entry, authEmail }));
  });

  next();
};
