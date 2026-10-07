import { Router } from 'express';
import { ALL_ROLES, ROLES } from '../constants/roles';
import { authenticate, authorize } from '../middlewares/auth';
import apiLogRoutes from './apiLog.routes';
import approvalRoutes from './approval.routes';
import authRoutes from './auth.routes';
import imageRoutes from './image.routes';
import landingRoutes from './landing.routes';
import notificationRoutes from './notification.routes';
import productRoutes from './product.routes';
import tenantRoutes from './tenant.routes';
import tenantCategoryRoutes from './tenantCategory.routes';
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
router.use('/tenants', tenantRoutes);
router.use('/tenant-categories', tenantCategoryRoutes);
router.use('/landing', landingRoutes);
router.use('/notifications', notificationRoutes);
router.use('/logs', apiLogRoutes);

// Example of role-protected routes — replace with real feature routes
router.get('/admin/ping', authenticate, authorize(ROLES.SUPERADMIN, ROLES.ADMIN), (req, res) => {
  res.json({ success: true, data: { message: `Hello admin ${req.user!.email}` } });
});
router.get('/tenant/ping', authenticate, authorize(...ALL_ROLES), (req, res) => {
  res.json({ success: true, data: { message: `Hello ${req.user!.role} ${req.user!.email}` } });
});

export default router;
