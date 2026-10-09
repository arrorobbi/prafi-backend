import { networkInterfaces } from 'node:os';
import type { Request } from 'express';

/**
 * Proxies we trust to report the visitor's address: loopback, private networks and this server's own addresses
 * (requests from the website pass nginx → Next.js → nginx → here, all on this machine).
 */
const OWN_ADDRESSES = new Set(
  Object.values(networkInterfaces())
    .flat()
    .map((i) => i?.address)
    .filter((a): a is string => !!a),
);

const normalize = (ip: string) => ip.trim().replace(/^::ffff:/i, '').replace(/^\[|\]$/g, '');

function isTrustedProxy(ip: string) {
  return (
    OWN_ADDRESSES.has(ip) ||
    ip === '::1' ||
    /^127\./.test(ip) ||
    /^10\./.test(ip) ||
    /^192\.168\./.test(ip) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(ip) ||
    /^f[cd][0-9a-f]{2}:/i.test(ip) ||
    /^fe80:/i.test(ip)
  );
}

/**
 * The visitor's IP. Each proxy appends the address it received the request from to X-Forwarded-For, but a visitor
 * can put anything in the header themselves, so it is read from the right: the first address not belonging to one
 * of our own proxies is the real visitor (as our nginx saw them). Faked entries further left are ignored, so they
 * can't dodge the per-IP limits (e.g. reviews).
 */
export function clientIp(req: Request) {
  const forwarded = req.headers['x-forwarded-for'];
  const chain = (Array.isArray(forwarded) ? forwarded.join(',') : (forwarded ?? ''))
    .split(',')
    .map(normalize)
    .filter(Boolean);
  const hops = [...chain, normalize(req.socket.remoteAddress ?? '')].filter(Boolean);
  for (let i = hops.length - 1; i >= 0; i--) {
    if (!isTrustedProxy(hops[i])) return hops[i].slice(0, 64);
  }
  // Only our own machines in the chain (e.g. a request from the server itself)
  return hops[0]?.slice(0, 64) ?? null;
}
