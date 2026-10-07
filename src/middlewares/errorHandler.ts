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
import type { LoggedError } from './requestLogger';

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
  '22P02': { status: 400, code: 'INVALID_INPUT_SYNTAX', message: 'Format nilai tidak valid (misalnya UUID atau angka yang salah)' },
  '22001': { status: 400, code: 'VALUE_TOO_LONG', message: 'Nilai terlalu panjang untuk kolomnya' },
  '22003': { status: 400, code: 'NUMERIC_OUT_OF_RANGE', message: 'Nilai angka di luar batas yang diizinkan' },
  '22007': { status: 400, code: 'INVALID_DATETIME', message: 'Format tanggal/waktu tidak valid' },
  '23502': { status: 400, code: 'NOT_NULL_VIOLATION', message: 'Ada field wajib yang belum diisi' },
  // ON DELETE RESTRICT (e.g. deleting a tenant's logo or a category that tenants still use)
  '23001': { status: 409, code: 'STILL_IN_USE', message: 'Data ini masih digunakan sehingga tidak dapat dihapus' },
  '23514': { status: 400, code: 'CHECK_VIOLATION', message: 'Nilai tidak memenuhi aturan pada database' },
};

// Sequelize's built-in validator messages are English; these replace them per validator.
// Custom validators (model hooks/validate) already throw their own messages, which are kept as-is.
const SEQUELIZE_VALIDATOR_MESSAGES: Record<string, (field: string) => string> = {
  is_null: (field) => `${field} wajib diisi`,
  notNull: (field) => `${field} wajib diisi`,
  notEmpty: (field) => `${field} tidak boleh kosong`,
  isEmail: (field) => `${field} harus berupa alamat email yang valid`,
  isIn: (field) => `${field} berisi nilai yang tidak diizinkan`,
  min: (field) => `${field} terlalu kecil`,
  max: (field) => `${field} terlalu besar`,
  len: (field) => `panjang ${field} tidak sesuai`,
  not_unique: (field) => `${field} sudah digunakan`,
};

const validatorMessage = (e: ValidationError['errors'][number]) =>
  (e.validatorKey && e.path && SEQUELIZE_VALIDATOR_MESSAGES[e.validatorKey]?.(e.path)) || e.message;

/** Converts any Sequelize error into an HttpError. Returns null if it is not a Sequelize error. */
function fromSequelizeError(err: unknown): HttpError | null {
  if (!(err instanceof SequelizeBaseError)) return null;

  // Must be checked before ValidationError (UniqueConstraintError extends it)
  if (err instanceof UniqueConstraintError) {
    const fields = Object.keys(err.fields ?? {});
    return new HttpError(
      409,
      fields.length ? `${fields.join(', ')} sudah digunakan` : 'Data duplikat',
      'UNIQUE_CONSTRAINT',
      err.errors.map((e) => ({ field: e.path, message: validatorMessage(e), value: e.value })),
    );
  }

  if (err instanceof ValidationError) {
    return new HttpError(
      400,
      'Validasi gagal',
      'VALIDATION_ERROR',
      err.errors.map((e) => ({ field: e.path, message: validatorMessage(e), rule: e.validatorKey })),
    );
  }

  // Must be checked before DatabaseError (these extend it)
  if (err instanceof ForeignKeyConstraintError) {
    return new HttpError(
      409,
      'Data yang dirujuk tidak ada atau masih digunakan',
      'FOREIGN_KEY_CONSTRAINT',
      { table: err.table, fields: err.fields, constraint: err.index },
    );
  }

  if (err instanceof ExclusionConstraintError) {
    return new HttpError(409, 'Data bentrok dengan data lain', 'EXCLUSION_CONSTRAINT', { constraint: err.constraint });
  }

  if (err instanceof TimeoutError) {
    return new HttpError(503, 'Waktu kueri database habis, silakan coba lagi', 'DB_TIMEOUT');
  }

  if (err instanceof ConnectionError) {
    return new HttpError(503, 'Database sedang tidak tersedia', 'DB_UNAVAILABLE');
  }

  if (err instanceof EmptyResultError) {
    return HttpError.notFound();
  }

  if (err instanceof OptimisticLockError) {
    return new HttpError(409, 'Data telah diubah oleh permintaan lain, silakan coba lagi', 'OPTIMISTIC_LOCK');
  }

  if (err instanceof DatabaseError) {
    const pgCode = (err.original as { code?: string } | undefined)?.code;
    const known = pgCode ? PG_CLIENT_ERRORS[pgCode] : undefined;
    if (known) return new HttpError(known.status, known.message, known.code);
    // Unknown DB errors: don't leak SQL or internals to the client
    return new HttpError(500, 'Terjadi kesalahan pada database', 'DATABASE_ERROR');
  }

  return new HttpError(500, 'Terjadi kesalahan pada database', 'DATABASE_ERROR');
}

/** Converts file upload errors thrown by multer. */
function fromMulterError(err: unknown): HttpError | null {
  if (!(err instanceof MulterError)) return null;

  if (err.code === 'LIMIT_FILE_SIZE') {
    return new HttpError(413, 'Ukuran file terlalu besar (maksimal 5 MB)', 'FILE_TOO_LARGE');
  }
  if (err.code === 'LIMIT_UNEXPECTED_FILE') {
    return HttpError.badRequest(`Field file "${err.field}" tidak dikenali, gunakan field "image"`);
  }
  const messages: Partial<Record<string, string>> = {
    LIMIT_FILE_COUNT: 'Hanya satu gambar yang dapat diunggah sekaligus',
    LIMIT_PART_COUNT: 'Isi formulir unggahan terlalu banyak',
    LIMIT_FIELD_KEY: 'Nama field pada formulir unggahan terlalu panjang',
    LIMIT_FIELD_VALUE: 'Isi field pada formulir unggahan terlalu panjang',
    LIMIT_FIELD_COUNT: 'Field pada formulir unggahan terlalu banyak',
    MISSING_FIELD_NAME: 'Formulir unggahan tidak valid (nama field kosong)',
  };
  return new HttpError(400, `Unggah gambar gagal: ${messages[err.code] ?? `kesalahan ${err.code}`}`, 'UPLOAD_FAILED', { reason: err.code });
}

/**
 * Upload problems that aren't multer limits: a cut-off upload (busboy) and disk errors while saving the file.
 * Without this they'd all be a vague 500.
 */
function fromUploadError(err: unknown): HttpError | null {
  if (typeof err !== 'object' || err === null) return null;
  const e = err as { code?: string; message?: string; syscall?: string };

  if (e.message === 'Unexpected end of form' || e.message === 'Unexpected end of multipart data') {
    return new HttpError(400, 'Unggah gambar gagal: koneksi terputus sebelum file selesai terkirim, silakan coba lagi', 'UPLOAD_INCOMPLETE');
  }
  if (e.message === 'Multipart: Boundary not found' || e.message?.startsWith('Malformed part header')) {
    return new HttpError(400, 'Unggah gambar gagal: format kiriman tidak valid (harus multipart/form-data)', 'UPLOAD_FAILED');
  }

  const disk: Partial<Record<string, string>> = {
    ENOSPC: 'penyimpanan server penuh',
    EDQUOT: 'kuota penyimpanan server habis',
    EACCES: 'server tidak memiliki izin menulis ke folder gambar',
    EPERM: 'server tidak memiliki izin menulis ke folder gambar',
    ENOENT: 'folder gambar di server tidak ditemukan',
    EROFS: 'penyimpanan server hanya bisa dibaca',
    EMFILE: 'server sedang terlalu sibuk',
  };
  if (e.code && disk[e.code] && e.syscall) {
    return new HttpError(500, `Gagal menyimpan gambar: ${disk[e.code]}. Hubungi administrator.`, 'IMAGE_STORAGE_FAILED', { reason: e.code });
  }
  return null;
}

/** Converts errors thrown by Express/body-parser (e.g. malformed JSON). */
function fromExpressError(err: unknown): HttpError | null {
  if (typeof err !== 'object' || err === null) return null;
  const e = err as { type?: string; status?: number; statusCode?: number; expose?: boolean; message?: string };

  if (e.type === 'entity.parse.failed') return HttpError.badRequest('Format JSON pada body request tidak valid');
  if (e.type === 'entity.too.large') return new HttpError(413, 'Body request terlalu besar', 'PAYLOAD_TOO_LARGE');

  const status = e.status ?? e.statusCode;
  if (typeof status === 'number' && status >= 400 && status < 600) {
    return new HttpError(status, 'Permintaan gagal', 'HTTP_ERROR');
  }
  return null;
}

export const notFoundHandler: RequestHandler = (req, _res, next) => {
  next(HttpError.notFound(`Rute ${req.method} ${req.originalUrl} tidak ditemukan`));
};

export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  const httpError =
    (err instanceof HttpError ? err : null) ??
    fromSequelizeError(err) ??
    fromMulterError(err) ??
    fromUploadError(err) ??
    fromExpressError(err) ??
    HttpError.internal();

  // Log server-side faults with full detail; client errors only need a short line
  if (httpError.statusCode >= 500) {
    console.error(`[${req.method} ${req.originalUrl}]`, err);
  } else if (!env.isProduction) {
    const details = httpError.details !== undefined ? ` ${JSON.stringify(httpError.details)}` : '';
    console.warn(`[${req.method} ${req.originalUrl}] ${httpError.statusCode} ${httpError.code}: ${httpError.message}${details}`);
  }

  // For the request's row in api_logs (requestLogger); 5xx keep the real error's stack, which the client never sees
  const logged: LoggedError = { code: httpError.code, message: httpError.message, details: httpError.details };
  if (httpError.statusCode >= 500) logged.stack = err instanceof Error ? err.stack : String(err);
  res.locals.apiError = logged;

  const body: ErrorBody = {
    success: false,
    error: { code: httpError.code, message: httpError.message },
  };
  if (httpError.details !== undefined) body.error.details = httpError.details;
  if (!env.isProduction && err instanceof Error) body.error.stack = err.stack;

  res.status(httpError.statusCode).json(body);
};
