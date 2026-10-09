import 'dotenv/config';

function required(name: string): string {
  const value = process.env[name];
  if (value === undefined || value === '') {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export const env = {
  nodeEnv: process.env.NODE_ENV ?? 'development',
  isProduction: process.env.NODE_ENV === 'production',
  port: Number(process.env.PORT ?? 4000),
  /** Public base URL of this backend, used to build absolute image links. */
  appUrl: (process.env.APP_URL ?? `http://localhost:${process.env.PORT ?? 4000}`).replace(/\/+$/, ''),

  db: {
    host: process.env.DB_HOST ?? 'localhost',
    port: Number(process.env.DB_PORT ?? 5432),
    name: required('DB_NAME'),
    user: required('DB_USER'),
    password: required('DB_PASSWORD'),
    logging: process.env.DB_LOGGING === 'true',
  },

  jwt: {
    secret: required('JWT_SECRET'),
    // Access tokens expire after 1 hour; the user must log in again afterwards
    expiresIn: process.env.JWT_EXPIRES_IN ?? '1h',
  },

  /**
   * The frontend's public URL. Emails that need a page of the frontend link there,
   * e.g. the forgot-password email: <FRONTEND_URL>/reset-password?userId=…&token=…
   */
  frontendUrl: (process.env.FRONTEND_URL ?? 'http://localhost:5173').replace(/\/+$/, ''),

  /**
   * Landing pages refresh at once after a public change: the backend POSTs to the frontend's /internal/revalidate
   * with this shared secret (the same REVALIDATE_SECRET in the frontend .env). Empty = off (pages refresh within 60 s).
   */
  revalidate: {
    secret: process.env.REVALIDATE_SECRET ?? '',
    url: (process.env.FRONTEND_REVALIDATE_URL || `${(process.env.FRONTEND_URL ?? 'http://localhost:5173').replace(/\/+$/, '')}/internal/revalidate`),
  },

  /** Outgoing email (nodemailer). Without SMTP_HOST, emails are not sent but printed in the server log (development). */
  mail: {
    host: process.env.SMTP_HOST ?? '',
    port: Number(process.env.SMTP_PORT ?? 587),
    /** true for port 465 (TLS from the start); false for 587/25 (STARTTLS) */
    secure: process.env.SMTP_SECURE === 'true',
    user: process.env.SMTP_USER ?? '',
    pass: process.env.SMTP_PASS ?? '',
    from: process.env.MAIL_FROM ?? 'Trans Niaga <no-reply@transniaga.local>',
  },

  /**
   * Cloudflare Turnstile ("not a robot" check on the public review form). The secret key confirms a visitor's
   * token with Cloudflare; empty = the check is skipped (a warning is logged at startup).
   */
  turnstileSecret: process.env.TURNSTILE_SECRET_KEY ?? '',

  /** API request/error logs (GET /api/logs) older than this many days are deleted. */
  logRetentionDays: Math.max(1, Number(process.env.LOG_RETENTION_DAYS ?? 30) || 30),

  corsOrigin: (process.env.CORS_ORIGIN ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean),
} as const;
