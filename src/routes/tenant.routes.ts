import { Router } from 'express';
import { TENANT_OWNER_ROLES, TENANT_READ_ALL_ROLES } from '../constants/roles';
import * as tenantController from '../controllers/tenant.controller';
import { authenticate, authorize } from '../middlewares/auth';
import { requireIdParam } from '../middlewares/requireId';

const router = Router();

// Tenant users manage their own tenant profile only; there is no id in the URL.
// Registered before /:id so "me" is never treated as an id.
router.get('/me', authenticate, authorize(...TENANT_OWNER_ROLES), tenantController.getMine);
router.post('/me', authenticate, authorize(...TENANT_OWNER_ROLES), tenantController.createMine);
router.patch('/me', authenticate, authorize(...TENANT_OWNER_ROLES), tenantController.updateMine);
router.delete('/me', authenticate, authorize(...TENANT_OWNER_ROLES), tenantController.deleteMine);

// superadmin / admin read every tenant profile
router.param('id', requireIdParam);
router.get('/', authenticate, authorize(...TENANT_READ_ALL_ROLES), tenantController.list);
router.get('/:id', authenticate, authorize(...TENANT_READ_ALL_ROLES), tenantController.getOne);

export default router;
