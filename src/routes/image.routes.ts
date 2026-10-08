import { Router } from 'express';
import * as imageController from '../controllers/image.controller';
import { authenticate } from '../middlewares/auth';
import { idNotProvided, requireIdParam } from '../middlewares/requireId';
import { uploadImage } from '../middlewares/upload';

const router = Router();

// Missing, blank, "null" or "undefined" id → 400 "ID not provided"
router.param('id', requireIdParam);

router.post('/', authenticate, uploadImage, imageController.upload);
// Any role, but only your own upload that nothing uses yet (an unsaved upload you're throwing away)
router.delete('/:id', authenticate, imageController.remove);
router.delete('/', idNotProvided);

export default router;
