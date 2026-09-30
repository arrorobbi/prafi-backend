import { Router } from 'express';
import * as productController from '../controllers/product.controller';

const router = Router();

// Public (no login): what visitors see on the landing page
router.get('/products', productController.listPublic);

export default router;
