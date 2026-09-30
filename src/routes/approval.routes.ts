import { Router } from 'express';
import { ROLES } from '../constants/roles';
import * as approvalController from '../controllers/approval.controller';
import { authenticate, authorize } from '../middlewares/auth';
import { idNotProvided, requireIdParam } from '../middlewares/requireId';

const router = Router();

// Missing, blank, "null" or "undefined" id → 400 "ID not provided"
router.param('id', requireIdParam);

// Activate/deactivate a user or product: PATCH /api/approvals/:id?type=user|product
// Tenants never approve anything; the per-type rules are in approval.service
router.patch('/:id', authenticate, authorize(ROLES.SUPERADMIN, ROLES.ADMIN), approvalController.setApproval);
router.patch('/', idNotProvided);

export default router;
