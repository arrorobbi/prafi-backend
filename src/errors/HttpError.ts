export class HttpError extends Error {
  readonly statusCode: number;
  readonly code: string;
  readonly details?: unknown;

  constructor(statusCode: number, message: string, code = 'HTTP_ERROR', details?: unknown) {
    super(message);
    this.name = 'HttpError';
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }

  static badRequest(message = 'Permintaan tidak valid', details?: unknown) {
    return new HttpError(400, message, 'BAD_REQUEST', details);
  }

  static unauthorized(message = 'Tidak terautentikasi, silakan login terlebih dahulu') {
    return new HttpError(401, message, 'UNAUTHORIZED');
  }

  static forbidden(message = 'Akses ditolak') {
    return new HttpError(403, message, 'FORBIDDEN');
  }

  static notFound(message = 'Data tidak ditemukan') {
    return new HttpError(404, message, 'NOT_FOUND');
  }

  /** The account exists but its approval is not active (checked at login and on every request). */
  static notActivated() {
    return new HttpError(403, 'Pengguna belum diaktifkan, hubungi administrator', 'USER_NOT_ACTIVATED');
  }

  /** An endpoint that needs an :id was called without one (missing, empty, "null" or "undefined"). */
  static idNotProvided() {
    return new HttpError(400, 'ID tidak diberikan', 'ID_NOT_PROVIDED');
  }

  static conflict(message = 'Terjadi konflik data', details?: unknown) {
    return new HttpError(409, message, 'CONFLICT', details);
  }

  static internal(message = 'Terjadi kesalahan pada server') {
    return new HttpError(500, message, 'INTERNAL_ERROR');
  }
}
