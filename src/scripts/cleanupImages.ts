/**
 * Deletes orphan images now, the same cleanup the backend runs every night at 00:00 WIB (02:00 WIT).
 *   npm run images:cleanup              -> delete unused images (rows + files) older than 24 hours
 *   npm run images:cleanup -- --dry-run -> only list what would be deleted
 */
import { sequelize } from '../models';
import { cleanupOrphanImages, ORPHAN_GRACE_HOURS } from '../services/imageCleanup.service';

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  await sequelize.authenticate();
  const { rows, files, bytes } = await cleanupOrphanImages({ dryRun });
  const verb = dryRun ? 'Would delete' : 'Deleted';
  console.log(`${verb} ${rows.length} unused image(s) and ${files.length} stray file(s) older than ${ORPHAN_GRACE_HOURS} hours`);
  for (const r of rows) console.log(`  image ${r.id}  ${r.imgUrl}  (uploaded ${r.createdAt.toISOString()})`);
  for (const f of files) console.log(`  file  images/${f}  (no image row)`);
  console.log(`${dryRun ? 'Would free' : 'Freed'} ${(bytes / 1024 / 1024).toFixed(1)} MB`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => sequelize.close());
