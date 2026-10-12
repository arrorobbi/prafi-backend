import fs from 'node:fs/promises';
import path from 'node:path';
import { Router } from 'express';
import { env } from '../config/env';
import { ROLES } from '../constants/roles';
import { authenticate, authorize } from '../middlewares/auth';
import { markdown } from '../utils/markdown';

const router = Router();

const DOCS_DIR = path.resolve(__dirname, '../../docs');
/**
 * The guide in both languages (the EN / ID switch on the page), read on every request: editing a file needs no
 * rebuild or restart. Keep the two files in step: same sections, same order.
 */
const GUIDE_FILES = { en: 'SERVER-GUIDE.md', id: 'SERVER-GUIDE.id.md' } as const;
type Lang = keyof typeof GUIDE_FILES;
/** The login page and its scripts: public, they hold no server information. */
const PAGE_DIR = path.join(DOCS_DIR, 'server-page');

/**
 * The guide's pictures are the website's own guide screenshots (prafi-frontend/public/panduan/), so this page may
 * load images from the frontend's address too (it is also opened directly on the API's domain).
 */
const PAGE_CSP =
  `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: ${new URL(env.frontendUrl).origin}; ` +
  "connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'";

// GET /api/docs/server — the page: a superadmin login, then the guide
router.get('/server', (_req, res) => {
  res.set('Content-Security-Policy', PAGE_CSP).sendFile(path.join(PAGE_DIR, 'index.html'));
});
for (const script of ['app.js', 'theme.js']) {
  router.get(`/server/${script}`, (_req, res) => {
    res.type('application/javascript').sendFile(path.join(PAGE_DIR, script));
  });
}

/**
 * GET /api/docs/server/content?lang=id|en — the server guide as HTML, superadmin only (Bearer token).
 * Never cached: it must not be served to anyone from a cache.
 */
router.get('/server/content', authenticate, authorize(ROLES.SUPERADMIN), async (req, res) => {
  const lang: Lang = req.query.lang === 'en' ? 'en' : 'id';
  const file = path.join(DOCS_DIR, GUIDE_FILES[lang]);
  const [md, stat] = await Promise.all([fs.readFile(file, 'utf8'), fs.stat(file)]);
  // Pictures are written as panduan/<name>.jpg: files of the frontend, at <FRONTEND_URL>/panduan/
  const html = markdown(md).replace(/(src|href)="panduan\//g, `$1="${env.frontendUrl}/panduan/`);
  res.set('Cache-Control', 'no-store');
  res.json({ success: true, data: { lang, html, updatedAt: stat.mtime } });
});

export default router;
