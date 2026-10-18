import { Router } from 'express';
import { SITE_CONTENT_EDITOR_ROLES } from '../constants/roles';
import * as siteContentController from '../controllers/siteContent.controller';
import { authenticate, authorize } from '../middlewares/auth';

const router = Router();

// Texts of the public site (menu "Konten Situs"); visitors read them through GET /api/landing/site
router.use(authenticate, authorize(...SITE_CONTENT_EDITOR_ROLES));
router.get('/', siteContentController.get);
router.patch('/', siteContentController.update);

export default router;
