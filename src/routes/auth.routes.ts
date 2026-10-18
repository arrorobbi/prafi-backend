import { Router } from 'express';
import { ROLES, registrarsOf } from '../constants/roles';
import * as authController from '../controllers/auth.controller';
import { authenticate, authorize } from '../middlewares/auth';

const router = Router();

router.post('/login', authController.login);
// Revokes the token sent with the request (it stays invalid until its normal expiry)
router.post('/logout', authenticate, authController.logout);
// Sliding session: an active user's token is renewed (up to SESSION_MAX_HOURS after the login)
router.post('/refresh', authenticate, authController.refresh);

// superadmin → creates disnakertrans (active right away; a temporary password and an activation link are emailed);
// rules in CREATABLE_ROLES
router.post(
  '/register/disnakertrans',
  authenticate,
  authorize(...registrarsOf(ROLES.DISNAKERTRANS)),
  authController.registerDisnakertrans,
);
// Public sign-ups, no token needed; both verify their email with an OTP.
// Admins stay inactive until a disnakertrans activates them, tenants are active right away
router.post('/register/admin', authController.registerAdmin);
router.post('/register/tenant', authController.registerTenant);
// Old combined endpoint → 410 telling the client which one to use
router.post('/register', authController.registerMoved);

// Email verification: public, because the user can't log in before the email is verified
router.post('/verify-otp/:userId', authController.verifyOtp);
router.post('/resend-verification/:userId', authController.resendVerification);
// Disnakertrans: the email links to the frontend's /aktivasi page, which calls these two (temporary password → own password)
router.post('/activate/check', authController.checkActivation);
router.post('/activate', authController.activate);
// Seller whose email an admin changed: the email links to the frontend's /konfirmasi-email page, which calls this
router.post('/confirm-email', authController.confirmEmail);

// Forgot password: public. The email links to the frontend's /reset-password page, which calls these two
router.post('/forgot-password', authController.forgotPassword);
router.post('/reset-password/check', authController.checkResetPassword);
router.post('/reset-password', authController.resetPassword);

router.get('/me', authenticate, authController.me);
// Only your own account: the token decides whose account is updated, there is no id in the URL
router.patch('/me', authenticate, authController.updateMe);

export default router;
