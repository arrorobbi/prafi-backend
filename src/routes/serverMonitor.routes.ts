import { Router } from 'express';
import { ROLES } from '../constants/roles';
import { authenticate, authorize } from '../middlewares/auth';
import { collect, PUSH_SECONDS } from '../services/serverMonitor.service';

const router = Router();

/**
 * GET /api/server/metrics — superadmin: one reading of this server (CPU, memory, disk, services, storage).
 * The Monitor Server page shows it at once, then follows the live `server:metrics` events (every PUSH_SECONDS).
 */
router.get('/metrics', authenticate, authorize(ROLES.SUPERADMIN), async (_req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json({ success: true, data: await collect(), meta: { pushSeconds: PUSH_SECONDS } });
});

export default router;
