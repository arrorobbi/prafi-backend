import type { RequestHandler } from 'express';
import { HttpError } from '../errors/HttpError';
import { GUIDE_AUDIENCES, type GuideAudience } from '../models/guideSection.model';
import * as guideService from '../services/guide.service';

const body = (req: Parameters<RequestHandler>[0]) => (req.body ?? {}) as Record<string, unknown>;

/** A whole-number id from the URL (`:id`, `:stepId`). */
function intParam(value: unknown, field: string) {
  const id = Number(value);
  if (!Number.isInteger(id) || id < 1) throw HttpError.badRequest('Validasi gagal', [{ field, message: `${field} harus berupa bilangan bulat positif` }]);
  return id;
}

/** GET /api/landing/guides?audience=public|tenant — public: the Panduan topics with their steps and pictures. */
export const listPublic: RequestHandler = async (req, res) => {
  const audience = (req.query.audience ?? 'public') as GuideAudience;
  if (!GUIDE_AUDIENCES.includes(audience)) {
    throw HttpError.badRequest('Validasi gagal', [{ field: 'audience', message: `audience harus salah satu dari: ${GUIDE_AUDIENCES.join(', ')}` }]);
  }
  res.json({ success: true, data: await guideService.listPublic(audience) });
};

/** GET /api/guides — every topic for the editors. */
export const list: RequestHandler = async (_req, res) => {
  res.json({ success: true, data: await guideService.listAll(), meta: { limits: guideService.LIMITS } });
};

export const createSection: RequestHandler = async (req, res) => {
  const data = await guideService.createSection(guideService.parseSection(body(req), false), req.user!.id);
  res.status(201).json({ success: true, data });
};

export const updateSection: RequestHandler = async (req, res) => {
  const id = intParam(req.params.id, 'id');
  res.json({ success: true, data: await guideService.updateSection(id, guideService.parseSection(body(req), true), req.user!.id) });
};

export const deleteSection: RequestHandler = async (req, res) => {
  await guideService.deleteSection(intParam(req.params.id, 'id'));
  res.json({ success: true, data: null });
};

export const reorderSections: RequestHandler = async (req, res) => {
  res.json({ success: true, data: await guideService.reorderSections(body(req).ids) });
};

export const createStep: RequestHandler = async (req, res) => {
  const id = intParam(req.params.id, 'id');
  const data = await guideService.createStep(id, guideService.parseStep(body(req), false), req.user!.id);
  res.status(201).json({ success: true, data });
};

export const updateStep: RequestHandler = async (req, res) => {
  const id = intParam(req.params.id, 'id');
  const stepId = intParam(req.params.stepId, 'stepId');
  res.json({ success: true, data: await guideService.updateStep(id, stepId, guideService.parseStep(body(req), true), req.user!.id) });
};

export const deleteStep: RequestHandler = async (req, res) => {
  const id = intParam(req.params.id, 'id');
  res.json({ success: true, data: await guideService.deleteStep(id, intParam(req.params.stepId, 'stepId'), req.user!.id) });
};

export const reorderSteps: RequestHandler = async (req, res) => {
  const id = intParam(req.params.id, 'id');
  res.json({ success: true, data: await guideService.reorderSteps(id, body(req).ids, req.user!.id) });
};
