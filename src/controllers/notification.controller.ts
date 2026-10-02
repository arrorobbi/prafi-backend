import type { RequestHandler } from 'express';
import { HttpError } from '../errors/HttpError';
import * as notificationService from '../services/notification.service';

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

function parseId(value: unknown) {
  const id = Number(value);
  if (!Number.isInteger(id) || id < 1) {
    throw HttpError.badRequest('Validasi gagal', [{ field: 'id', message: 'id harus berupa bilangan bulat positif' }]);
  }
  return id;
}

/** GET /api/notifications?page=&limit=&unread=true — your own notifications, newest first. meta.unreadCount for the badge. */
export const list: RequestHandler = async (req, res) => {
  const { page = '1', limit = String(DEFAULT_LIMIT), unread } = req.query as Record<string, string | undefined>;
  const errors: { field: string; message: string }[] = [];
  const pageNum = Number(page);
  if (!Number.isInteger(pageNum) || pageNum < 1) errors.push({ field: 'page', message: 'page harus berupa bilangan bulat positif' });
  const limitNum = Number(limit);
  if (!Number.isInteger(limitNum) || limitNum < 1 || limitNum > MAX_LIMIT) {
    errors.push({ field: 'limit', message: `limit harus berupa bilangan bulat antara 1 dan ${MAX_LIMIT}` });
  }
  if (unread !== undefined && unread !== 'true' && unread !== 'false') {
    errors.push({ field: 'unread', message: 'unread harus bernilai true atau false' });
  }
  if (errors.length) throw HttpError.badRequest('Validasi gagal', errors);

  const { notifications, meta } = await notificationService.list(req.user!, {
    page: pageNum,
    limit: limitNum,
    unreadOnly: unread === 'true',
  });
  res.json({ success: true, data: notifications, meta });
};

/** GET /api/notifications/unread-count — for polling the badge. */
export const unreadCount: RequestHandler = async (req, res) => {
  res.json({ success: true, data: { count: await notificationService.countUnread(req.user!) } });
};

export const markRead: RequestHandler = async (req, res) => {
  res.json({ success: true, data: await notificationService.markRead(req.user!, parseId(req.params.id)) });
};

export const markAllRead: RequestHandler = async (req, res) => {
  res.json({ success: true, data: await notificationService.markAllRead(req.user!) });
};

export const remove: RequestHandler = async (req, res) => {
  await notificationService.remove(req.user!, parseId(req.params.id));
  res.json({ success: true, data: null });
};
