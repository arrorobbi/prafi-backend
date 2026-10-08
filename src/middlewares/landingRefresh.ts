import type { RequestHandler } from 'express';
import { revalidateLanding } from '../utils/revalidateLanding';

const CHANGES = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/**
 * Changes visitors can see on the landing pages: products (create, edit, delete), reviews, product categories,
 * UMKM profiles, approvals (a product or account activated / deactivated) and a tenant's own account (its
 * tenantName is the seller name on product cards).
 */
const PUBLIC_CHANGE = /^\/api\/(products|product-categories|tenants\/me|approvals|auth\/me|landing\/products\/[^/]+\/reviews)(\/|$)/;

/** After a successful change of public data, the frontend's cached landing pages are refreshed at once. */
export const landingRefresh: RequestHandler = (req, res, next) => {
  if (CHANGES.has(req.method) && PUBLIC_CHANGE.test(req.originalUrl.split('?')[0])) {
    res.on('finish', () => {
      if (res.statusCode < 400) revalidateLanding();
    });
  }
  next();
};
