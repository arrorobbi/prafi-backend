import { Router } from 'express';
import { ROLES } from '../constants/roles';
import { authenticate, authorize } from '../middlewares/auth';
import approvalRoutes from './approval.routes';
import authRoutes from './auth.routes';
import imageRoutes from './image.routes';
import landingRoutes from './landing.routes';
import productRoutes from './product.routes';
import userRoutes from './user.routes';

const router = Router();

router.get('/health', (_req, res) => {
  res.json({ success: true, data: { status: 'ok' } });
});

router.use('/auth', authRoutes);
router.use('/images', imageRoutes);
router.use('/users', userRoutes);
router.use('/approvals', approvalRoutes);
router.use('/products', productRoutes);
router.use('/landing', landingRoutes);

// Example of role-protected routes — replace with real feature routes
router.get('/admin/ping', authenticate, authorize(ROLES.SUPERADMIN, ROLES.ADMIN), (req, res) => {
  res.json({ success: true, data: { message: `Hello admin ${req.user!.email}` } });
});
router.get('/tenant/ping', authenticate, authorize(ROLES.SUPERADMIN, ROLES.ADMIN, ROLES.TENANT), (req, res) => {
  res.json({ success: true, data: { message: `Hello ${req.user!.role} ${req.user!.email}` } });
});

export default router;
