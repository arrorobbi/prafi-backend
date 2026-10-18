import { Router } from 'express';
import { GUIDE_EDITOR_ROLES } from '../constants/roles';
import * as guideController from '../controllers/guide.controller';
import { authenticate, authorize } from '../middlewares/auth';
import { requireIdParam } from '../middlewares/requireId';

const router = Router();

// "Kelola Panduan": the help pages' topics and steps. Visitors read them through GET /api/landing/guides
router.use(authenticate, authorize(...GUIDE_EDITOR_ROLES));
router.param('id', requireIdParam);
router.param('stepId', requireIdParam);

router.get('/', guideController.list);
router.post('/', guideController.createSection);
// Before /:id, so "order" isn't taken for an id
router.patch('/order', guideController.reorderSections);
router.patch('/:id', guideController.updateSection);
router.delete('/:id', guideController.deleteSection);

router.post('/:id/steps', guideController.createStep);
router.patch('/:id/steps/order', guideController.reorderSteps);
router.patch('/:id/steps/:stepId', guideController.updateStep);
router.delete('/:id/steps/:stepId', guideController.deleteStep);

export default router;
