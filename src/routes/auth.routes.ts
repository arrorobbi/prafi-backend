import { Router } from 'express';
import { REGISTRAR_ROLES } from '../constants/roles';
import * as authController from '../controllers/auth.controller';
import { authenticate, authorize } from '../middlewares/auth';

const router = Router();

router.post('/login', authController.login);
// Revokes the token sent with the request (it stays invalid until its normal expiry)
router.post('/logout', authenticate, authController.logout);
// superadmin → creates admin, admin → creates tenant (rules in CREATABLE_ROLES)
router.post('/register', authenticate, authorize(...REGISTRAR_ROLES), authController.register);
router.get('/me', authenticate, authController.me);
// Only your own account: the token decides whose account is updated, there is no id in the URL
router.patch('/me', authenticate, authController.updateMe);

export default router;
