import { ImapFlow, type MessageStructureObject } from 'imapflow';
import { Op } from 'sequelize';
import { env } from '../config/env';
import { Otp, SiteSetting, User } from '../models';
import type { EmailIssue } from '../models/user.model';

/*
 * Emails that never reached their receiver. Gmail (like every mail server) accepts the message first and, when the
 * receiving server refuses it, sends a "Delivery Status Notification" back to our own inbox. This service reads
 * those replies over IMAP (read-only: nothing is marked read, moved or deleted), takes the address and the reason
 * from their machine-readable part (RFC 3464 message/delivery-status), and notes it on the account with that
 * address (users.email_issue). Errors from our own mail server while sending are noted right away (send_failed).
 */

/** Last inbox message already read: "<uidValidity>:<uid>" (site_settings). */
const STATE_KEY = 'bounce_check_last_uid';

export interface Bounce {
  uid: number;
  date: Date;
  recipient: string;
  /** Enhanced status code, e.g. "5.1.1" */
  status: string;
  issue: EmailIssue;
  detail: string;
}

/** Status code + server text → the kind of problem shown in the dashboards. */
export function classify(status: string, detail = ''): EmailIssue | null {
  const text = `${status} ${detail}`.toLowerCase();
  if (/\b[45]\.2\.2\b|quota|mailbox (is )?full|over ?quota|insufficient (system )?storage|storage (is )?full|out of storage/.test(text)) {
    return 'mailbox_full';
  }
  if (/\b5\.1\.[0-3]\b|\b5\.1\.10\b|does ?n[o']t exist|no such user|user unknown|unknown user|address not found|recipient (address )?rejected|mailbox unavailable|invalid recipient|domain (not found|does not exist)|no mx/.test(text)) {
    return 'not_found';
  }
  if (/^5\./.test(status) || /\b5\.\d{1,3}\.\d{1,3}\b/.test(text)) return 'rejected';
  if (/^4\./.test(status)) return 'delayed';
  return null;
}

/** RFC 822 headers ("Name: value", folded lines joined) of one delivery-status block. */
function headerFields(block: string) {
  const fields = new Map<string, string>();
  for (const line of block.replace(/\r\n/g, '\n').replace(/\n[ \t]+/g, ' ').split('\n')) {
    const m = /^([A-Za-z-]+):\s*(.*)$/.exec(line);
    if (m) fields.set(m[1].toLowerCase(), m[2].trim());
  }
  return fields;
}

/** Each failed recipient of a message/delivery-status part: its address, status and the server's words. */
export function parseDeliveryStatus(text: string): { recipient: string; status: string; action: string; detail: string }[] {
  // The first block describes the message, every following block one recipient
  const blocks = text.replace(/\r\n/g, '\n').split(/\n\s*\n/).slice(1);
  const found: { recipient: string; status: string; action: string; detail: string }[] = [];
  for (const block of blocks) {
    const f = headerFields(block);
    const recipient = (f.get('final-recipient') ?? f.get('original-recipient') ?? '').replace(/^rfc822;\s*/i, '').replace(/[<>]/g, '').trim();
    const action = (f.get('action') ?? '').toLowerCase();
    if (!recipient || !/@/.test(recipient) || action === 'delivered' || action === 'relayed' || action === 'expanded') continue;
    found.push({
      recipient: recipient.toLowerCase(),
      status: (f.get('status') ?? '').trim(),
      action,
      detail: (f.get('diagnostic-code') ?? '').replace(/^smtp;\s*/i, '').replace(/\s+/g, ' ').trim(),
    });
  }
  return found;
}

function findPart(node: MessageStructureObject | undefined, type: string): MessageStructureObject | undefined {
  if (!node) return undefined;
  if (node.type?.toLowerCase() === type) return node;
  for (const child of node.childNodes ?? []) {
    const hit = findPart(child, type);
    if (hit) return hit;
  }
  return undefined;
}

async function readStream(stream: NodeJS.ReadableStream, maxBytes = 256 * 1024) {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of stream) {
    const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as string);
    size += buf.length;
    if (size > maxBytes) break;
    chunks.push(buf);
  }
  return Buffer.concat(chunks).toString('utf8');
}

export const bounceCheckEnabled = () => !!(env.bounceCheck.host && env.bounceCheck.user && env.bounceCheck.pass);

/**
 * Reads the bounce replies that arrived since the last check. `dryRun`: also the ones already read, from the last
 * `lookbackDays`, and nothing is saved (npm run bounces:check -- --dry-run).
 */
export async function readBounces({ dryRun = false } = {}): Promise<{ bounces: Bounce[]; scanned: number; state: string | null }> {
  const client = new ImapFlow({
    host: env.bounceCheck.host,
    port: env.bounceCheck.port,
    secure: true,
    auth: { user: env.bounceCheck.user, pass: env.bounceCheck.pass },
    logger: false,
  });
  await client.connect();
  try {
    // readOnly: the inbox is only looked at, nothing in it changes (no "read" mark either)
    const lock = await client.getMailboxLock('INBOX', { readOnly: true });
    try {
      const mailbox = client.mailbox;
      const validity = mailbox ? String(mailbox.uidValidity) : '0';
      const saved = dryRun ? null : (await SiteSetting.findByPk(STATE_KEY))?.value ?? null;
      const [savedValidity, savedUid] = saved?.split(':') ?? [];
      const fromBounceSender: { or: { from: string }[] } = {
        or: [{ from: 'mailer-daemon' }, { from: 'postmaster' }],
      };
      const query =
        savedValidity === validity && Number(savedUid) > 0
          ? { ...fromBounceSender, uid: `${Number(savedUid) + 1}:*` }
          : { ...fromBounceSender, since: new Date(Date.now() - env.bounceCheck.lookbackDays * 86_400_000) };

      const sameBox = savedValidity === validity;
      let lastUid = (sameBox && Number(savedUid)) || 0;
      // "n:*" also returns the newest message when nothing newer than n exists, so filter again
      const uids = ((await client.search(query, { uid: true })) || []).filter((u) => u > lastUid);
      const bounces: Bounce[] = [];

      if (uids.length) {
        const messages = await client.fetchAll(uids.join(','), { uid: true, bodyStructure: true, internalDate: true, envelope: true }, { uid: true });
        for (const msg of messages) {
          lastUid = Math.max(lastUid, msg.uid);
          const date = new Date(msg.internalDate ?? msg.envelope?.date ?? Date.now());
          const part = findPart(msg.bodyStructure, 'message/delivery-status') ?? findPart(msg.bodyStructure, 'message/global-delivery-status');
          if (!part?.part) continue;
          const dl = await client.download(String(msg.uid), part.part, { uid: true });
          if (!('content' in dl) || !dl.content) continue;
          for (const r of parseDeliveryStatus(await readStream(dl.content))) {
            const issue = classify(r.status, r.detail);
            if (issue) bounces.push({ uid: msg.uid, date, recipient: r.recipient, status: r.status, issue, detail: r.detail.slice(0, 500) });
          }
        }
      }
      return { bounces, scanned: uids.length, state: uids.length ? `${validity}:${lastUid}` : saved };
    } finally {
      lock.release();
    }
  } finally {
    await client.logout().catch(() => client.close());
  }
}

/**
 * Notes a delivery problem on the account with that address. Skipped when the address was verified after the
 * bounce came in (the email arrived after all), when a newer problem is already noted, or when it's only a delay
 * (the server still retries) and a real failure is noted.
 */
async function note(recipient: string, issue: EmailIssue, detail: string, at: Date) {
  const user = await User.findOne({ where: { email: recipient }, attributes: ['id', 'emailIssue', 'emailIssueAt', 'email'] });
  if (!user) return false;
  const verifiedLater = await Otp.findOne({
    where: { userId: user.id, purpose: ['otp', 'link'], usedAt: { [Op.gt]: at } },
    attributes: ['id'],
  });
  if (verifiedLater) return false;
  if (user.emailIssueAt && user.emailIssueAt > at) return false;
  if (issue === 'delayed' && user.emailIssue && user.emailIssue !== 'delayed') return false;
  await user.update({ emailIssue: issue, emailIssueDetail: detail || null, emailIssueAt: at });
  return true;
}

/** One check: reads new bounces and notes them. Returns how many accounts got a note. */
export async function checkBounces() {
  const { bounces, state } = await readBounces();
  let noted = 0;
  for (const b of bounces) if (await note(b.recipient, b.issue, b.detail, b.date)) noted++;
  if (state) await SiteSetting.upsert({ key: STATE_KEY, value: state, updatedBy: null });
  return { found: bounces.length, noted };
}

/** Our own mail server refused to send (e.g. the address is malformed, or SMTP is down): noted at once. */
export async function recordSendFailure(userId: string, err: Error & { responseCode?: number; response?: string }) {
  try {
    const detail = (err.response ?? err.message ?? '').slice(0, 500);
    const code = /\b[45]\.\d{1,3}\.\d{1,3}\b/.exec(detail)?.[0] ?? (err.responseCode ? `${String(err.responseCode)[0]}.0.0` : '');
    // A receiver refusal reported while sending counts as that refusal; anything else is our side
    const issue = (err.responseCode && err.responseCode >= 500 && classify(code, detail)) || 'send_failed';
    await User.update({ emailIssue: issue, emailIssueDetail: detail || null, emailIssueAt: new Date() }, { where: { id: userId } });
  } catch (e) {
    console.error('[bounce] could not note the send failure:', (e as Error).message);
  }
}

let timer: NodeJS.Timeout | null = null;
let running = false;

/** Called at startup: checks the inbox every BOUNCE_CHECK_MINUTES (first check after one minute). */
export function startBounceCheck() {
  if (!env.bounceCheck.minutes) return;
  if (!bounceCheckEnabled()) {
    console.warn('[bounce] off: no IMAP host/account (set IMAP_HOST, or use Gmail SMTP)');
    return;
  }
  const run = async () => {
    if (running) return;
    running = true;
    try {
      const { found, noted } = await checkBounces();
      if (found) console.log(`[bounce] ${found} undelivered email(s) found, ${noted} account(s) noted`);
    } catch (err) {
      console.error('[bounce] inbox check failed:', (err as Error).message);
    } finally {
      running = false;
    }
  };
  setTimeout(run, 60_000).unref();
  timer = setInterval(run, env.bounceCheck.minutes * 60_000);
  timer.unref();
  console.log(`[bounce] checking ${env.bounceCheck.host} every ${env.bounceCheck.minutes} min`);
}
