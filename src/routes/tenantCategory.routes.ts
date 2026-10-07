import { Router } from 'express';
import { TENANT_CATEGORY_MANAGER_ROLES, TENANT_CATEGORY_READER_ROLES } from '../constants/roles';
import * as categoryController from '../controllers/tenantCategory.controller';
import { authenticate, authorize } from '../middlewares/auth';
import { idNotProvided, requireIdParam } from '../middlewares/requireId';

const router = Router();

// Every /:id route below: missing, blank, "null" or "undefined" id → 400 "ID not provided"
router.param('id', requireIdParam);

// Read: superadmin (read-only), admin, and tenants (to pick their profile's category). Write: admin only
const read = [authenticate, authorize(...TENANT_CATEGORY_READER_ROLES)];
const write = [authenticate, authorize(...TENANT_CATEGORY_MANAGER_ROLES)];

router.get('/', ...read, categoryController.list);
router.get('/:id', ...read, categoryController.getOne);
router.post('/', ...write, categoryController.create);
router.patch('/:id', ...write, categoryController.update);
router.delete('/:id', ...write, categoryController.remove);

// Same routes without an id segment (GET / is the list, so it is not included)
router.patch('/', ...write, idNotProvided);
router.delete('/', ...write, idNotProvided);

export default router;
