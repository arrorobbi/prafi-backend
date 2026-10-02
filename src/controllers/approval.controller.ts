import type { RequestHandler } from 'express';
import { ALL_ROLES, type Role } from '../constants/roles';
import { HttpError } from '../errors/HttpError';
import { APPROVAL_TYPES, type ApprovalType } from '../services/approval.service';
import * as approvalService from '../services/approval.service';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_REASON_LENGTH = 255;

/** Accepts singular or plural: user/users, product/products. */
function parseType(value: unknown): ApprovalType | null {
  if (typeof value !== 'string') return null;
  const singular = value.trim().toLowerCase().replace(/s$/, '');
  return (APPROVAL_TYPES as readonly string[]).includes(singular) ? (singular as ApprovalType) : null;
}

/**
 * PATCH /api/approvals/:id?type=user|product
 * Body: { "isActive": true|false, "reason"?: string, "role": string (required when type=user) }
 */
export const setApproval: RequestHandler = async (req, res) => {
  const type = parseType(req.query.type);
  const id = String(req.params.id);
  const { isActive, reason, role } = (req.body ?? {}) as { isActive?: unknown; reason?: unknown; role?: unknown };

  const errors: { field: string; message: string }[] = [];
  if (!type) {
    errors.push({ field: 'type', message: `parameter query type harus salah satu dari: ${APPROVAL_TYPES.join(', ')}` });
  }
  if (!UUID_RE.test(id)) errors.push({ field: 'id', message: 'id harus berupa UUID yang valid' });
  if (typeof isActive !== 'boolean') errors.push({ field: 'isActive', message: 'isActive harus bernilai true atau false' });
  if (reason !== undefined && (typeof reason !== 'string' || !reason.trim() || reason.length > MAX_REASON_LENGTH)) {
    errors.push({ field: 'reason', message: `reason harus berupa teks yang tidak kosong, maksimal ${MAX_REASON_LENGTH} karakter` });
  }
  // type=user: `role` confirms which kind of account is being activated; it must match the user's actual role
  if (type === 'user' && !ALL_ROLES.includes(role as Role)) {
    errors.push({ field: 'role', message: `role wajib diisi untuk type=user dan harus salah satu dari: ${ALL_ROLES.join(', ')}` });
  }
  if (type === 'product' && role !== undefined) {
    errors.push({ field: 'role', message: 'role hanya digunakan untuk type=user' });
  }
  if (errors.length) throw HttpError.badRequest('Validasi gagal', errors);

  const result = await approvalService.setApproval(req.user!, type!, id, {
    isActive: isActive as boolean,
    reason: typeof reason === 'string' ? reason.trim() : undefined,
    role: type === 'user' ? (role as Role) : undefined,
  });
  res.json({ success: true, data: result });
};
