import type { ErrorRequestHandler, RequestHandler } from 'express';
import { MulterError } from 'multer';
import {
  BaseError as SequelizeBaseError,
  ConnectionError,
  DatabaseError,
  EmptyResultError,
  ExclusionConstraintError,
  ForeignKeyConstraintError,
  OptimisticLockError,
  TimeoutError,
  UniqueConstraintError,
  ValidationError,
} from 'sequelize';
import { env } from '../config/env';
import { HttpError } from '../errors/HttpError';

interface ErrorBody {
  success: false;
  error: {
    code: string;
    message: string;
    details?: unknown;
    stack?: string;
  };
}

// PostgreSQL error codes that are caused by bad client input rather than a server fault.
// https://www.postgresql.org/docs/current/errcodes-appendix.html
const PG_CLIENT_ERRORS: Record<string, { status: number; code: string; message: string }> = {
  '22P02': { status: 400, code: 'INVALID_INPUT_SYNTAX', message: 'Invalid value format (e.g. malformed UUID or number)' },
  '22001': { status: 400, code: 'VALUE_TOO_LONG', message: 'A value is too long for its column' },
  '22003': { status: 400, code: 'NUMERIC_OUT_OF_RANGE', message: 'A numeric value is out of range' },
  '22007': { status: 400, code: 'INVALID_DATETIME', message: 'Invalid date/time format' },
  '23502': { status: 400, code: 'NOT_NULL_VIOLATION', message: 'A required field is missing' },
  '23514': { status: 400, code: 'CHECK_VIOLATION', message: 'A value violates a check constraint' },
};

/** Converts any Sequelize error into an HttpError. Returns null if it is not a Sequelize error. */
function fromSequelizeError(err: unknown): HttpError | null {
  if (!(err instanceof SequelizeBaseError)) return null;

  // Must be checked before ValidationError (UniqueConstraintError extends it)
  if (err instanceof UniqueConstraintError) {
    const fields = Object.keys(err.fields ?? {});
    return new HttpError(
      409,
      fields.length ? `${fields.join(', ')} already exists` : 'Duplicate value',
      'UNIQUE_CONSTRAINT',
      err.errors.map((e) => ({ field: e.path, message: e.message, value: e.value })),
    );
  }

  if (err instanceof ValidationError) {
    return new HttpError(
      400,
      'Validation failed',
      'VALIDATION_ERROR',
      err.errors.map((e) => ({ field: e.path, message: e.message, rule: e.validatorKey })),
    );
  }

  // Must be checked before DatabaseError (these extend it)
  if (err instanceof ForeignKeyConstraintError) {
    return new HttpError(
      409,
      'Referenced record does not exist or is still in use',
      'FOREIGN_KEY_CONSTRAINT',
      { table: err.table, fields: err.fields, constraint: err.index },
    );
  }

  if (err instanceof ExclusionConstraintError) {
    return new HttpError(409, 'Conflicting record', 'EXCLUSION_CONSTRAINT', { constraint: err.constraint });
  }

  if (err instanceof TimeoutError) {
    return new HttpError(503, 'Database query timed out, please retry', 'DB_TIMEOUT');
  }

  if (err instanceof ConnectionError) {
    return new HttpError(503, 'Database is unavailable', 'DB_UNAVAILABLE');
  }

  if (err instanceof EmptyResultError) {
    return HttpError.notFound();
  }

  if (err instanceof OptimisticLockError) {
    return new HttpError(409, 'Record was modified by another request, please retry', 'OPTIMISTIC_LOCK');
  }

  if (err instanceof DatabaseError) {
    const pgCode = (err.original as { code?: string } | undefined)?.code;
    const known = pgCode ? PG_CLIENT_ERRORS[pgCode] : undefined;
    if (known) return new HttpError(known.status, known.message, known.code);
    // Unknown DB errors: don't leak SQL or internals to the client
    return new HttpError(500, 'A database error occurred', 'DATABASE_ERROR');
  }

  return new HttpError(500, 'A database error occurred', 'DATABASE_ERROR');
}

/** Converts file upload errors thrown by multer. */
function fromMulterError(err: unknown): HttpError | null {
  if (!(err instanceof MulterError)) return null;

  if (err.code === 'LIMIT_FILE_SIZE') {
    return new HttpError(413, 'File is too large (max 5 MB)', 'FILE_TOO_LARGE');
  }
  if (err.code === 'LIMIT_UNEXPECTED_FILE') {
    return HttpError.badRequest(`Unexpected file field "${err.field}"`);
  }
  return HttpError.badRequest(err.message);
}

/** Converts errors thrown by Express/body-parser (e.g. malformed JSON). */
function fromExpressError(err: unknown): HttpError | null {
  if (typeof err !== 'object' || err === null) return null;
  const e = err as { type?: string; status?: number; statusCode?: number; expose?: boolean; message?: string };

  if (e.type === 'entity.parse.failed') return HttpError.badRequest('Malformed JSON in request body');
  if (e.type === 'entity.too.large') return new HttpError(413, 'Request body is too large', 'PAYLOAD_TOO_LARGE');

  const status = e.status ?? e.statusCode;
  if (typeof status === 'number' && status >= 400 && status < 600) {
    return new HttpError(status, e.expose && e.message ? e.message : 'Request failed', 'HTTP_ERROR');
  }
  return null;
}

export const notFoundHandler: RequestHandler = (req, _res, next) => {
  next(HttpError.notFound(`Route ${req.method} ${req.originalUrl} not found`));
};

export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  const httpError =
    (err instanceof HttpError ? err : null) ??
    fromSequelizeError(err) ??
    fromMulterError(err) ??
    fromExpressError(err) ??
    HttpError.internal();

  // Log server-side faults with full detail; client errors only need a short line
  if (httpError.statusCode >= 500) {
    console.error(`[${req.method} ${req.originalUrl}]`, err);
  } else if (!env.isProduction) {
    const details = httpError.details !== undefined ? ` ${JSON.stringify(httpError.details)}` : '';
    console.warn(`[${req.method} ${req.originalUrl}] ${httpError.statusCode} ${httpError.code}: ${httpError.message}${details}`);
  }

  const body: ErrorBody = {
    success: false,
    error: { code: httpError.code, message: httpError.message },
  };
  if (httpError.details !== undefined) body.error.details = httpError.details;
  if (!env.isProduction && err instanceof Error) body.error.stack = err.stack;

  res.status(httpError.statusCode).json(body);
};
