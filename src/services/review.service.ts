import { fn, col } from 'sequelize';
import { HttpError } from '../errors/HttpError';
import { Product, Review } from '../models';

export interface ReviewInput {
  name: string;
  stars: number;
  review: string;
}

/** Reviews are only for products visitors can see: approved ones. */
async function findActiveProduct(productId: string) {
  const product = await Product.findByPk(productId, {
    attributes: ['id'],
    include: [{ association: 'approval', attributes: [], where: { isActive: true }, required: true }],
  });
  if (!product) throw HttpError.notFound('Produk tidak ditemukan');
  return product;
}

/** ratingAverage (1 decimal, null without reviews) and reviewCount of one product. */
export async function summary(productId: string) {
  const row = (await Review.findOne({
    attributes: [
      [fn('ROUND', fn('AVG', col('stars')), 1), 'average'],
      [fn('COUNT', col('id')), 'count'],
    ],
    where: { productId },
    raw: true,
  })) as unknown as { average: string | null; count: string } | null;
  return {
    ratingAverage: row?.average != null ? Number(row.average) : null,
    reviewCount: Number(row?.count ?? 0),
  };
}

export async function list(productId: string, { page, limit }: { page: number; limit: number }) {
  await findActiveProduct(productId);
  const [{ rows, count }, totals] = await Promise.all([
    Review.findAndCountAll({
      where: { productId },
      order: [['createdAt', 'DESC'], ['id', 'DESC']],
      limit,
      offset: (page - 1) * limit,
    }),
    summary(productId),
  ]);
  return { reviews: rows, meta: { page, limit, total: count, totalPages: Math.ceil(count / limit), ...totals } };
}

// ---------- spam guard for the public POST ----------

const WINDOW_MS = 10 * 60 * 1000;
const MAX_PER_WINDOW = 5;
const recent = new Map<string, number[]>();

/** At most 5 reviews per visitor (IP) per 10 minutes. In memory: resets when the server restarts. */
function checkRateLimit(ip: string | null) {
  const key = ip ?? 'unknown';
  const now = Date.now();
  const times = (recent.get(key) ?? []).filter((t) => now - t < WINDOW_MS);
  if (times.length >= MAX_PER_WINDOW) {
    const retryAfterSeconds = Math.ceil((WINDOW_MS - (now - times[0])) / 1000);
    throw HttpError.tooManyRequests('Terlalu banyak ulasan dikirim, silakan coba lagi beberapa menit lagi', { retryAfterSeconds });
  }
  times.push(now);
  recent.set(key, times);
  // Keep the map small: forget visitors whose window has passed
  if (recent.size > 5000) for (const [k, v] of recent) if (now - v[v.length - 1] >= WINDOW_MS) recent.delete(k);
}

export async function create(productId: string, input: ReviewInput, ip: string | null) {
  await findActiveProduct(productId);
  checkRateLimit(ip);
  const review = await Review.create({ ...input, productId });
  return { review, ...(await summary(productId)) };
}
