import { Router } from 'express';
import { PRODUCT_APPROVER_ROLES, USER_APPROVER_ROLES } from '../constants/roles';
import * as approvalController from '../controllers/approval.controller';
import { authenticate, authorize } from '../middlewares/auth';
import { idNotProvided, requireIdParam } from '../middlewares/requireId';

const router = Router();

// Missing, blank, "null" or "undefined" id → 400 "ID not provided"
router.param('id', requireIdParam);

// Activate/deactivate a user or product: PATCH /api/approvals/:id?type=user|product
// disnakertrans → admin accounts and products, admin → tenant accounts and products. The superadmin is read-only and tenants
// approve nothing; the per-type rules are in approval.service
const APPROVERS = [...new Set([...USER_APPROVER_ROLES, ...PRODUCT_APPROVER_ROLES])];
router.patch('/:id', authenticate, authorize(...APPROVERS), approvalController.setApproval);
router.patch('/', idNotProvided);

export default router;
