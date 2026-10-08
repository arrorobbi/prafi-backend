import { env } from '../config/env';

const DELAY_MS = 500;
const TIMEOUT_MS = 5000;
let timer: ReturnType<typeof setTimeout> | null = null;

/**
 * Tells the frontend to drop its cached landing pages (POST <frontend>/internal/revalidate), so a change visitors
 * can see shows at once instead of within 60 s. Call it after the change is saved. Several changes within half a
 * second send one request. Never throws or waits: a failure only means the pages refresh on their 60 s cache.
 */
export function revalidateLanding() {
  if (!env.revalidate.secret) return;
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    timer = null;
    fetch(env.revalidate.url, {
      method: 'POST',
      headers: { 'x-revalidate-secret': env.revalidate.secret },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
      .then((res) => {
        if (!res.ok) console.warn(`[revalidate] frontend answered ${res.status} (${env.revalidate.url})`);
      })
      .catch((err) => console.warn(`[revalidate] could not reach the frontend (${env.revalidate.url}):`, err?.message ?? err));
  }, DELAY_MS);
}
