import { Router } from 'express';
import * as imageController from '../controllers/image.controller';
import { ROLES } from '../constants/roles';
import { authenticate, authorize } from '../middlewares/auth';
import { idNotProvided, requireIdParam } from '../middlewares/requireId';
import { uploadImage } from '../middlewares/upload';

const router = Router();

// Missing, blank, "null" or "undefined" id → 400 "ID not provided"
router.param('id', requireIdParam);

router.post('/', authenticate, uploadImage, imageController.upload);
router.delete('/:id', authenticate, authorize(ROLES.TENANT), imageController.remove);
router.delete('/', idNotProvided);

export default router;
