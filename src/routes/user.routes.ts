import { Router } from 'express';
import * as userController from '../controllers/user.controller';
import { SELLER_EMAIL_EDITOR_ROLES } from '../constants/roles';
import { authenticate, authorize } from '../middlewares/auth';
import { requireIdParam } from '../middlewares/requireId';
import { scopeReadableRoles } from '../middlewares/userScope';

const router = Router();

// One route for everyone: the middleware decides what the caller may see (rules in READABLE_ROLES)
router.get('/', authenticate, scopeReadableRoles, userController.list);

router.param('id', requireIdParam);
// Admin corrects a seller's email; the seller verifies the new address (OTP) before logging in again
router.patch('/:id/email', authenticate, authorize(...SELLER_EMAIL_EDITOR_ROLES), userController.changeEmail);

export default router;
