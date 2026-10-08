import { Op, type WhereOptions } from 'sequelize';
import { env } from '../config/env';
import { LOG_READER_ROLES } from '../constants/roles';
import { REALTIME_EVENTS as E } from '../constants/realtime';
import { HttpError } from '../errors/HttpError';
import { ApiLog } from '../models';
import type { LogLevel } from '../models/apiLog.model';
import type { InferCreationAttributes } from 'sequelize';
import { emitToRoles } from '../realtime/socket';

type NewLog = Omit<InferCreationAttributes<ApiLog>, 'id' | 'createdAt'>;

// ---------- writing ----------

/**
 * Logging must never break or slow down the request it describes:
 * the insert isn't awaited by the response, and failures only go to the console.
 * Saved rows are pushed live to signed-in superadmins (log:new), like the list (no errorStack).
 */
export function record(entry: NewLog) {
  ApiLog.create(entry)
    .then((row) => {
      const { errorStack: _stack, ...log } = row.toJSON();
      emitToRoles(LOG_READER_ROLES, E.LOG_NEW, { log });
    })
    .catch((err) => console.error('[api-logs] failed to save a log row:', err));
}

// ---------- retention ----------

const DAY_MS = 86_400_000;

export async function purgeOld() {
  const before = new Date(Date.now() - env.logRetentionDays * DAY_MS);
  const deleted = await ApiLog.destroy({ where: { createdAt: { [Op.lt]: before } } });
  if (deleted) console.log(`[api-logs] purged ${deleted} log rows older than ${env.logRetentionDays} days`);
}

/** Purges once at startup, then daily. The timer doesn't keep the process alive on shutdown. */
export function startRetention() {
  const run = () => purgeOld().catch((err) => console.error('[api-logs] purge failed:', err));
  void run();
  setInterval(run, DAY_MS).unref();
}

// ---------- reading (superadmin) ----------

export interface ListLogsOptions {
  page: number;
  limit: number;
  level?: LogLevel;
  /** success = status < 400, failed = 400 and up (both client 4xx and server 5xx errors) */
  outcome?: 'success' | 'failed';
  method?: string;
  /** An exact code (404) or a class (4 = every 4xx) */
  status?: { exact: number } | { class: number };
  /** Substring of the path, case-insensitive */
  path?: string;
  userId?: string;
  /** Substring of the user's email or of the email given to an auth endpoint, case-insensitive */
  email?: string;
  errorCode?: string;
  from?: Date;
  to?: Date;
}

/** The list leaves out errorStack (large); GET /api/logs/:id returns it. */
export async function list(opts: ListLogsOptions) {
  const { page, limit } = opts;
  const where: WhereOptions<ApiLog>[] = [];
  if (opts.level) where.push({ level: opts.level });
  if (opts.outcome === 'success') where.push({ statusCode: { [Op.lt]: 400 } });
  if (opts.outcome === 'failed') where.push({ statusCode: { [Op.gte]: 400 } });
  if (opts.method) where.push({ method: opts.method });
  if (opts.status && 'exact' in opts.status) where.push({ statusCode: opts.status.exact });
  if (opts.status && 'class' in opts.status) {
    where.push({ statusCode: { [Op.gte]: opts.status.class * 100, [Op.lt]: (opts.status.class + 1) * 100 } });
  }
  if (opts.path) where.push({ path: { [Op.iLike]: `%${escapeLike(opts.path)}%` } });
  if (opts.userId) where.push({ userId: opts.userId });
  if (opts.email) {
    // The signed-in user's email, or the email given to an auth endpoint (e.g. a failed login)
    const like = { [Op.iLike]: `%${escapeLike(opts.email)}%` };
    where.push({ [Op.or]: [{ userEmail: like }, { authEmail: like }] });
  }
  if (opts.errorCode) where.push({ errorCode: opts.errorCode });
  if (opts.from) where.push({ createdAt: { [Op.gte]: opts.from } });
  if (opts.to) where.push({ createdAt: { [Op.lte]: opts.to } });

  const { rows, count } = await ApiLog.findAndCountAll({
    where: { [Op.and]: where },
    attributes: { exclude: ['errorStack'] },
    order: [['createdAt', 'DESC'], ['id', 'DESC']],
    limit,
    offset: (page - 1) * limit,
  });
  return { logs: rows, meta: { page, limit, total: count, totalPages: Math.ceil(count / limit) } };
}

export async function get(id: number) {
  const log = await ApiLog.findByPk(id);
  if (!log) throw HttpError.notFound('Log tidak ditemukan');
  return log;
}

/** % and _ typed in a filter are matched literally. */
const escapeLike = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`);
