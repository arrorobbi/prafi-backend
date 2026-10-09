import { createHmac } from 'node:crypto';
import { col, fn, Op, type WhereOptions } from 'sequelize';
import { env } from '../config/env';
import { RECOMMENDED_MIN_RATING, RECOMMENDED_MIN_REVIEWS } from '../constants/products';
import { HttpError } from '../errors/HttpError';
import { Product, Review } from '../models';
import type { ReportStatus } from '../models/review.model';
import type { AuthUser } from '../types/express';
import { REVIEW_MODERATOR_ROLES } from '../constants/roles';
import { REALTIME_EVENTS as E, type ReviewChange } from '../constants/realtime';
import { emitToRoles, emitToUser } from '../realtime/socket';
import { notify } from './notification.service';

export interface ReviewInput {
  name: string;
  stars: number;
  review: string;
}

/** Visible reviews only: hidden ones (by an admin / disnakertrans) are never shown or counted */
const VISIBLE = { isHidden: false };

/** Reviews are only for products visitors can see: approved ones. */
async function findActiveProduct(productId: string) {
  const product = await Product.findByPk(productId, {
    attributes: ['id', 'name', 'tenantId', 'approvalId'],
    include: [{ association: 'approval', attributes: [], where: { isActive: true }, required: true }],
  });
  if (!product) throw HttpError.notFound('Produk tidak ditemukan');
  return product;
}

/** ratingAverage (1 decimal, null without reviews) and reviewCount of one product's visible reviews. */
export async function summary(productId: string) {
  const row = (await Review.findOne({
    attributes: [
      [fn('ROUND', fn('AVG', col('stars')), 1), 'average'],
      [fn('COUNT', col('id')), 'count'],
    ],
    where: { productId, ...VISIBLE },
    raw: true,
  })) as unknown as { average: string | null; count: string } | null;
  return {
    ratingAverage: row?.average != null ? Number(row.average) : null,
    reviewCount: Number(row?.count ?? 0),
  };
}

/**
 * products.is_recommended follows the visible reviews: true with at least RECOMMENDED_MIN_REVIEWS of them and an
 * average, as shown to visitors (1 decimal), of RECOMMENDED_MIN_RATING stars or more. Called after every new review
 * and every hide / unhide.
 */
export async function refreshRecommended(productId: string) {
  const { ratingAverage, reviewCount } = await summary(productId);
  const isRecommended = reviewCount >= RECOMMENDED_MIN_REVIEWS && ratingAverage !== null && ratingAverage >= RECOMMENDED_MIN_RATING;
  await Product.update({ isRecommended }, { where: { id: productId } });
  return isRecommended;
}

export async function list(productId: string, { page, limit }: { page: number; limit: number }) {
  await findActiveProduct(productId);
  const [{ rows, count }, totals] = await Promise.all([
    Review.findAndCountAll({
      where: { productId, ...VISIBLE },
      attributes: ['id', 'productId', 'name', 'stars', 'review', 'createdAt', 'updatedAt'],
      order: [['createdAt', 'DESC'], ['id', 'DESC']],
      limit,
      offset: (page - 1) * limit,
    }),
    summary(productId),
  ]);
  return { reviews: rows, meta: { page, limit, total: count, totalPages: Math.ceil(count / limit), ...totals } };
}

/**
 * Live update for the dashboards' review pages: the seller always (their Ulasan Produk), admins and disnakertrans
 * for reports and decisions (Laporan Ulasan; a new review isn't reported yet, so it doesn't concern them).
 */
function broadcast(review: { id: number; productId: string }, sellerId: string, action: ReviewChange) {
  const payload = { reviewId: review.id, productId: review.productId, action };
  emitToUser(sellerId, E.REVIEW_CHANGED, payload);
  if (action !== 'created') emitToRoles(REVIEW_MODERATOR_ROLES, E.REVIEW_CHANGED, payload);
}

// ---------- spam guards for the public POST (kept in the database: a restart doesn't reset them) ----------

/** At most this many reviews per visitor (IP) per window, across all products */
const WINDOW_MS = 10 * 60 * 1000;
const MAX_PER_WINDOW = 5;
/** The same browser on the same IP reviews a product at most once per this period */
const SAME_VISITOR_MS = 24 * 60 * 60 * 1000;

/** The IP is never stored: only a keyed hash, enough to recognise the same visitor again. */
export const hashIp = (ip: string | null) => createHmac('sha256', env.jwt.secret).update(ip ?? 'unknown').digest('hex');

const retryAfter = (from: Date, periodMs: number) => Math.max(1, Math.ceil((from.getTime() + periodMs - Date.now()) / 1000));

async function assertNotFlooding(ipHash: string) {
  const since = new Date(Date.now() - WINDOW_MS);
  const recent = await Review.unscoped().findAll({
    attributes: ['createdAt'],
    where: { ipHash, createdAt: { [Op.gte]: since } },
    order: [['createdAt', 'ASC']],
    limit: MAX_PER_WINDOW,
  });
  if (recent.length >= MAX_PER_WINDOW) {
    throw HttpError.tooManyRequests('Terlalu banyak ulasan dikirim, silakan coba lagi beberapa menit lagi', {
      retryAfterSeconds: retryAfter(recent[0].createdAt, WINDOW_MS),
    });
  }
}

/** Same browser AND same IP already reviewed this product in the last 24 hours */
async function assertFirstToday(productId: string, clientId: string, ipHash: string) {
  const previous = await Review.unscoped().findOne({
    attributes: ['createdAt'],
    where: { productId, clientId, ipHash, createdAt: { [Op.gte]: new Date(Date.now() - SAME_VISITOR_MS) } },
    order: [['createdAt', 'DESC']],
  });
  if (previous) {
    throw new HttpError(429, 'Anda sudah memberi ulasan untuk produk ini hari ini. Silakan kembali besok', 'ALREADY_REVIEWED', {
      retryAfterSeconds: retryAfter(previous.createdAt, SAME_VISITOR_MS),
    });
  }
}

export async function create(productId: string, input: ReviewInput, visitor: { ip: string | null; clientId: string }) {
  const product = await findActiveProduct(productId);
  const ipHash = hashIp(visitor.ip);
  await assertNotFlooding(ipHash);
  await assertFirstToday(productId, visitor.clientId, ipHash);
  const created = await Review.create({ ...input, productId, clientId: visitor.clientId, ipHash });
  await refreshRecommended(productId);
  await notify.productReviewed(product, input);
  broadcast(created, product.tenantId, 'created');
  const review = await Review.findByPk(created.id, { attributes: ['id', 'productId', 'name', 'stars', 'review', 'createdAt', 'updatedAt'] });
  return { review, ...(await summary(productId)) };
}

// ---------- moderation: sellers report, admins / disnakertrans decide ----------

const MODERATION_ATTRIBUTES = [
  'id',
  'productId',
  'name',
  'stars',
  'review',
  'isHidden',
  'reportStatus',
  'reportReason',
  'reportedAt',
  'moderatedAt',
  'moderationNote',
  'createdAt',
];

const productInclude = (where?: WhereOptions) => ({
  association: 'product',
  attributes: ['id', 'name', 'tenantId'],
  ...(where && { where, required: true }),
  include: [{ association: 'tenant', attributes: ['id', 'tenantName', 'firstName', 'lastName'] }],
});

const page = <T>(rows: T[], count: number, p: number, limit: number) => ({
  reviews: rows,
  meta: { page: p, limit, total: count, totalPages: Math.ceil(count / limit) },
});

export type ReportFilter = ReportStatus | 'all';

/** Tenant: reviews of their own products (hidden ones too, so they see the decision), newest first */
export async function listMine(user: AuthUser, { page: p, limit, productId }: { page: number; limit: number; productId?: string }) {
  const { rows, count } = await Review.findAndCountAll({
    attributes: MODERATION_ATTRIBUTES,
    where: productId ? { productId } : {},
    include: [productInclude({ tenantId: user.id })],
    order: [['createdAt', 'DESC'], ['id', 'DESC']],
    limit,
    offset: (p - 1) * limit,
    distinct: true,
  });
  return page(rows, count, p, limit);
}

/** Admin / disnakertrans: reported reviews by status (pending first, oldest report first) */
export async function listReported({ page: p, limit, status }: { page: number; limit: number; status: ReportFilter }) {
  const { rows, count } = await Review.findAndCountAll({
    attributes: MODERATION_ATTRIBUTES,
    where: status === 'all' ? { reportStatus: { [Op.ne]: null } } : { reportStatus: status },
    include: [
      productInclude(),
      { association: 'reporter', attributes: ['id', 'tenantName', 'firstName', 'lastName'] },
      { association: 'moderator', attributes: ['id', 'firstName', 'lastName', 'role'] },
    ],
    order: status === 'pending' ? [['reportedAt', 'ASC']] : [['moderatedAt', 'DESC NULLS LAST'], ['reportedAt', 'DESC']],
    limit,
    offset: (p - 1) * limit,
    distinct: true,
  });
  return page(rows, count, p, limit);
}

async function findWithProduct(id: number) {
  const review = await Review.findByPk(id, { attributes: MODERATION_ATTRIBUTES, include: [productInclude()] });
  if (!review) throw HttpError.notFound('Ulasan tidak ditemukan');
  return review;
}

/** Tenant: report a review of their own product. Once per review: an admin's decision is final. */
export async function report(user: AuthUser, id: number, reason: string) {
  const review = await findWithProduct(id);
  // Another tenant's product: 404, so tenants can't probe which reviews exist
  if (review.product?.tenantId !== user.id) throw HttpError.notFound('Ulasan tidak ditemukan');
  if (review.isHidden) throw HttpError.conflict('Ulasan ini sudah disembunyikan oleh administrator');
  if (review.reportStatus === 'pending') throw HttpError.conflict('Ulasan ini sudah dilaporkan dan sedang menunggu pemeriksaan administrator');
  if (review.reportStatus === 'kept') {
    throw HttpError.conflict('Ulasan ini sudah diperiksa administrator dan diputuskan tetap ditampilkan');
  }
  await review.update({ reportStatus: 'pending', reportReason: reason, reportedAt: new Date(), reportedBy: user.id });
  await notify.reviewReported({ id: review.id, stars: review.stars, name: review.name }, review.product!, reason);
  broadcast(review, review.product!.tenantId, 'reported');
  return findWithProduct(id);
}

export type ModerationAction = 'hide' | 'keep' | 'unhide';

/**
 * Admin / disnakertrans: `hide` (a pending report, or any review), `keep` (a pending report: stays visible),
 * `unhide` (show a hidden review again). Hiding and unhiding update the product's rating and recommendation.
 */
export async function moderate(actor: AuthUser, id: number, action: ModerationAction, note: string | null) {
  const review = await findWithProduct(id);
  const decided = { moderatedAt: new Date(), moderatedBy: actor.id, moderationNote: note };
  if (action === 'hide') {
    if (review.isHidden) throw HttpError.conflict('Ulasan ini sudah disembunyikan');
    await review.update({ ...decided, isHidden: true, reportStatus: 'hidden' });
  } else if (action === 'keep') {
    if (review.reportStatus !== 'pending') throw HttpError.conflict('Hanya laporan yang menunggu pemeriksaan yang dapat diputuskan "tetap tampil"');
    await review.update({ ...decided, reportStatus: 'kept' });
  } else {
    if (!review.isHidden) throw HttpError.conflict('Ulasan ini tidak sedang disembunyikan');
    await review.update({ ...decided, isHidden: false, reportStatus: 'kept' });
  }
  if (action !== 'keep') await refreshRecommended(review.productId);
  await notify.reviewModerated(actor, { id: review.id, stars: review.stars, name: review.name }, review.product!, action, note);
  broadcast(review, review.product!.tenantId, action === 'hide' ? 'hidden' : action === 'keep' ? 'kept' : 'unhidden');
  return findWithProduct(id);
}
