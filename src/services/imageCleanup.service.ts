import fs from 'node:fs/promises';
import path from 'node:path';
import { QueryTypes } from 'sequelize';
import { IMAGES_DIR } from '../config/upload';
import { sequelize } from '../models';

/**
 * Nightly cleanup of orphan images: uploads that nothing ended up using.
 *
 * A form uploads its photo as soon as it is picked (POST /api/images) and only points at it on save. Not saving
 * deletes the upload again from the browser, but that can fail (tab closed while offline, crash, never coming back).
 * This job removes what is left:
 *  - image rows that no user photo, UMKM logo, product or product category points at, and their files;
 *  - files in images/ that have no image row at all (e.g. a crash between saving the file and the row).
 * Only things older than ORPHAN_GRACE_HOURS are touched, so a form that is still being filled in is never affected.
 */

/** Uploads younger than this are left alone (a login lasts 1 hour, so no open form is this old) */
export const ORPHAN_GRACE_HOURS = 24;
/** The job runs every night at this hour, WIT (Asia/Jayapura, UTC+9, no daylight saving) */
export const CLEANUP_HOUR_WIT = 2;

const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;
const WIT_OFFSET_HOURS = 9;

/** Image rows nothing points at. Every table with a foreign key to images.id must be listed here. */
const ORPHAN_WHERE = `
  i.created_at < now() - make_interval(hours => :graceHours)
  AND NOT EXISTS (SELECT 1 FROM users u WHERE u.face_image_id = i.id)
  AND NOT EXISTS (SELECT 1 FROM tenants t WHERE t.logo_id = i.id)
  AND NOT EXISTS (SELECT 1 FROM products p WHERE p.image_id = i.id)
  AND NOT EXISTS (SELECT 1 FROM product_categories c WHERE c.image_id = i.id)`;

export interface CleanupResult {
  /** Orphan image rows (deleted, or that would be with dryRun) */
  rows: { id: number; imgUrl: string; createdAt: Date }[];
  /** Files in images/ without an image row */
  files: string[];
  /** Bytes freed on disk (or that would be) */
  bytes: number;
}

const fileOf = (imgUrl: string) => path.join(IMAGES_DIR, path.basename(imgUrl));

async function sizeOf(file: string) {
  try {
    return (await fs.stat(file)).size;
  } catch {
    return 0;
  }
}

/**
 * Finds orphan images and (unless dryRun) deletes them: the rows in one statement (it re-checks every reference as it
 * deletes, so an image that just got used is kept), then their files.
 */
export async function cleanupOrphanImages({ dryRun = false } = {}): Promise<CleanupResult> {
  const replacements = { graceHours: ORPHAN_GRACE_HOURS };
  type Row = { id: number; imgUrl: string; createdAt: Date };
  const select = `SELECT i.id, i.img_url AS "imgUrl", i.created_at AS "createdAt" FROM images i WHERE ${ORPHAN_WHERE} ORDER BY i.id`;
  const rows = dryRun
    ? await sequelize.query<Row>(select, { type: QueryTypes.SELECT, replacements })
    : await sequelize.query<Row>(
        `DELETE FROM images i WHERE ${ORPHAN_WHERE} RETURNING i.id, i.img_url AS "imgUrl", i.created_at AS "createdAt"`,
        { type: QueryTypes.SELECT, replacements },
      );

  let bytes = 0;
  for (const row of rows) {
    const file = fileOf(row.imgUrl);
    bytes += await sizeOf(file);
    if (!dryRun) await fs.unlink(file).catch(() => {});
  }

  // Files without any image row (read after the rows above, so their files are already gone)
  const known = new Set(
    (await sequelize.query<{ imgUrl: string }>(`SELECT img_url AS "imgUrl" FROM images`, { type: QueryTypes.SELECT })).map(
      (r) => path.basename(r.imgUrl),
    ),
  );
  const files: string[] = [];
  const cutoff = Date.now() - ORPHAN_GRACE_HOURS * HOUR_MS;
  for (const name of await fs.readdir(IMAGES_DIR).catch(() => [] as string[])) {
    // .gitkeep and other dotfiles are not uploads
    if (name.startsWith('.') || known.has(name)) continue;
    const file = path.join(IMAGES_DIR, name);
    const stat = await fs.stat(file).catch(() => null);
    if (!stat?.isFile() || stat.mtimeMs > cutoff) continue;
    files.push(name);
    bytes += stat.size;
    if (!dryRun) await fs.unlink(file).catch(() => {});
  }

  return { rows, files, bytes };
}

const formatMb = (bytes: number) => `${(bytes / 1024 / 1024).toFixed(1)} MB`;

async function runAndLog() {
  try {
    const { rows, files, bytes } = await cleanupOrphanImages();
    if (rows.length || files.length) {
      console.log(
        `[images] nightly cleanup: deleted ${rows.length} unused image(s)` +
          (rows.length ? ` (ids ${rows.map((r) => r.id).join(', ')})` : '') +
          ` and ${files.length} stray file(s), ${formatMb(bytes)} freed`,
      );
    } else {
      console.log('[images] nightly cleanup: no unused images');
    }
  } catch (err) {
    console.error('[images] nightly cleanup failed:', err);
  }
}

/** Milliseconds until the next CLEANUP_HOUR_WIT o'clock in WIT. */
export function msUntilNextRun(now = new Date()) {
  const next = new Date(now);
  next.setUTCHours(CLEANUP_HOUR_WIT - WIT_OFFSET_HOURS + (CLEANUP_HOUR_WIT < WIT_OFFSET_HOURS ? 24 : 0), 0, 0, 0);
  while (next <= now) next.setTime(next.getTime() + DAY_MS);
  while (next.getTime() - now.getTime() > DAY_MS) next.setTime(next.getTime() - DAY_MS);
  return next.getTime() - now.getTime();
}

/** Schedules the cleanup every night at CLEANUP_HOUR_WIT WIT. The timers don't keep the process alive on shutdown. */
export function startOrphanImageCleanup() {
  setTimeout(() => {
    void runAndLog();
    setInterval(() => void runAndLog(), DAY_MS).unref();
  }, msUntilNextRun()).unref();
}
