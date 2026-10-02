import { Router } from 'express';
import * as notificationController from '../controllers/notification.controller';
import { authenticate } from '../middlewares/auth';
import { requireIdParam } from '../middlewares/requireId';

const router = Router();

// Every role has notifications; each user only ever sees and changes their own
router.use(authenticate);
router.param('id', requireIdParam);

// Fixed paths before /:id
router.get('/', notificationController.list);
router.get('/unread-count', notificationController.unreadCount);
router.patch('/read-all', notificationController.markAllRead);
router.patch('/:id/read', notificationController.markRead);
router.delete('/:id', notificationController.remove);

export default router;
