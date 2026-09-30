import type { RequestHandler, RequestParamHandler } from 'express';
import { HttpError } from '../errors/HttpError';

/**
 * True for the values a client sends when it has no id: nothing, blank, "null", "undefined"
 * (e.g. `/products/${product?.id}` in the frontend) or an unset Postman variable like "{{productId}}".
 */
export function isMissingId(value: unknown): boolean {
  if (value === undefined || value === null) return true;
  const text = String(value).trim();
  return text === '' || ['null', 'undefined'].includes(text.toLowerCase()) || /^\{\{.*\}\}$/.test(text);
}

/**
 * Register with `router.param('id', requireIdParam)`: runs before every route of that router that has `:id`.
 */
export const requireIdParam: RequestParamHandler = (_req, _res, next, value) => {
  next(isMissingId(value) ? HttpError.idNotProvided() : undefined);
};

/** For the same routes called with no id segment at all, e.g. `DELETE /api/products/`. */
export const idNotProvided: RequestHandler = () => {
  throw HttpError.idNotProvided();
};
