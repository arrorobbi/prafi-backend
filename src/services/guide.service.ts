import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { Op, type Includeable, type Order } from 'sequelize';
import { IMAGES_DIR, IMAGES_URL_PATH } from '../config/upload';
import { HttpError } from '../errors/HttpError';
import { GuideSection, GuideStep, Image, sequelize } from '../models';
import { GUIDE_AUDIENCES, GUIDE_ICONS, type GuideAudience, type GuideIcon } from '../models/guideSection.model';
import { slugify } from '../utils/slug';
import * as imageService from './image.service';

/*
 * The Panduan (help pages) as editable content: topics (sections) with numbered steps; each step may have a picture
 * for wide screens and one for phones. Pictures that are replaced, or whose step or topic is deleted, are deleted
 * from the disk too (image.service removeReplaced).
 */

export const LIMITS = { title: 120, summary: 255, text: 5000, body: 3000, imageAlt: 255 } as const;

type FieldError = { field: string; message: string };

const STEP_IMAGES: Includeable[] = [
  { association: 'desktopImage', attributes: ['id', 'imgUrl', 'url', 'altText'] },
  { association: 'mobileImage', attributes: ['id', 'imgUrl', 'url', 'altText'] },
];
const ORDER: Order = [
  ['sortOrder', 'ASC'],
  ['id', 'ASC'],
  [{ model: GuideStep, as: 'steps' }, 'sortOrder', 'ASC'],
  [{ model: GuideStep, as: 'steps' }, 'id', 'ASC'],
];

// ---------- reading ----------

/** GET /api/landing/guides?audience= — the topics shown on /panduan (public) or in the seller's Bantuan (tenant). */
export async function listPublic(audience: GuideAudience) {
  const sections = await GuideSection.findAll({
    where: { audience: { [Op.contains]: [audience] } },
    attributes: ['id', 'slug', 'title', 'summary', 'icon', 'color', 'audience', 'intro', 'outro', 'sortOrder', 'updatedAt'],
    include: [{ association: 'steps', attributes: ['id', 'body', 'imageAlt', 'sortOrder', 'desktopImageId', 'mobileImageId'], include: STEP_IMAGES }],
    order: ORDER,
  });
  return sections;
}

const withSteps = (): Includeable[] => [
  { association: 'steps', include: STEP_IMAGES },
  { association: 'editor', attributes: ['id', 'firstName', 'lastName', 'role'] },
];

/** GET /api/guides — every topic for the editors, with who changed it last. */
export async function listAll() {
  return GuideSection.findAll({ include: withSteps(), order: ORDER });
}

async function findSection(id: number) {
  const section = await GuideSection.findByPk(id);
  if (!section) throw HttpError.notFound('Bagian panduan tidak ditemukan');
  return section;
}

async function fresh(id: number) {
  return (await GuideSection.findByPk(id, { include: withSteps(), order: ORDER }))!;
}

/** Marks the topic as changed by this user (also when only a step changed). */
async function touch(section: GuideSection, userId: string) {
  section.set('updatedBy', userId);
  section.changed('updatedAt', true);
  await section.save();
}

// ---------- validation ----------

const text = (body: Record<string, unknown>, field: string, max: number, errors: FieldError[], { required = false } = {}) => {
  const raw = body[field];
  if (raw === undefined) {
    if (required) errors.push({ field, message: `${field} wajib diisi` });
    return undefined;
  }
  if (raw !== null && typeof raw !== 'string') {
    errors.push({ field, message: `${field} harus berupa teks` });
    return undefined;
  }
  // Normal line endings, no trailing spaces, at most one empty line in a row
  const value = (raw ?? '').replace(/\r\n?/g, '\n').replace(/[ \t]+$/gm, '').replace(/\n{3,}/g, '\n\n').trim();
  if (required && !value) errors.push({ field, message: `${field} wajib diisi` });
  else if (value.length > max) errors.push({ field, message: `${field} maksimal ${max} karakter (saat ini ${value.length})` });
  return value;
};

export interface SectionInput {
  title?: string;
  summary?: string;
  icon?: GuideIcon;
  color?: string;
  audience?: GuideAudience[];
  intro?: string | null;
  outro?: string | null;
}

/** Body of POST / PATCH /api/guides. `partial`: only the fields that were sent (PATCH). */
export function parseSection(body: Record<string, unknown>, partial: boolean): SectionInput {
  const errors: FieldError[] = [];
  const allowed = ['title', 'summary', 'icon', 'color', 'audience', 'intro', 'outro'];
  for (const k of Object.keys(body)) if (!allowed.includes(k)) errors.push({ field: k, message: `${k} bukan field yang dapat diubah` });

  const input: SectionInput = {};
  const title = text(body, 'title', LIMITS.title, errors, { required: !partial });
  if (title !== undefined) input.title = title;
  const summary = text(body, 'summary', LIMITS.summary, errors);
  if (summary !== undefined) input.summary = summary;
  for (const f of ['intro', 'outro'] as const) {
    const v = text(body, f, LIMITS.text, errors);
    if (v !== undefined) input[f] = v || null;
  }
  if (body.icon !== undefined) {
    if (!GUIDE_ICONS.includes(body.icon as GuideIcon)) errors.push({ field: 'icon', message: `icon harus salah satu dari: ${GUIDE_ICONS.join(', ')}` });
    else input.icon = body.icon as GuideIcon;
  }
  if (body.color !== undefined) {
    if (typeof body.color !== 'string' || !/^#[0-9a-f]{6}$/i.test(body.color)) errors.push({ field: 'color', message: 'color harus berupa warna hex, mis. #ea7b25' });
    else input.color = body.color.toLowerCase();
  }
  if (body.audience !== undefined) {
    const list = Array.isArray(body.audience) ? [...new Set(body.audience)] : null;
    if (!list || !list.length || list.some((a) => !GUIDE_AUDIENCES.includes(a as GuideAudience))) {
      errors.push({ field: 'audience', message: `audience harus berisi minimal satu dari: ${GUIDE_AUDIENCES.join(', ')}` });
    } else input.audience = list as GuideAudience[];
  }
  if (errors.length) throw HttpError.badRequest('Validasi gagal', errors);
  return input;
}

export interface StepInput {
  body?: string;
  imageAlt?: string | null;
  desktopImageId?: number | null;
  mobileImageId?: number | null;
}

/** Body of POST / PATCH .../steps. Image ids: an uploaded image (POST /api/images), or null to remove the picture. */
export function parseStep(body: Record<string, unknown>, partial: boolean): StepInput {
  const errors: FieldError[] = [];
  const allowed = ['body', 'imageAlt', 'desktopImageId', 'mobileImageId'];
  for (const k of Object.keys(body)) if (!allowed.includes(k)) errors.push({ field: k, message: `${k} bukan field yang dapat diubah` });

  const input: StepInput = {};
  const stepBody = text(body, 'body', LIMITS.body, errors, { required: !partial });
  if (stepBody !== undefined) input.body = stepBody;
  const alt = text(body, 'imageAlt', LIMITS.imageAlt, errors);
  if (alt !== undefined) input.imageAlt = alt || null;
  for (const f of ['desktopImageId', 'mobileImageId'] as const) {
    const v = body[f];
    if (v === undefined) continue;
    if (v !== null && !(Number.isInteger(v) && (v as number) > 0)) errors.push({ field: f, message: `${f} harus berupa id gambar atau null` });
    else input[f] = v as number | null;
  }
  if (input.desktopImageId && input.desktopImageId === input.mobileImageId) {
    errors.push({ field: 'mobileImageId', message: 'Gambar desktop dan HP harus berupa unggahan yang berbeda' });
  }
  if (errors.length) throw HttpError.badRequest('Validasi gagal', errors);
  return input;
}

/** The image exists and nothing else uses it (this step itself may already use it). */
async function assertUsableImage(field: string, imageId: number | null | undefined, step?: GuideStep) {
  if (imageId == null) return;
  if (!(await Image.findByPk(imageId, { attributes: ['id'] }))) {
    throw HttpError.badRequest('Validasi gagal', [{ field, message: 'Gambar tidak ditemukan, unggah terlebih dahulu melalui POST /api/images' }]);
  }
  const ownImage = step && (step.desktopImageId === imageId || step.mobileImageId === imageId);
  if (!ownImage && (await imageService.isInUse(imageId))) {
    throw HttpError.badRequest('Validasi gagal', [{ field, message: 'Gambar sudah dipakai di tempat lain, unggah gambar baru' }]);
  }
}

// ---------- sections ----------

async function uniqueSlug(title: string) {
  const base = slugify(title, 'panduan');
  for (let n = 1; ; n++) {
    const slug = n === 1 ? base : `${base.slice(0, 76)}-${n}`;
    if (!(await GuideSection.findOne({ where: { slug }, attributes: ['id'] }))) return slug;
  }
}

/** POST /api/guides — a new topic, added at the end. */
export async function createSection(input: SectionInput, userId: string) {
  const last = (await GuideSection.max<number, GuideSection>('sortOrder')) ?? -1;
  const section = await GuideSection.create({
    title: input.title!,
    summary: input.summary ?? '',
    icon: input.icon ?? 'docs',
    color: input.color ?? '#0e3c69',
    audience: input.audience ?? ['public'],
    intro: input.intro ?? null,
    outro: input.outro ?? null,
    slug: await uniqueSlug(input.title!),
    sortOrder: last + 1,
    updatedBy: userId,
  });
  return fresh(section.id);
}

/** PATCH /api/guides/:id — the slug (the /panduan#anchor) stays, so links to the topic keep working. */
export async function updateSection(id: number, changes: SectionInput, userId: string) {
  const section = await findSection(id);
  await section.update({ ...changes, updatedBy: userId });
  return fresh(id);
}

/** Every picture of these steps (to delete from the disk once the steps are gone). */
const imagesOf = (steps: GuideStep[]) => steps.flatMap((s) => [s.desktopImageId, s.mobileImageId]).filter((v): v is number => v != null);

/** DELETE /api/guides/:id — the topic, its steps and their pictures (files too). */
export async function deleteSection(id: number) {
  const section = await findSection(id);
  const steps = await GuideStep.findAll({ where: { sectionId: id }, attributes: ['id', 'desktopImageId', 'mobileImageId'] });
  await sequelize.transaction(async (transaction) => {
    await GuideStep.destroy({ where: { sectionId: id }, transaction });
    await section.destroy({ transaction });
  });
  for (const imageId of imagesOf(steps)) await imageService.removeReplaced(imageId, null);
}

/** `ids` must be exactly the current ones, in the new order. */
function assertSameIds(given: unknown, current: number[], what: string) {
  const ids = Array.isArray(given) ? given : null;
  const ok = ids && ids.length === current.length && ids.every((v) => Number.isInteger(v)) && new Set(ids).size === ids.length && ids.every((v) => current.includes(v as number));
  if (!ok) throw HttpError.badRequest('Validasi gagal', [{ field: 'ids', message: `ids harus berisi semua id ${what} (${current.length}) tepat satu kali, dalam urutan baru` }]);
  return ids as number[];
}

/** PATCH /api/guides/order { ids } — the topics in their new order. */
export async function reorderSections(given: unknown) {
  const current = (await GuideSection.findAll({ attributes: ['id'] })).map((s) => s.id);
  const ids = assertSameIds(given, current, 'bagian panduan');
  await sequelize.transaction(async (transaction) => {
    for (const [i, id] of ids.entries()) await GuideSection.update({ sortOrder: i }, { where: { id }, transaction });
  });
  return listAll();
}

// ---------- steps ----------

async function findStep(sectionId: number, stepId: number) {
  const step = await GuideStep.findOne({ where: { id: stepId, sectionId } });
  if (!step) throw HttpError.notFound('Langkah panduan tidak ditemukan');
  return step;
}

/** POST /api/guides/:id/steps — a new step at the end of the topic. */
export async function createStep(sectionId: number, input: StepInput, userId: string) {
  const section = await findSection(sectionId);
  await assertUsableImage('desktopImageId', input.desktopImageId);
  await assertUsableImage('mobileImageId', input.mobileImageId);
  const last = (await GuideStep.max<number, GuideStep>('sortOrder', { where: { sectionId } })) ?? -1;
  await GuideStep.create({
    sectionId,
    body: input.body!,
    imageAlt: input.imageAlt ?? null,
    desktopImageId: input.desktopImageId ?? null,
    mobileImageId: input.mobileImageId ?? null,
    sortOrder: last + 1,
  });
  await touch(section, userId);
  return fresh(sectionId);
}

/** PATCH /api/guides/:id/steps/:stepId — a replaced or removed picture is deleted (record and file). */
export async function updateStep(sectionId: number, stepId: number, changes: StepInput, userId: string) {
  const section = await findSection(sectionId);
  const step = await findStep(sectionId, stepId);
  await assertUsableImage('desktopImageId', changes.desktopImageId, step);
  await assertUsableImage('mobileImageId', changes.mobileImageId, step);
  const old = { desktop: step.desktopImageId, mobile: step.mobileImageId };
  await step.update(changes);
  if (changes.desktopImageId !== undefined) await imageService.removeReplaced(old.desktop, changes.desktopImageId);
  if (changes.mobileImageId !== undefined) await imageService.removeReplaced(old.mobile, changes.mobileImageId);
  await touch(section, userId);
  return fresh(sectionId);
}

/** DELETE /api/guides/:id/steps/:stepId — the step and its pictures (files too). */
export async function deleteStep(sectionId: number, stepId: number, userId: string) {
  const section = await findSection(sectionId);
  const step = await findStep(sectionId, stepId);
  await step.destroy();
  for (const imageId of imagesOf([step])) await imageService.removeReplaced(imageId, null);
  await touch(section, userId);
  return fresh(sectionId);
}

/** PATCH /api/guides/:id/steps/order { ids } — the topic's steps in their new order. */
export async function reorderSteps(sectionId: number, given: unknown, userId: string) {
  const section = await findSection(sectionId);
  const current = (await GuideStep.findAll({ where: { sectionId }, attributes: ['id'] })).map((s) => s.id);
  const ids = assertSameIds(given, current, 'langkah');
  await sequelize.transaction(async (transaction) => {
    for (const [i, id] of ids.entries()) await GuideStep.update({ sortOrder: i }, { where: { id }, transaction });
  });
  await touch(section, userId);
  return fresh(sectionId);
}

// ---------- default content ----------

export interface SeedSection {
  slug: string;
  title: string;
  summary: string;
  icon: GuideIcon;
  color: string;
  audience: GuideAudience[];
  intro?: string;
  outro?: string;
  steps?: { body: string; image?: string; alt?: string }[];
}

/**
 * Loads the default Panduan (db/seeds/guides.json) while the tables are empty. Each screenshot (`image`, a file
 * in `imagesDir` without .jpg) is copied into images/ as an uploaded image, so it can be replaced and deleted like any
 * other. Returns null when there was content already.
 */
export async function seedDefaults(sections: SeedSection[], imagesDir: string) {
  if ((await GuideSection.count()) > 0) return null;
  let steps = 0;
  const copied: string[] = [];
  const missing: string[] = [];
  try {
    await sequelize.transaction(async (transaction) => {
      for (const [i, s] of sections.entries()) {
        const section = await GuideSection.create(
          { slug: s.slug, title: s.title, summary: s.summary, icon: s.icon, color: s.color, audience: s.audience, intro: s.intro ?? null, outro: s.outro ?? null, sortOrder: i },
          { transaction },
        );
        for (const [j, st] of (s.steps ?? []).entries()) {
          let desktopImageId: number | null = null;
          if (st.image) {
            const source = path.join(imagesDir, `${st.image}.jpg`);
            try {
              const file = `${randomUUID()}.jpg`;
              await fs.copyFile(source, path.join(IMAGES_DIR, file));
              copied.push(file);
              const image = await Image.create(
                { name: `${st.image}.jpg`, imgUrl: `${IMAGES_URL_PATH}/${file}`, altText: st.alt ?? s.title, uploaderId: null },
                { transaction },
              );
              desktopImageId = image.id;
            } catch {
              missing.push(source);
            }
          }
          await GuideStep.create(
            { sectionId: section.id, body: st.body, imageAlt: st.alt ?? null, desktopImageId, mobileImageId: null, sortOrder: j },
            { transaction },
          );
          steps++;
        }
      }
    });
  } catch (err) {
    // Nothing was saved: the copied files go too
    for (const f of copied) await fs.unlink(path.join(IMAGES_DIR, f)).catch(() => {});
    throw err;
  }
  return { sections: sections.length, steps, images: copied.length, missing };
}
