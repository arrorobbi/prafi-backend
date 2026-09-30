import { Router } from 'express';
import { PRODUCT_OWNER_ROLES, PRODUCT_READ_ALL_ROLES } from '../constants/roles';
import * as productController from '../controllers/product.controller';
import { authenticate, authorize } from '../middlewares/auth';
import { idNotProvided, requireIdParam } from '../middlewares/requireId';

const router = Router();

// Every /:id route below: missing, blank, "null" or "undefined" id → 400 "ID not provided"
router.param('id', requireIdParam);

// Read: superadmin/admin see every product, tenants only their own (scoped in product.service)
router.get('/', authenticate, authorize(...PRODUCT_READ_ALL_ROLES, ...PRODUCT_OWNER_ROLES), productController.list);
router.get('/:id', authenticate, authorize(...PRODUCT_READ_ALL_ROLES, ...PRODUCT_OWNER_ROLES), productController.getOne);

// Write: tenants only, and only their own products
router.post('/', authenticate, authorize(...PRODUCT_OWNER_ROLES), productController.create);
router.patch('/:id', authenticate, authorize(...PRODUCT_OWNER_ROLES), productController.update);
router.delete('/:id', authenticate, authorize(...PRODUCT_OWNER_ROLES), productController.remove);

// Same routes without an id segment (GET / is the list, so it is not included)
router.patch('/', idNotProvided);
router.delete('/', idNotProvided);

export default router;
