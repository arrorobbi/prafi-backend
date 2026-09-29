import { Router } from 'express';
import * as imageController from '../controllers/image.controller';
import { ROLES } from '../constants/roles';
import { authenticate, authorize } from '../middlewares/auth';
import { uploadImage } from '../middlewares/upload';

const router = Router();

router.post('/', authenticate, uploadImage, imageController.upload);
router.delete('/:id', authenticate, authorize(ROLES.TENANT), imageController.remove);

export default router;
