import { Router } from 'express';
import { PRODUCT_OWNER_ROLES, REVIEW_MODERATOR_ROLES } from '../constants/roles';
import * as reviewController from '../controllers/review.controller';
import { authenticate, authorize } from '../middlewares/auth';
import { requireIdParam } from '../middlewares/requireId';

const router = Router();

router.param('id', requireIdParam);

// Sellers: the reviews of their own products, and reporting one
router.get('/mine', authenticate, authorize(...PRODUCT_OWNER_ROLES), reviewController.listMine);
router.post('/:id/report', authenticate, authorize(...PRODUCT_OWNER_ROLES), reviewController.report);

// Admins and disnakertrans: reported reviews, and the decision (hide / keep / show again)
router.get('/', authenticate, authorize(...REVIEW_MODERATOR_ROLES), reviewController.listReported);
router.patch('/:id/moderation', authenticate, authorize(...REVIEW_MODERATOR_ROLES), reviewController.moderate);

export default router;
