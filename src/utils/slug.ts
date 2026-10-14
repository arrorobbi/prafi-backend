import { Op, QueryTypes, UniqueConstraintError, type Model, type ModelStatic, type Transaction } from 'sequelize';
import { sequelize } from '../config/database';

/**
 * Slugs: the readable part of a page's address, made from a name ("Brownis Prafi" → /produk/brownis-prafi).
 *  - products and UMKM profiles: when the slug is taken, a number is added: brownis-prafi-1, brownis-prafi-2, …
 *  - product categories: never numbered; a second category with the same slug is refused (no duplicate categories).
 * The slug follows the name: renaming makes a new one, and the old one keeps leading to the same item (old_slugs).
 * Pages also open by id, so links made before slugs keep working.
 */
export const SLUG_MAX_LENGTH = 80;

/** A value that can only be a slug (lower-case words joined by "-"), as opposed to a UUID or a number */
export const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** "Kopi Arabika  Prafi!" → "kopi-arabika-prafi". `fallback` for names without any letter or digit. */
export function slugify(name: string, fallback: string) {
  const slug = name
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '') // accents: é → e
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, SLUG_MAX_LENGTH)
    .replace(/-+$/g, '');
  return slug || fallback;
}

/**
 * For a model's beforeSave hook: `update({ name })` only writes the columns it was given, so a slug set by the hook
 * must be added to that list or it would be dropped.
 */
export function saveSlugToo(options: unknown) {
  const fields = (options as { fields?: string[] } | undefined)?.fields;
  if (fields && !fields.includes('slug')) fields.push('slug');
}

/** The transaction a model hook runs in, if any (Sequelize passes the save's options to the hook) */
export const hookTransaction = (options: unknown) => (options as { transaction?: Transaction | null } | undefined)?.transaction;

/** What has slugs with numbering and a history of old ones: the table of each kind */
const TABLES = { product: 'products', tenant: 'tenants' } as const;
export type SlugKind = keyof typeof TABLES;

const likePrefix = (base: string) => `${base.replace(/[\\%_]/g, (c) => `\\${c}`)}-%`;

/**
 * The first free slug for `base`: `base`, else `base-1`, `base-2`, … (the lowest free number). Taken are the slugs
 * in use and the old slugs of other items that still exist (table old_slugs), so an old link never ends up at
 * somebody else's page. `exceptId`: the row being renamed; its own current and old slugs don't count as taken.
 */
export async function freeSlug(
  /** The model of this kind (products or UMKM profiles) */
  model: ModelStatic<Model<any, any>>,
  kind: SlugKind,
  base: string,
  { exceptId, transaction }: { exceptId?: string; transaction?: Transaction | null } = {},
) {
  const rows = (await model.findAll({
    attributes: ['slug'],
    where: {
      [Op.or]: [{ slug: base }, { slug: { [Op.like]: likePrefix(base) } }],
      ...(exceptId !== undefined && { id: { [Op.ne]: exceptId } }),
    },
    transaction,
    raw: true,
  })) as unknown as { slug: string | null }[];
  // The table name comes from the constant above, never from input
  const old = await sequelize.query<{ slug: string }>(
    `SELECT o.slug FROM old_slugs o
     WHERE o.kind = :kind AND (o.slug = :base OR o.slug LIKE :prefix) AND o.target_id <> :exceptId
       AND EXISTS (SELECT 1 FROM ${TABLES[kind]} t WHERE t.id::text = o.target_id)`,
    { type: QueryTypes.SELECT, replacements: { kind, base, prefix: likePrefix(base), exceptId: exceptId ?? '' }, transaction },
  );
  const taken = new Set([...rows.map((r) => r.slug), ...old.map((r) => r.slug)]);
  if (!taken.has(base)) return base;
  for (let n = 1; ; n++) {
    if (!taken.has(`${base}-${n}`)) return `${base}-${n}`;
  }
}

/**
 * After a rename: the slug the item had is kept in old_slugs (its old address goes on working), and the slug it has
 * now is removed from there (its own old one taken back, or a leftover of an item that no longer exists).
 */
export async function keepOldSlug(kind: SlugKind, targetId: string, oldSlug: string | null | undefined, newSlug: string, transaction?: Transaction | null) {
  await sequelize.query('DELETE FROM old_slugs WHERE kind = :kind AND slug = :newSlug', { replacements: { kind, newSlug }, transaction });
  if (!oldSlug || oldSlug === newSlug) return;
  await sequelize.query(
    `INSERT INTO old_slugs (kind, slug, target_id) VALUES (:kind, :oldSlug, :targetId)
     ON CONFLICT (kind, slug) DO UPDATE SET target_id = EXCLUDED.target_id, created_at = now()`,
    { replacements: { kind, oldSlug, targetId }, transaction },
  );
}

/** The id of the item that used to have this slug, or null. */
export async function findByOldSlug(kind: SlugKind, slug: string) {
  const [row] = await sequelize.query<{ targetId: string }>('SELECT target_id AS "targetId" FROM old_slugs WHERE kind = :kind AND slug = :slug', {
    type: QueryTypes.SELECT,
    replacements: { kind, slug },
  });
  return row?.targetId ?? null;
}

/** The item was deleted: its old slugs are free again. */
export async function forgetOldSlugs(kind: SlugKind, targetId: string, transaction?: Transaction | null) {
  await sequelize.query('DELETE FROM old_slugs WHERE kind = :kind AND target_id = :targetId', { replacements: { kind, targetId }, transaction });
}

/** Two saves at the same moment can pick the same free slug: the unique index refuses one, which then tries again. */
export const isSlugConflict = (err: unknown) =>
  err instanceof UniqueConstraintError && (Object.keys(err.fields ?? {}).includes('slug') || err.errors?.some((e) => e.path === 'slug'));
