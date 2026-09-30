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

  corsOrigin: (process.env.CORS_ORIGIN ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean),
} as const;
