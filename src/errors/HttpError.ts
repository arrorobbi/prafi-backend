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

  static badRequest(message = 'Bad request', details?: unknown) {
    return new HttpError(400, message, 'BAD_REQUEST', details);
  }

  static unauthorized(message = 'Unauthorized') {
    return new HttpError(401, message, 'UNAUTHORIZED');
  }

  static forbidden(message = 'Forbidden') {
    return new HttpError(403, message, 'FORBIDDEN');
  }

  static notFound(message = 'Resource not found') {
    return new HttpError(404, message, 'NOT_FOUND');
  }

  /** The account exists but its approval is not active (checked at login and on every request). */
  static notActivated() {
    return new HttpError(403, 'The user is not activated, contact the administrator', 'USER_NOT_ACTIVATED');
  }

  /** An endpoint that needs an :id was called without one (missing, empty, "null" or "undefined"). */
  static idNotProvided() {
    return new HttpError(400, 'ID not provided', 'ID_NOT_PROVIDED');
  }

  static conflict(message = 'Conflict', details?: unknown) {
    return new HttpError(409, message, 'CONFLICT', details);
  }

  static internal(message = 'Internal server error') {
    return new HttpError(500, message, 'INTERNAL_ERROR');
  }
}
