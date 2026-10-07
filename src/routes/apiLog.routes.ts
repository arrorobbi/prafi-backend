import { Router } from 'express';
import { LOG_READER_ROLES } from '../constants/roles';
import * as apiLogController from '../controllers/apiLog.controller';
import { authenticate, authorize } from '../middlewares/auth';
import { requireIdParam } from '../middlewares/requireId';

const router = Router();

// Request and error logs (one row per API request); read-only, superadmin only
router.use(authenticate, authorize(...LOG_READER_ROLES));
router.param('id', requireIdParam);

router.get('/', apiLogController.list);
router.get('/:id', apiLogController.get);

export default router;
