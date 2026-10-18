-- 2026-10-19: the Panduan (help pages) become editable content ("Kelola Panduan" for superadmin, disnakertrans and
-- admin): sections (topics) with numbered steps, each step with an optional desktop and mobile (HP) picture.
-- The current content is loaded afterwards by `npm run guides:seed` (only while the tables are empty).
--   psql -h localhost -U postgres -d prafi_db -v ON_ERROR_STOP=1 -f db/migrations/20261019_guides.sql
BEGIN;

CREATE TABLE guide_sections (
  id SERIAL PRIMARY KEY,
  -- The topic's anchor on /panduan (e.g. /panduan#ketentuan); set once from the title
  slug VARCHAR(80) NOT NULL UNIQUE,
  title VARCHAR(120) NOT NULL,
  summary VARCHAR(255) NOT NULL DEFAULT '',
  icon VARCHAR(32) NOT NULL DEFAULT 'docs',
  color VARCHAR(7) NOT NULL DEFAULT '#0e3c69',
  -- Where it is shown: public = /panduan, tenant = Bantuan & Ketentuan in the seller dashboard
  audience VARCHAR(16)[] NOT NULL DEFAULT '{public}',
  intro TEXT,
  outro TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  updated_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE guide_steps (
  id SERIAL PRIMARY KEY,
  section_id INTEGER NOT NULL REFERENCES guide_sections(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  image_alt VARCHAR(255),
  desktop_image_id INTEGER UNIQUE REFERENCES images(id) ON DELETE SET NULL,
  mobile_image_id INTEGER UNIQUE REFERENCES images(id) ON DELETE SET NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX guide_steps_section_order ON guide_steps (section_id, sort_order);

COMMIT;
