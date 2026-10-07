import { Router } from 'express';
import * as productController from '../controllers/product.controller';
import * as reviewController from '../controllers/review.controller';
import * as tenantController from '../controllers/tenant.controller';
import { requireIdParam } from '../middlewares/requireId';

const router = Router();

// Public (no login): what visitors see on the landing page
router.param('id', requireIdParam);

router.get('/products', productController.listPublic);
router.get('/products/:id', productController.getPublic);
// Reviews: anyone can read and write them (no login), only for approved products
router.get('/products/:id/reviews', reviewController.list);
router.post('/products/:id/reviews', reviewController.create);

router.get('/tenants', tenantController.listPublic);
router.get('/tenants/:id', tenantController.getPublic);

export default router;
