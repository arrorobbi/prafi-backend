import { HttpError } from '../errors/HttpError';

/**
 * Slows down password guessing on POST /api/auth/login. Only wrong passwords count:
 *  - the same email from the same network (IP): MAX_PER_ACCOUNT wrong tries, then that network waits before trying
 *    that account again. Counted per network on purpose, so a stranger can't lock the real owner out of their
 *    account from somewhere else;
 *  - one network (IP), whatever the email: MAX_PER_IP wrong tries, then it waits (guessing across many accounts).
 * The wait ends WINDOW_MS after the oldest counted try. A correct password clears the account's count.
 *
 * Kept in memory (one backend process): a restart clears it, which only ever helps a waiting user.
 */
export const WINDOW_MS = 15 * 60_000;
export const MAX_PER_ACCOUNT = 5;
export const MAX_PER_IP = 20;
/** Upper bound of remembered keys, so a flood of made-up emails can't grow the memory without end */
const MAX_KEYS = 50_000;

/** key → times (ms) of the wrong tries still inside the window, oldest first */
const failures = new Map<string, number[]>();

const accountKey = (email: string, ip: string | null) => `a:${email.trim().toLowerCase()}|${ip ?? 'unknown'}`;
const ipKey = (ip: string | null) => `i:${ip ?? 'unknown'}`;

function recent(key: string, now: number) {
  const kept = (failures.get(key) ?? []).filter((t) => now - t < WINDOW_MS);
  if (kept.length) failures.set(key, kept);
  else failures.delete(key);
  return kept;
}

/** Seconds until this key may try again, or 0 */
function waitSeconds(key: string, max: number, now: number) {
  const tries = recent(key, now);
  if (tries.length < max) return 0;
  // Free again when the try that filled the limit leaves the window
  return Math.max(1, Math.ceil((tries[tries.length - max] + WINDOW_MS - now) / 1000));
}

/** Throws 429 while this email + network, or this network, has too many wrong tries. Call before checking the password. */
export function assertLoginAllowed(email: string, ip: string | null) {
  const now = Date.now();
  const wait = Math.max(waitSeconds(accountKey(email, ip), MAX_PER_ACCOUNT, now), waitSeconds(ipKey(ip), MAX_PER_IP, now));
  if (wait > 0) {
    const minutes = Math.ceil(wait / 60);
    throw HttpError.tooManyRequests(
      `Terlalu banyak percobaan login yang gagal. Silakan coba lagi dalam ${minutes} menit, atau gunakan Lupa Password.`,
      { retryAfterSeconds: wait },
    );
  }
}

/** Counts one wrong password. Returns how many tries this email has left from this network before it must wait. */
export function recordLoginFailure(email: string, ip: string | null) {
  const now = Date.now();
  if (failures.size >= MAX_KEYS) sweep(now);
  let left = MAX_PER_ACCOUNT;
  for (const [key, max] of [[accountKey(email, ip), MAX_PER_ACCOUNT], [ipKey(ip), MAX_PER_IP]] as const) {
    const tries = [...recent(key, now), now];
    failures.set(key, tries);
    left = Math.min(left, max - tries.length);
  }
  return Math.max(0, left);
}

/** A correct password: this account's count from this network starts again (the network's own count stays). */
export function clearLoginFailures(email: string, ip: string | null) {
  failures.delete(accountKey(email, ip));
}

function sweep(now: number) {
  for (const key of failures.keys()) recent(key, now);
  // Still full of live entries (a real flood): drop the oldest keys
  if (failures.size >= MAX_KEYS) {
    let extra = failures.size - MAX_KEYS / 2;
    for (const key of failures.keys()) {
      if (extra-- <= 0) break;
      failures.delete(key);
    }
  }
}

// Forget finished windows regularly (the timer doesn't keep the process alive on shutdown)
setInterval(() => sweep(Date.now()), 5 * 60_000).unref();

/** Tests only */
export function resetLoginGuard() {
  failures.clear();
}
