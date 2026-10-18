import { HttpError } from '../errors/HttpError';
import { SiteSetting, User } from '../models';

/** Texts of the public site that admins and disnakertrans can edit (menu "Konten Situs"). */
export const SITE_CONTENT = {
  footerAbout: {
    key: 'footer_about',
    maxLength: 1500,
    // What the footer said before it could be edited; shown until someone saves a text
    default:
      '**UMKM TRANS NIAGA** dibangun dari semangat gotong royong untuk memajukan perekonomian lokal. ' +
      'Sebagai direktori dan marketplace UMKM di Prafi, Manokwari, platform ini dirancang untuk membina serta ' +
      'memperluas jangkauan pasar para pelaku usaha daerah. Melalui Trans Niaga, beli produk lokal kini jadi lebih ' +
      'praktis, sekaligus menjadi bentuk nyata dukungan kita terhadap kemajuan UMKM Prafi.',
  },
} as const;

export type SiteContentField = keyof typeof SITE_CONTENT;
const FIELDS = Object.keys(SITE_CONTENT) as SiteContentField[];

/** A stored setting, or null when it was never saved. */
export async function getSetting(key: string) {
  return (await SiteSetting.findByPk(key))?.value ?? null;
}

export async function setSetting(key: string, value: string, updatedBy: string | null = null) {
  await SiteSetting.upsert({ key, value, updatedBy });
}

/** GET /api/landing/site — the editable texts, each falling back to its default. */
export async function getPublic() {
  const rows = await SiteSetting.findAll({ where: { key: FIELDS.map((f) => SITE_CONTENT[f].key) } });
  const byKey = new Map(rows.map((r) => [r.key, r.value]));
  return Object.fromEntries(FIELDS.map((f) => [f, byKey.get(SITE_CONTENT[f].key) ?? SITE_CONTENT[f].default])) as Record<
    SiteContentField,
    string
  >;
}

/** GET /api/site-content — the texts plus, per text, its default and when / by whom it was last saved. */
export async function getForEditor() {
  const rows = await SiteSetting.findAll({
    where: { key: FIELDS.map((f) => SITE_CONTENT[f].key) },
    include: [{ model: User, as: 'editor', attributes: ['id', 'firstName', 'lastName', 'role'] }],
  });
  const byKey = new Map(rows.map((r) => [r.key, r]));
  return Object.fromEntries(
    FIELDS.map((f) => {
      const row = byKey.get(SITE_CONTENT[f].key);
      const editor = (row as (SiteSetting & { editor?: User | null }) | undefined)?.editor;
      return [
        f,
        {
          value: row?.value ?? SITE_CONTENT[f].default,
          default: SITE_CONTENT[f].default,
          maxLength: SITE_CONTENT[f].maxLength,
          isDefault: !row,
          updatedAt: row?.updatedAt ?? null,
          updatedBy: editor ? { id: editor.id, name: `${editor.firstName} ${editor.lastName}`.trim(), role: editor.role } : null,
        },
      ];
    }),
  );
}

/** PATCH /api/site-content — saves the given texts; an empty text (or `null`) goes back to the default. */
export async function update(input: Record<string, unknown>, userId: string) {
  const errors: { field: string; message: string }[] = [];
  const unknown = Object.keys(input).filter((k) => !FIELDS.includes(k as SiteContentField));
  for (const k of unknown) errors.push({ field: k, message: `Kolom tidak dikenal (pilihan: ${FIELDS.join(', ')})` });
  const given = FIELDS.filter((f) => f in input);
  if (!given.length && !unknown.length) errors.push({ field: 'footerAbout', message: 'Isi minimal satu teks' });

  const values: Partial<Record<SiteContentField, string | null>> = {};
  for (const f of given) {
    const raw = input[f];
    if (raw !== null && typeof raw !== 'string') {
      errors.push({ field: f, message: `${f} harus berupa teks` });
      continue;
    }
    // Normal line endings, no trailing spaces, at most one empty line between paragraphs
    const text = (raw ?? '').replace(/\r\n?/g, '\n').replace(/[ \t]+$/gm, '').replace(/\n{3,}/g, '\n\n').trim();
    if (text.length > SITE_CONTENT[f].maxLength) {
      errors.push({ field: f, message: `${f} maksimal ${SITE_CONTENT[f].maxLength} karakter (saat ini ${text.length})` });
      continue;
    }
    values[f] = text || null;
  }
  if (errors.length) throw HttpError.badRequest('Validasi gagal', errors);

  for (const f of given) {
    const value = values[f];
    if (value == null) await SiteSetting.destroy({ where: { key: SITE_CONTENT[f].key } });
    else await setSetting(SITE_CONTENT[f].key, value, userId);
  }
  return getForEditor();
}
