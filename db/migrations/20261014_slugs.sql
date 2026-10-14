-- 2026-10-14: readable addresses (slugs) for products, UMKM profiles and product categories, e.g.
-- /produk/brownis-prafi instead of /produk/<uuid>. Each slug is made from the name; when a product or UMKM slug is
-- taken, a number is added (brownis-prafi-1, brownis-prafi-2, ...). Old addresses with the id keep working.
--   psql -h localhost -U postgres -d prafi_db -v ON_ERROR_STOP=1 -f db/migrations/20261014_slugs.sql
BEGIN;

ALTER TABLE products ADD COLUMN slug VARCHAR(120);
ALTER TABLE tenants ADD COLUMN slug VARCHAR(120);
ALTER TABLE product_categories ADD COLUMN slug VARCHAR(120);

-- Existing rows, oldest first: the name in lower case without accents, everything that isn't a letter or digit
-- becomes "-";
-- a taken slug gets -1, -2, ... (the same rule the backend applies to new products and UMKM)
DO $$
DECLARE
  t RECORD;
  r RECORD;
  base TEXT;
  candidate TEXT;
  n INT;
BEGIN
  FOR t IN SELECT * FROM (VALUES ('products', 'produk'), ('tenants', 'umkm'), ('product_categories', 'kategori')) AS x(tbl, fallback) LOOP
    FOR r IN EXECUTE format('SELECT id::text AS id, name FROM %I ORDER BY created_at, id', t.tbl) LOOP
      base := left(trim(both '-' from regexp_replace(translate(lower(r.name), 'àáâãäåèéêëìíîïòóôõöùúûüñç', 'aaaaaaeeeeiiiiooooouuuunc'), '[^a-z0-9]+', '-', 'g')), 80);
      base := trim(both '-' from base);
      IF base = '' THEN base := t.fallback; END IF;
      candidate := base;
      n := 0;
      LOOP
        EXIT WHEN NOT (
          CASE t.tbl
            WHEN 'products' THEN EXISTS (SELECT 1 FROM products WHERE slug = candidate)
            WHEN 'tenants' THEN EXISTS (SELECT 1 FROM tenants WHERE slug = candidate)
            ELSE EXISTS (SELECT 1 FROM product_categories WHERE slug = candidate)
          END);
        n := n + 1;
        candidate := base || '-' || n;
      END LOOP;
      EXECUTE format('UPDATE %I SET slug = $1 WHERE id::text = $2', t.tbl) USING candidate, r.id;
    END LOOP;
  END LOOP;
END $$;

-- The columns stay nullable on purpose: a backend version from before slugs can still add rows after this
-- migration (they simply have no slug until they are saved again; the website then links by id). Unique where set.
-- Slugs a product or UMKM had before it was renamed: the old address keeps leading to it (the website sends the
-- visitor on to the new one), and nobody else is given that slug while it exists.
CREATE TABLE old_slugs (
  kind VARCHAR(16) NOT NULL,           -- 'product' or 'tenant'
  slug VARCHAR(120) NOT NULL,
  target_id VARCHAR(64) NOT NULL,      -- the id of the product / UMKM profile it belongs to
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (kind, slug)
);
CREATE INDEX old_slugs_target ON old_slugs (kind, target_id);

CREATE UNIQUE INDEX products_slug_key ON products (slug);
CREATE UNIQUE INDEX tenants_slug_key ON tenants (slug);
CREATE UNIQUE INDEX product_categories_slug_key ON product_categories (slug);

COMMIT;
