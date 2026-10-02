import { Router } from 'express';
import { ROLES, registrarsOf } from '../constants/roles';
import * as authController from '../controllers/auth.controller';
import { authenticate, authorize } from '../middlewares/auth';

const router = Router();

router.post('/login', authController.login);
// Revokes the token sent with the request (it stays invalid until its normal expiry)
router.post('/logout', authenticate, authController.logout);
// superadmin → creates admin (starts inactive until a superadmin activates it); rules in CREATABLE_ROLES
router.post('/register/admin', authenticate, authorize(...registrarsOf(ROLES.ADMIN)), authController.registerAdmin);
// Public sign-up: anyone can register a tenant account, no token needed (active right away)
router.post('/register/tenant', authController.registerTenant);
// Old combined endpoint → 410 telling the client which one to use
router.post('/register', authController.registerMoved);
router.get('/me', authenticate, authController.me);
// Only your own account: the token decides whose account is updated, there is no id in the URL
router.patch('/me', authenticate, authController.updateMe);

export default router;
