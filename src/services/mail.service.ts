import nodemailer, { type Transporter } from 'nodemailer';
import { env } from '../config/env';

/** No SMTP server configured: emails are printed in the server log instead of being sent (development). */
export const mailIsSimulated = !env.mail.host;

let transporter: Transporter | null = null;

function transport() {
  transporter ??= mailIsSimulated
    ? nodemailer.createTransport({ jsonTransport: true })
    : nodemailer.createTransport({
        host: env.mail.host,
        port: env.mail.port,
        secure: env.mail.secure,
        ...(env.mail.user && { auth: { user: env.mail.user, pass: env.mail.pass } }),
      });
  return transporter;
}

export interface MailMessage {
  to: string;
  subject: string;
  html: string;
  /** Plain-text version for mail clients that don't show HTML (and for the development log). */
  text: string;
}

export async function sendMail(message: MailMessage) {
  await transport().sendMail({ from: env.mail.from, ...message });
  if (mailIsSimulated) {
    console.log(`\n[mail] NOT SENT (SMTP_HOST is not set) → ${message.to}\n[mail] Subject: ${message.subject}\n${message.text.replace(/^/gm, '[mail] ')}\n`);
  }
}

/** Called at startup: logs whether email can be delivered, without stopping the server. */
export async function checkMailConnection() {
  if (mailIsSimulated) {
    console.warn('[mail] SMTP_HOST is not set: emails are printed in this log instead of being sent');
    return;
  }
  try {
    await transport().verify();
    console.log(`[mail] SMTP ready (${env.mail.host}:${env.mail.port})`);
  } catch (err) {
    console.error(`[mail] SMTP connection failed (${env.mail.host}:${env.mail.port}):`, (err as Error).message);
  }
}
