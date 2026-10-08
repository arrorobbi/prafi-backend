import { Router } from 'express';
import { LOG_READER_ROLES } from '../constants/roles';
import * as apiLogController from '../controllers/apiLog.controller';
import * as statsController from '../controllers/stats.controller';
import { authenticate, authorize } from '../middlewares/auth';
import { requireIdParam } from '../middlewares/requireId';

const router = Router();

// Request and error logs (one row per API request); read-only, superadmin only
router.use(authenticate, authorize(...LOG_READER_ROLES));
router.param('id', requireIdParam);

router.get('/', apiLogController.list);
// Before /:id, so "stats" isn't taken for an id
router.get('/stats', statsController.logs);
router.get('/:id', apiLogController.get);

export default router;
