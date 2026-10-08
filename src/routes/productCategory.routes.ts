import { Router } from 'express';
import { PRODUCT_CATEGORY_MANAGER_ROLES, PRODUCT_CATEGORY_READER_ROLES } from '../constants/roles';
import * as categoryController from '../controllers/productCategory.controller';
import { authenticate, authorize } from '../middlewares/auth';
import { idNotProvided, requireIdParam } from '../middlewares/requireId';

const router = Router();

// Every /:id route below: missing, blank, "null" or "undefined" id → 400 "ID not provided"
router.param('id', requireIdParam);

// Read: every signed-in role (tenants pick one for each product). Write: admin only
const read = [authenticate, authorize(...PRODUCT_CATEGORY_READER_ROLES)];
const write = [authenticate, authorize(...PRODUCT_CATEGORY_MANAGER_ROLES)];

router.get('/', ...read, categoryController.list);
router.get('/:id', ...read, categoryController.getOne);
router.post('/', ...write, categoryController.create);
router.patch('/:id', ...write, categoryController.update);
router.delete('/:id', ...write, categoryController.remove);

// Same routes without an id segment (GET / is the list, so it is not included)
router.patch('/', ...write, idNotProvided);
router.delete('/', ...write, idNotProvided);

export default router;
