import { spawn } from 'node:child_process';
import { createWriteStream } from 'node:fs';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import { createGzip } from 'node:zlib';
import { env } from '../config/env';
import { IMAGES_DIR } from '../config/upload';
import { backupReady } from '../mail/templates';
import { mailIsSimulated, sendMail } from './mail.service';

/**
 * Weekly backup: every Sunday at 00:00 WIB the database is dumped (pg_dump, gzipped) and images/ is archived
 * (tar.gz), both into BACKUP_DIR (default ~/backups/prafi). The newest BACKUP_KEEP runs are kept, older ones deleted.
 * The files are also emailed (the off-server copy) to BACKUP_EMAIL_TO, by default the SMTP account itself.
 *
 * Restore: see docs/SERVER-GUIDE.md (gunzip the dump into psql; untar the images).
 */

export const BACKUP_DIR = env.backup.dir || path.join(os.homedir(), 'backups', 'prafi');
/** Sunday (0 = Sunday) at this hour, WIB (Asia/Jakarta, UTC+7, no daylight saving) */
export const BACKUP_WEEKDAY = 0;
export const BACKUP_HOUR_WIB = 0;
const WIB_OFFSET_MS = 7 * 3_600_000;
/** Gmail accepts 25 MB per message; attachments grow by a third when encoded */
const MAX_ATTACH_BYTES = 17 * 1024 * 1024;

const stamp = (d: Date) => new Date(d.getTime() + WIB_OFFSET_MS).toISOString().slice(0, 16).replace('T', '_').replace(':', '');

/** Runs a command; resolves when it exits with 0, rejects with its error output otherwise. */
function run(command: string, args: string[], options: { env?: NodeJS.ProcessEnv; out?: NodeJS.WritableStream } = {}) {
  return new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, { env: options.env ?? process.env, stdio: ['ignore', options.out ? 'pipe' : 'ignore', 'pipe'] });
    let stderr = '';
    child.stderr!.on('data', (d) => (stderr += d));
    const piped = options.out ? pipeline(child.stdout!, createGzip({ level: 9 }), options.out) : Promise.resolve();
    child.on('error', reject);
    child.on('close', (code) => {
      piped.then(() => (code === 0 ? resolve() : reject(new Error(`${command} exited with ${code}: ${stderr.trim().slice(0, 500)}`))), reject);
    });
  });
}

export interface BackupResult {
  at: Date;
  database: { file: string; bytes: number };
  images: { file: string; bytes: number } | null;
  /** Older runs deleted to keep BACKUP_KEEP */
  removed: string[];
  emailedTo: string | null;
  /** Why the email wasn't sent / what was left out */
  emailNote: string | null;
}

/** Deletes the oldest runs of one kind (by file name, which sorts by date) beyond BACKUP_KEEP. */
async function prune(prefix: string) {
  const files = (await fs.readdir(BACKUP_DIR)).filter((f) => f.startsWith(prefix)).sort();
  const old = files.slice(0, Math.max(0, files.length - env.backup.keep));
  await Promise.all(old.map((f) => fs.unlink(path.join(BACKUP_DIR, f)).catch(() => {})));
  return old;
}

export async function runBackup({ email = true } = {}): Promise<BackupResult> {
  const at = new Date();
  await fs.mkdir(BACKUP_DIR, { recursive: true, mode: 0o700 });
  const name = stamp(at);

  // The password goes through the environment, never the command line (visible to other users in `ps`)
  const dbFile = path.join(BACKUP_DIR, `prafi_db_${name}.sql.gz`);
  try {
    await run(
      'pg_dump',
      ['-h', env.db.host, '-p', String(env.db.port), '-U', env.db.user, '--no-owner', env.db.name],
      { env: { ...process.env, PGPASSWORD: env.db.password }, out: createWriteStream(dbFile, { mode: 0o600 }) },
    );
  } catch (err) {
    await fs.unlink(dbFile).catch(() => {});
    throw err;
  }
  const database = { file: dbFile, bytes: (await fs.stat(dbFile)).size };

  // Uploaded photos: the database only holds their file names
  let images: BackupResult['images'] = null;
  const imgFile = path.join(BACKUP_DIR, `prafi_images_${name}.tar.gz`);
  try {
    await run('tar', ['-czf', imgFile, '--exclude=.gitkeep', '-C', path.dirname(IMAGES_DIR), path.basename(IMAGES_DIR)]);
    await fs.chmod(imgFile, 0o600);
    images = { file: imgFile, bytes: (await fs.stat(imgFile)).size };
  } catch (err) {
    await fs.unlink(imgFile).catch(() => {});
    console.error('[backup] could not archive images/:', (err as Error).message);
  }

  const removed = [...(await prune('prafi_db_')), ...(await prune('prafi_images_'))];

  // The off-server copy
  const to = env.backup.emailTo.toLowerCase() === 'off' ? '' : env.backup.emailTo || env.mail.user;
  let emailedTo: string | null = null;
  let emailNote: string | null = null;
  if (!email) emailNote = 'email skipped (--no-email)';
  else if (!to) emailNote = 'no email address (BACKUP_EMAIL_TO is "off" or SMTP_USER is empty)';
  else {
    const attachments = [{ filename: path.basename(dbFile), path: dbFile }];
    let imagesAttached = false;
    if (images && database.bytes + images.bytes <= MAX_ATTACH_BYTES) {
      attachments.push({ filename: path.basename(images.file), path: images.file });
      imagesAttached = true;
    }
    if (database.bytes > MAX_ATTACH_BYTES) {
      emailNote = 'the database dump is too large to email; it is on the server only';
    } else {
      try {
        const content = backupReady({ at, database, images, imagesAttached, keep: env.backup.keep, dir: BACKUP_DIR });
        await sendMail({ to, ...content, attachments });
        emailedTo = to;
        if (images && !imagesAttached) emailNote = 'images archive too large to email; it is on the server only';
        if (mailIsSimulated) emailNote = 'SMTP_HOST is not set: the email was only printed in the log';
      } catch (err) {
        emailNote = `email failed: ${(err as Error).message}`;
      }
    }
  }

  return { at, database, images, removed, emailedTo, emailNote };
}

const mb = (bytes: number) => (bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`);

export function describe(r: BackupResult) {
  return (
    `database ${path.basename(r.database.file)} (${mb(r.database.bytes)})` +
    (r.images ? `, images ${path.basename(r.images.file)} (${mb(r.images.bytes)})` : ', images NOT archived') +
    (r.removed.length ? `; removed ${r.removed.length} old file(s)` : '') +
    (r.emailedTo ? `; emailed to ${r.emailedTo}` : '') +
    (r.emailNote ? `; ${r.emailNote}` : '')
  );
}

async function runAndLog() {
  try {
    console.log(`[backup] weekly backup done: ${describe(await runBackup())}`);
  } catch (err) {
    console.error('[backup] weekly backup FAILED:', err);
  }
}

/** Milliseconds until the next BACKUP_WEEKDAY at BACKUP_HOUR_WIB o'clock WIB. */
export function msUntilNextBackup(now = new Date()) {
  // Work on a clock shifted to WIB, so getUTC* reads WIB wall time
  const wib = new Date(now.getTime() + WIB_OFFSET_MS);
  const next = new Date(wib);
  next.setUTCHours(BACKUP_HOUR_WIB, 0, 0, 0);
  next.setUTCDate(wib.getUTCDate() + ((BACKUP_WEEKDAY - wib.getUTCDay() + 7) % 7));
  if (next <= wib) next.setUTCDate(next.getUTCDate() + 7);
  return next.getTime() - wib.getTime();
}

/** Schedules the backup every Sunday 00:00 WIB. The timer doesn't keep the process alive on shutdown. */
export function startWeeklyBackup() {
  const schedule = () => {
    setTimeout(() => {
      void runAndLog().finally(schedule);
    }, msUntilNextBackup()).unref();
  };
  schedule();
}
