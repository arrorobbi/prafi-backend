/**
 * Runs the backup now, the same one the backend makes every Sunday at 00:00 WIB.
 *   npm run backup                -> database dump + images archive in ~/backups/prafi, emailed as usual
 *   npm run backup -- --no-email  -> only the files on the server
 */
import { BACKUP_DIR, describe, runBackup } from '../services/backup.service';

async function main() {
  const result = await runBackup({ email: !process.argv.includes('--no-email') });
  console.log(`Backup saved in ${BACKUP_DIR}`);
  console.log(describe(result));
}

main().catch((err) => {
  console.error('Backup failed:', err);
  process.exitCode = 1;
});
