import type { RequestHandler } from 'express';

/**
 * Logs one line per request when the response finishes, e.g.
 *   [14:05:12] POST /api/auth/register 201 254ms - admin admin1@prafi.test
 * Request bodies are never logged (they contain passwords).
 */
export const requestLogger: RequestHandler = (req, res, next) => {
  const start = process.hrtime.bigint();

  res.on('finish', () => {
    const ms = Number(process.hrtime.bigint() - start) / 1e6;
    const time = new Date().toLocaleTimeString('en-GB', { hour12: false });
    const who = req.user ? ` - ${req.user.role} ${req.user.email}` : '';
    const line = `[${time}] ${req.method} ${req.originalUrl} ${res.statusCode} ${ms.toFixed(0)}ms${who}`;

    if (res.statusCode >= 500) console.error(line);
    else if (res.statusCode >= 400) console.warn(line);
    else console.log(line);
  });

  next();
};
