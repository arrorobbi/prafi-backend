import type { RequestHandler } from 'express';
import { ALL_ROLES, ROLES, type Role } from '../constants/roles';
import { HttpError } from '../errors/HttpError';
import * as authService from '../services/auth.service';

const MIN_PASSWORD_LENGTH = 8;

export const login: RequestHandler = async (req, res) => {
  const { email, password } = (req.body ?? {}) as { email?: unknown; password?: unknown };

  const errors: { field: string; message: string }[] = [];
  if (typeof email !== 'string' || !email.trim()) errors.push({ field: 'email', message: 'Email is required' });
  if (typeof password !== 'string' || !password) errors.push({ field: 'password', message: 'Password is required' });
  if (errors.length) throw HttpError.badRequest('Validation failed', errors);

  const result = await authService.login(email as string, password as string);
  res.json({ success: true, data: result });
};

export const register: RequestHandler = async (req, res) => {
  const body = (req.body ?? {}) as Record<string, unknown>;
  const errors: { field: string; message: string }[] = [];

  for (const field of ['firstName', 'lastName', 'phoneNumber', 'email', 'password'] as const) {
    if (typeof body[field] !== 'string' || !(body[field] as string).trim()) {
      errors.push({ field, message: `${field} is required` });
    }
  }
  if (typeof body.password === 'string' && body.password.length < MIN_PASSWORD_LENGTH) {
    errors.push({ field: 'password', message: `password must be at least ${MIN_PASSWORD_LENGTH} characters` });
  }
  if (!ALL_ROLES.includes(body.role as Role)) {
    errors.push({ field: 'role', message: `role must be one of: ${ALL_ROLES.join(', ')}` });
  }
  const faceImageId = body.faceImageId ?? null;
  if (faceImageId !== null && !Number.isInteger(faceImageId)) {
    errors.push({ field: 'faceImageId', message: 'faceImageId must be an integer image id' });
  }
  // Every tenant must have a tenant name; other roles don't have one
  const isTenant = body.role === ROLES.TENANT;
  if (isTenant && (typeof body.tenantName !== 'string' || !body.tenantName.trim())) {
    errors.push({ field: 'tenantName', message: 'tenantName is required for tenant accounts' });
  }
  if (!isTenant && body.tenantName !== undefined) {
    errors.push({ field: 'tenantName', message: 'tenantName is only used for tenant accounts' });
  }
  if (errors.length) throw HttpError.badRequest('Validation failed', errors);

  const user = await authService.register(req.user!, {
    firstName: (body.firstName as string).trim(),
    lastName: (body.lastName as string).trim(),
    phoneNumber: (body.phoneNumber as string).trim(),
    email: body.email as string,
    password: body.password as string,
    role: body.role as Role,
    faceImageId: faceImageId as number | null,
    ...(isTenant && { tenantName: (body.tenantName as string).trim() }),
  });
  res.status(201).json({ success: true, data: user });
};

/** POST /api/auth/logout — revokes the token sent with this request. */
export const logout: RequestHandler = async (req, res) => {
  await authService.logout(req.user!, req.accessToken!);
  res.json({ success: true, data: { message: 'Logged out, this token can no longer be used' } });
};

export const me: RequestHandler = async (req, res) => {
  const user = await authService.getProfile(req.user!.id);
  res.json({ success: true, data: user });
};

const UPDATABLE_TEXT_FIELDS = ['firstName', 'lastName', 'phoneNumber', 'email'] as const;
const UPDATABLE_FIELDS = [...UPDATABLE_TEXT_FIELDS, 'password', 'currentPassword', 'faceImageId', 'tenantName'];
const LOCKED_FIELDS: Record<string, string> = {
  id: 'id cannot be changed',
  role: 'role cannot be changed',
  createdAt: 'createdAt is set by the server',
  updatedAt: 'updatedAt is set by the server',
};

/** PATCH /api/auth/me — the logged-in user updates their own account. Send only the fields to change. */
export const updateMe: RequestHandler = async (req, res) => {
  const body = (req.body ?? {}) as Record<string, unknown>;
  const errors: { field: string; message: string }[] = [];

  for (const field of Object.keys(body)) {
    if (LOCKED_FIELDS[field]) errors.push({ field, message: LOCKED_FIELDS[field] });
    else if (!UPDATABLE_FIELDS.includes(field)) errors.push({ field, message: `${field} is not an updatable field` });
  }

  const input: authService.UpdateProfileInput = {};
  for (const field of UPDATABLE_TEXT_FIELDS) {
    if (body[field] === undefined) continue;
    if (typeof body[field] !== 'string' || !(body[field] as string).trim()) {
      errors.push({ field, message: `${field} cannot be empty` });
    } else {
      input[field] = (body[field] as string).trim();
    }
  }

  if (body.password !== undefined) {
    if (typeof body.password !== 'string' || body.password.length < MIN_PASSWORD_LENGTH) {
      errors.push({ field: 'password', message: `password must be at least ${MIN_PASSWORD_LENGTH} characters` });
    } else if (typeof body.currentPassword !== 'string' || !body.currentPassword) {
      errors.push({ field: 'currentPassword', message: 'currentPassword is required to change the password' });
    } else {
      input.password = body.password;
      input.currentPassword = body.currentPassword;
    }
  }

  if (body.faceImageId !== undefined) {
    if (body.faceImageId !== null && !Number.isInteger(body.faceImageId)) {
      errors.push({ field: 'faceImageId', message: 'faceImageId must be an integer image id, or null to remove it' });
    } else {
      input.faceImageId = body.faceImageId as number | null;
    }
  }

  if (body.tenantName !== undefined) {
    if (req.user!.role !== ROLES.TENANT) {
      errors.push({ field: 'tenantName', message: 'Only tenant accounts have a tenantName' });
    } else if (typeof body.tenantName !== 'string' || !body.tenantName.trim()) {
      errors.push({ field: 'tenantName', message: 'tenantName cannot be empty' });
    } else {
      input.tenantName = body.tenantName.trim();
    }
  }

  if (errors.length) throw HttpError.badRequest('Validation failed', errors);
  if (Object.keys(input).length === 0) {
    throw HttpError.badRequest(`Send at least one field to update: ${UPDATABLE_FIELDS.filter((f) => f !== 'currentPassword').join(', ')}`);
  }

  const user = await authService.updateProfile(req.user!.id, input);
  res.json({ success: true, data: user });
};
