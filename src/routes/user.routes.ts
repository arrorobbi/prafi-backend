import { Router } from 'express';
import * as userController from '../controllers/user.controller';
import { authenticate } from '../middlewares/auth';
import { scopeReadableRoles } from '../middlewares/userScope';

const router = Router();

// One route for everyone: the middleware decides what the caller may see (rules in READABLE_ROLES)
router.get('/', authenticate, scopeReadableRoles, userController.list);

export default router;
