import { Router } from 'express';
import { TENANT_CATEGORY_MANAGER_ROLES } from '../constants/roles';
import * as categoryController from '../controllers/tenantCategory.controller';
import { authenticate, authorize } from '../middlewares/auth';
import { idNotProvided, requireIdParam } from '../middlewares/requireId';

const router = Router();

// Every /:id route below: missing, blank, "null" or "undefined" id → 400 "ID not provided"
router.param('id', requireIdParam);

// superadmin / admin only, for every operation
router.use(authenticate, authorize(...TENANT_CATEGORY_MANAGER_ROLES));

router.get('/', categoryController.list);
router.get('/:id', categoryController.getOne);
router.post('/', categoryController.create);
router.patch('/:id', categoryController.update);
router.delete('/:id', categoryController.remove);

// Same routes without an id segment (GET / is the list, so it is not included)
router.patch('/', idNotProvided);
router.delete('/', idNotProvided);

export default router;
