import { Router } from 'express';
import { STATS_READER_ROLES } from '../constants/roles';
import * as statsController from '../controllers/stats.controller';
import { authenticate, authorize } from '../middlewares/auth';

const router = Router();

// Dashboard charts (products, UMKM, users); user numbers follow what each role may list
router.get('/overview', authenticate, authorize(...STATS_READER_ROLES), statsController.overview);

export default router;
