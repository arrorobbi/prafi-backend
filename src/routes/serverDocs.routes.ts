import fs from 'node:fs/promises';
import path from 'node:path';
import { Router } from 'express';
import { ROLES } from '../constants/roles';
import { authenticate, authorize } from '../middlewares/auth';
import { markdown } from '../utils/markdown';

const router = Router();

/** docs/SERVER-GUIDE.md, read on every request: editing it needs no rebuild or restart. */
const GUIDE_FILE = path.resolve(__dirname, '../../docs/SERVER-GUIDE.md');
/** The login page and its script: public, they hold no server information. */
const PAGE_DIR = path.resolve(__dirname, '../../docs/server-page');

// GET /api/docs/server — the page: a superadmin login, then the guide
router.get('/server', (_req, res) => {
  res.sendFile(path.join(PAGE_DIR, 'index.html'));
});
router.get('/server/app.js', (_req, res) => {
  res.type('application/javascript').sendFile(path.join(PAGE_DIR, 'app.js'));
});

/**
 * GET /api/docs/server/content — the server guide as HTML, superadmin only (Bearer token).
 * Never cached: it must not be served to anyone from a cache.
 */
router.get('/server/content', authenticate, authorize(ROLES.SUPERADMIN), async (_req, res) => {
  const [md, stat] = await Promise.all([fs.readFile(GUIDE_FILE, 'utf8'), fs.stat(GUIDE_FILE)]);
  res.set('Cache-Control', 'no-store');
  res.json({ success: true, data: { html: markdown(md), updatedAt: stat.mtime } });
});

export default router;
