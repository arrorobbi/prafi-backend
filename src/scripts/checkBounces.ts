/**
 * npm run bounces:check [-- --dry-run]
 * Reads the site's inbox (IMAP, read-only) for "message not delivered" replies and notes them on the accounts,
 * like the server does every BOUNCE_CHECK_MINUTES. --dry-run: only lists what it finds in the last
 * BOUNCE_LOOKBACK_DAYS days, and changes nothing.
 */
import { env } from '../config/env';
import { sequelize } from '../models';
import { bounceCheckEnabled, checkBounces, readBounces } from '../services/bounceCheck.service';

const LABEL: Record<string, string> = {
  not_found: 'alamat tidak ditemukan',
  mailbox_full: 'kotak masuk penuh',
  rejected: 'ditolak server penerima',
  delayed: 'tertunda (masih dicoba)',
  send_failed: 'gagal dikirim',
};

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  if (!bounceCheckEnabled()) {
    console.error('Bounce check is off: set IMAP_HOST (or use Gmail SMTP) and the SMTP/IMAP account in .env');
    process.exitCode = 1;
    return;
  }
  console.log(`Reading ${env.bounceCheck.user} on ${env.bounceCheck.host} (read-only)…`);
  if (dryRun) {
    const { bounces, scanned } = await readBounces({ dryRun: true });
    console.log(`${scanned} bounce message(s) in the last ${env.bounceCheck.lookbackDays} days, ${bounces.length} failed recipient(s):`);
    for (const b of bounces) {
      console.log(`- ${b.date.toISOString()}  ${b.recipient}  ${b.status || '-'}  ${LABEL[b.issue]}\n    ${b.detail || '(no detail)'}`);
    }
    console.log('Dry run: nothing was saved.');
  } else {
    const { found, noted } = await checkBounces();
    console.log(`${found} failed recipient(s) found, ${noted} account(s) noted.`);
  }
}

main()
  .catch((err) => {
    console.error('Bounce check failed:', (err as Error).message);
    process.exitCode = 1;
  })
  .finally(() => sequelize.close());
