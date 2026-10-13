import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { QueryTypes } from 'sequelize';
import { env } from '../config/env';
import { IMAGES_DIR } from '../config/upload';
import { REALTIME_EVENTS as E } from '../constants/realtime';
import { diskAlmostFull } from '../mail/templates';
import { sequelize } from '../models';
import { emitToMonitor, monitorWatchers } from '../realtime/socket';
import { BACKUP_DIR } from './backup.service';
import { sendMail } from './mail.service';

/**
 * Server monitor for the superadmin dashboard (Monitor Server): CPU, memory and disk of this machine, the services
 * the site needs, and how much the database, photos and backups take.
 *
 * Live: while at least one superadmin has the page open (Socket.IO room, see realtime/socket.ts) a new reading is
 * pushed every PUSH_SECONDS. Nobody watching = nothing is collected. Nothing is stored: the page keeps its own short
 * history.
 *
 * Disk alert: every DISK_CHECK_MINUTES the disk is checked whether or not anyone watches; at DISK_ALERT_PERCENT
 * (default 90) or more an email goes out, at most once per ALERT_REPEAT_HOURS while it stays that full.
 */
export const PUSH_SECONDS = 3;
const DISK_CHECK_MINUTES = 10;
const ALERT_REPEAT_HOURS = 24;
/** The disk everything lives on (system, database, projects, backups) */
const DISK_PATH = '/';
/** Sizes of folders and the database change slowly: looked up at most this often */
const SLOW_CACHE_MS = 30_000;

const SERVICES = [
  { name: 'prafi-backend', label: 'Backend (API)' },
  { name: 'prafi-frontend', label: 'Frontend (website)' },
  { name: 'prafi-maintenance', label: 'Halaman pemeliharaan' },
  { name: 'postgresql', label: 'PostgreSQL (database)' },
  { name: 'nginx', label: 'nginx (HTTPS)' },
] as const;

export type ServiceState = 'active' | 'inactive' | 'failed' | 'activating' | 'unknown';

export interface ServerMetrics {
  at: string;
  host: { hostname: string; os: string; uptimeSeconds: number; cores: number; loadAverage: number[] };
  /** Busy share of all cores since the previous reading */
  cpu: { percent: number };
  memory: { totalBytes: number; usedBytes: number; percent: number; swapTotalBytes: number; swapUsedBytes: number };
  disk: { path: string; totalBytes: number; usedBytes: number; freeBytes: number; percent: number; alertPercent: number };
  app: { nodeVersion: string; environment: string; backendUptimeSeconds: number; backendMemoryBytes: number };
  services: { name: string; label: string; state: ServiceState }[];
  storage: {
    databaseBytes: number | null;
    imagesBytes: number;
    imagesCount: number;
    backupsBytes: number;
    lastBackup: { file: string; at: string; bytes: number } | null;
  };
}

const round1 = (n: number) => Math.round(n * 10) / 10;
const percent = (part: number, whole: number) => (whole > 0 ? round1(Math.min(100, Math.max(0, (part / whole) * 100))) : 0);

// ---------- CPU: busy time between two readings ----------

function cpuTimes() {
  let idle = 0;
  let total = 0;
  for (const cpu of os.cpus()) {
    for (const t of Object.values(cpu.times)) total += t;
    idle += cpu.times.idle;
  }
  return { idle, total, at: Date.now() };
}

let lastCpu = cpuTimes();

async function cpuPercent() {
  // The first reading (or one after a long pause) needs its own short measuring window
  if (Date.now() - lastCpu.at > 15_000) {
    lastCpu = cpuTimes();
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  const now = cpuTimes();
  const total = now.total - lastCpu.total;
  const idle = now.idle - lastCpu.idle;
  lastCpu = now;
  return total > 0 ? percent(total - idle, total) : 0;
}

// ---------- memory: "available" as the kernel reports it (free + what it can give back from caches) ----------

async function memory(): Promise<ServerMetrics['memory']> {
  const totalBytes = os.totalmem();
  let availableBytes = os.freemem();
  let swapTotalBytes = 0;
  let swapUsedBytes = 0;
  try {
    const info = await fs.readFile('/proc/meminfo', 'utf8');
    const kb = (key: string) => Number(info.match(new RegExp(`^${key}:\\s+(\\d+) kB`, 'm'))?.[1] ?? NaN) * 1024;
    if (Number.isFinite(kb('MemAvailable'))) availableBytes = kb('MemAvailable');
    if (Number.isFinite(kb('SwapTotal'))) {
      swapTotalBytes = kb('SwapTotal');
      swapUsedBytes = swapTotalBytes - (Number.isFinite(kb('SwapFree')) ? kb('SwapFree') : swapTotalBytes);
    }
  } catch {
    // Not Linux (development on another system): os.freemem() it is
  }
  const usedBytes = Math.max(0, totalBytes - availableBytes);
  return { totalBytes, usedBytes, percent: percent(usedBytes, totalBytes), swapTotalBytes, swapUsedBytes };
}

// ---------- disk: the same numbers `df` shows ----------

export async function diskUsage(): Promise<Omit<ServerMetrics['disk'], 'alertPercent'>> {
  const s = await fs.statfs(DISK_PATH);
  const totalBytes = s.blocks * s.bsize;
  const usedBytes = (s.blocks - s.bfree) * s.bsize;
  // What ordinary programs can still use (a few percent are reserved for root)
  const freeBytes = s.bavail * s.bsize;
  return { path: DISK_PATH, totalBytes, usedBytes, freeBytes, percent: percent(usedBytes, usedBytes + freeBytes) };
}

// ---------- slow facts: services, database size, folders ----------

function serviceStates(): Promise<ServerMetrics['services']> {
  return new Promise((resolve) => {
    // `systemctl is-active a b c` prints one state per line; it exits non-zero when any is not active, which is fine
    execFile('systemctl', ['is-active', ...SERVICES.map((s) => s.name)], { timeout: 4000 }, (_err, stdout) => {
      const lines = String(stdout ?? '').trim().split('\n');
      const known: ServiceState[] = ['active', 'inactive', 'failed', 'activating'];
      resolve(
        SERVICES.map((s, i) => ({
          ...s,
          state: lines.length === SERVICES.length && known.includes(lines[i] as ServiceState) ? (lines[i] as ServiceState) : 'unknown',
        })),
      );
    });
  });
}

/** Total size and number of the files directly inside a folder (0 when it doesn't exist) */
async function folderSize(dir: string) {
  let bytes = 0;
  let count = 0;
  let newest: { file: string; at: Date; bytes: number } | null = null;
  try {
    for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
      if (!entry.isFile() || entry.name.startsWith('.')) continue;
      const stat = await fs.stat(path.join(dir, entry.name));
      bytes += stat.size;
      count++;
      if (!newest || stat.mtime > newest.at) newest = { file: entry.name, at: stat.mtime, bytes: stat.size };
    }
  } catch {
    // Missing folder (e.g. no backup made yet)
  }
  return { bytes, count, newest };
}

async function databaseBytes() {
  try {
    const [row] = await sequelize.query<{ size: string }>('SELECT pg_database_size(current_database()) AS size', { type: QueryTypes.SELECT });
    return Number(row.size);
  } catch {
    return null;
  }
}

type Slow = Pick<ServerMetrics, 'services' | 'storage'>;
let slow: { at: number; value: Promise<Slow> } | null = null;

function slowFacts(): Promise<Slow> {
  if (!slow || Date.now() - slow.at > SLOW_CACHE_MS) {
    const value = (async (): Promise<Slow> => {
      const [services, db, images, backups] = await Promise.all([serviceStates(), databaseBytes(), folderSize(IMAGES_DIR), folderSize(BACKUP_DIR)]);
      // The weekly backup's own files (not e.g. a manual dump put in the same folder)
      const weekly = backups.newest && /^prafi_(db|images)_/.test(backups.newest.file) ? backups.newest : null;
      return {
        services,
        storage: {
          databaseBytes: db,
          imagesBytes: images.bytes,
          imagesCount: images.count,
          backupsBytes: backups.bytes,
          lastBackup: weekly && { file: weekly.file, at: weekly.at.toISOString(), bytes: weekly.bytes },
        },
      };
    })();
    slow = { at: Date.now(), value };
  }
  return slow.value;
}

// ---------- one reading ----------

export async function collect(): Promise<ServerMetrics> {
  const [cpu, mem, disk, facts] = await Promise.all([cpuPercent(), memory(), diskUsage(), slowFacts()]);
  return {
    at: new Date().toISOString(),
    host: {
      hostname: os.hostname(),
      os: `${os.type()} ${os.release()}`,
      uptimeSeconds: Math.round(os.uptime()),
      cores: os.cpus().length,
      loadAverage: os.loadavg().map((n) => Math.round(n * 100) / 100),
    },
    cpu: { percent: cpu },
    memory: mem,
    disk: { ...disk, alertPercent: env.monitor.diskAlertPercent },
    app: {
      nodeVersion: process.version,
      environment: env.nodeEnv,
      backendUptimeSeconds: Math.round(process.uptime()),
      backendMemoryBytes: process.memoryUsage().rss,
    },
    ...facts,
  };
}

// ---------- disk alert ----------

let lastAlertAt = 0;

/** Emails once when the disk is at the alert level, then again only after ALERT_REPEAT_HOURS. Returns what it did. */
export async function checkDisk(now = Date.now()) {
  const limit = env.monitor.diskAlertPercent;
  if (!limit) return 'off' as const;
  const disk = await diskUsage();
  if (disk.percent < limit) {
    // Back under the limit: the next time it fills up is a new alert
    lastAlertAt = 0;
    return 'ok' as const;
  }
  console.warn(`[monitor] disk ${disk.path} is ${disk.percent}% full (alert at ${limit}%)`);
  if (now - lastAlertAt < ALERT_REPEAT_HOURS * 3_600_000) return 'already-alerted' as const;

  const to = env.monitor.alertEmailTo.toLowerCase() === 'off' ? '' : env.monitor.alertEmailTo || env.mail.user;
  if (!to) return 'no-recipient' as const;
  const { storage } = await slowFacts();
  try {
    await sendMail({ to, ...diskAlmostFull({ ...disk, alertPercent: limit, hostname: os.hostname(), storage }) });
    lastAlertAt = now;
    console.warn(`[monitor] disk alert emailed to ${to}`);
    return 'alerted' as const;
  } catch (err) {
    // Tried again at the next check
    console.error('[monitor] could not send the disk alert:', (err as Error).message);
    return 'mail-failed' as const;
  }
}

/** Starts the live push (only works while someone watches) and the disk check. Timers don't keep the process alive. */
export function startServerMonitor() {
  let busy = false;
  setInterval(() => {
    if (busy || monitorWatchers() === 0) return;
    busy = true;
    collect()
      .then((metrics) => emitToMonitor(E.SERVER_METRICS, metrics))
      .catch((err) => console.error('[monitor] reading failed:', (err as Error).message))
      .finally(() => (busy = false));
  }, PUSH_SECONDS * 1000).unref();

  const check = () => void checkDisk().catch((err) => console.error('[monitor] disk check failed:', (err as Error).message));
  setTimeout(check, 60_000).unref();
  setInterval(check, DISK_CHECK_MINUTES * 60_000).unref();
}
