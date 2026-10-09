import { env } from '../config/env';
import { HttpError } from '../errors/HttpError';

const VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

export const turnstileEnabled = () => env.turnstileSecret !== '';

/**
 * Confirms a Cloudflare Turnstile token (the "not a robot" check) with Cloudflare. Throws 400 when it is missing or
 * not valid (expired, used twice, made for another site), 503 when Cloudflare can't be reached. Without
 * TURNSTILE_SECRET_KEY the check is skipped.
 */
export async function assertHuman(token: unknown, ip: string | null) {
  if (!turnstileEnabled()) return;
  if (typeof token !== 'string' || !token.trim()) {
    throw new HttpError(400, 'Selesaikan verifikasi "Saya bukan robot" terlebih dahulu', 'TURNSTILE_REQUIRED');
  }
  const body = new URLSearchParams({ secret: env.turnstileSecret, response: token.trim(), ...(ip && { remoteip: ip }) });
  let result: { success?: boolean; 'error-codes'?: string[] };
  try {
    const res = await fetch(VERIFY_URL, { method: 'POST', body, signal: AbortSignal.timeout(8000) });
    result = (await res.json()) as typeof result;
  } catch {
    throw new HttpError(503, 'Verifikasi "Saya bukan robot" sedang tidak dapat dihubungi, silakan coba lagi sebentar', 'TURNSTILE_UNAVAILABLE');
  }
  if (!result.success) {
    throw new HttpError(400, 'Verifikasi "Saya bukan robot" gagal atau kedaluwarsa, silakan ulangi', 'TURNSTILE_FAILED', {
      reasons: result['error-codes'] ?? [],
    });
  }
}

/** Startup line, like the mail check */
export function logTurnstileStatus() {
  if (turnstileEnabled()) console.log('[turnstile] review form check is on');
  else console.warn('[turnstile] TURNSTILE_SECRET_KEY is not set: the "not a robot" check on reviews is skipped');
}
