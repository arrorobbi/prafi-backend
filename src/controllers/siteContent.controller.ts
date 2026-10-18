import type { RequestHandler } from 'express';
import * as siteContentService from '../services/siteContent.service';

/** GET /api/landing/site — public: the editable texts of the site (footer "about" text). */
export const getPublic: RequestHandler = async (_req, res) => {
  res.json({ success: true, data: await siteContentService.getPublic() });
};

/** GET /api/site-content — admin, disnakertrans: the texts with their defaults and last editor. */
export const get: RequestHandler = async (_req, res) => {
  res.json({ success: true, data: await siteContentService.getForEditor() });
};

/** PATCH /api/site-content — admin, disnakertrans: { footerAbout } ("" or null = back to the default text). */
export const update: RequestHandler = async (req, res) => {
  const body = (req.body ?? {}) as Record<string, unknown>;
  res.json({ success: true, data: await siteContentService.update(body, req.user!.id) });
};
