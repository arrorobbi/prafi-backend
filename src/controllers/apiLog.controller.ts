import type { RequestHandler } from 'express';
import { HttpError } from '../errors/HttpError';
import { LOG_LEVELS, type LogLevel } from '../models/apiLog.model';
import * as apiLogService from '../services/apiLog.service';

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;
const METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'HEAD'];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** A date (2026-10-07) or a full ISO time; a bare date for `to` means the end of that day. */
function parseDate(value: string, endOfDay: boolean) {
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(value);
  const date = new Date(dateOnly ? `${value}T00:00:00` : value);
  if (Number.isNaN(date.getTime())) return null;
  if (dateOnly && endOfDay) date.setHours(23, 59, 59, 999);
  return date;
}

/**
 * GET /api/logs?page=&limit=&outcome=&level=&method=&status=&path=&userId=&email=&errorCode=&from=&to= — superadmin
 * only. Newest first. outcome: success (< 400) or failed (4xx and 5xx). status is an exact code (404) or a class (4xx).
 */
export const list: RequestHandler = async (req, res) => {
  const q = req.query as Record<string, string | undefined>;
  const errors: { field: string; message: string }[] = [];

  const page = Number(q.page ?? 1);
  if (!Number.isInteger(page) || page < 1) errors.push({ field: 'page', message: 'page harus berupa bilangan bulat positif' });
  const limit = Number(q.limit ?? DEFAULT_LIMIT);
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_LIMIT) {
    errors.push({ field: 'limit', message: `limit harus berupa bilangan bulat antara 1 dan ${MAX_LIMIT}` });
  }
  if (q.level !== undefined && !LOG_LEVELS.includes(q.level as LogLevel)) {
    errors.push({ field: 'level', message: `level harus salah satu dari: ${LOG_LEVELS.join(', ')}` });
  }
  if (q.outcome !== undefined && q.outcome !== 'success' && q.outcome !== 'failed') {
    errors.push({ field: 'outcome', message: 'outcome harus bernilai success atau failed' });
  }
  const method = q.method?.toUpperCase();
  if (method !== undefined && !METHODS.includes(method)) {
    errors.push({ field: 'method', message: `method harus salah satu dari: ${METHODS.join(', ')}` });
  }

  let status: apiLogService.ListLogsOptions['status'];
  if (q.status !== undefined) {
    const s = q.status.trim().toLowerCase();
    if (/^[1-5]xx$/.test(s)) status = { class: Number(s[0]) };
    else if (/^[1-5]\d\d$/.test(s)) status = { exact: Number(s) };
    else errors.push({ field: 'status', message: 'status harus berupa kode (mis. 404) atau kelas (mis. 4xx)' });
  }

  if (q.userId !== undefined && !UUID.test(q.userId)) errors.push({ field: 'userId', message: 'userId harus berupa UUID' });

  const from = q.from !== undefined ? parseDate(q.from, false) : undefined;
  if (from === null) errors.push({ field: 'from', message: 'from harus berupa tanggal (YYYY-MM-DD) atau waktu ISO' });
  const to = q.to !== undefined ? parseDate(q.to, true) : undefined;
  if (to === null) errors.push({ field: 'to', message: 'to harus berupa tanggal (YYYY-MM-DD) atau waktu ISO' });
  if (from && to && from > to) errors.push({ field: 'to', message: 'to tidak boleh sebelum from' });

  if (errors.length) throw HttpError.badRequest('Validasi gagal', errors);

  const { logs, meta } = await apiLogService.list({
    page,
    limit,
    level: q.level as LogLevel | undefined,
    outcome: q.outcome as 'success' | 'failed' | undefined,
    method,
    status,
    path: q.path?.trim() || undefined,
    userId: q.userId,
    email: q.email?.trim() || undefined,
    errorCode: q.errorCode?.trim() || undefined,
    from: from ?? undefined,
    to: to ?? undefined,
  });
  res.json({ success: true, data: logs, meta });
};

/** GET /api/logs/:id — one log with its errorStack (5xx). */
export const get: RequestHandler = async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id < 1) {
    throw HttpError.badRequest('Validasi gagal', [{ field: 'id', message: 'id harus berupa bilangan bulat positif' }]);
  }
  res.json({ success: true, data: await apiLogService.get(id) });
};
