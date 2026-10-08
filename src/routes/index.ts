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
import statsRoutes from './stats.routes';
import tenantRoutes from './tenant.routes';
import productCategoryRoutes from './productCategory.routes';
import serverDocsRoutes from './serverDocs.routes';
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
router.use('/product-categories', productCategoryRoutes);
router.use('/landing', landingRoutes);
router.use('/notifications', notificationRoutes);
router.use('/logs', apiLogRoutes);
router.use('/stats', statsRoutes);
// Server guide (docs/SERVER-GUIDE.md): the page is public, its content is superadmin only
router.use('/docs', serverDocsRoutes);

// Example of role-protected routes — replace with real feature routes
router.get('/admin/ping', authenticate, authorize(ROLES.SUPERADMIN, ROLES.ADMIN), (req, res) => {
  res.json({ success: true, data: { message: `Hello admin ${req.user!.email}` } });
});
router.get('/tenant/ping', authenticate, authorize(...ALL_ROLES), (req, res) => {
  res.json({ success: true, data: { message: `Hello ${req.user!.role} ${req.user!.email}` } });
});

export default router;
