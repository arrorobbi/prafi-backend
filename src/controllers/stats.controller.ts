import type { RequestHandler } from 'express';
import { HttpError } from '../errors/HttpError';
import * as statsService from '../services/stats.service';

const DEFAULT_DAYS = 30;
const MAX_DAYS = 365;

/** ?days= (1-365) for the per-day series */
export function parseDays(value: unknown, fallback = DEFAULT_DAYS) {
  if (value === undefined) return fallback;
  const days = Number(value);
  if (!Number.isInteger(days) || days < 1 || days > MAX_DAYS) {
    throw HttpError.badRequest('Validasi gagal', [{ field: 'days', message: `days harus berupa bilangan bulat antara 1 dan ${MAX_DAYS}` }]);
  }
  return days;
}

/** GET /api/stats/overview?days= — superadmin, disnakertrans, admin: numbers for the dashboard charts. */
export const overview: RequestHandler = async (req, res) => {
  res.json({ success: true, data: await statsService.overview(req.user!, parseDays(req.query.days)) });
};

/** GET /api/logs/stats?days= — superadmin: numbers for the API log charts. */
export const logs: RequestHandler = async (req, res) => {
  res.json({ success: true, data: await statsService.logs(parseDays(req.query.days, 14)) });
};
