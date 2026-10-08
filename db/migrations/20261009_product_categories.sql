-- 2026-10-09: tenant categories become product categories (with an image for the home page carousel).
--   * tenant_categories is renamed to product_categories (ids and names are kept) and gets image_id
--   * products get category_id; existing products take the category their UMKM profile had
--   * tenants lose tenant_category_id (the category is now chosen per product)
--   * products.is_recommended is now set by the server: reviews average (1 decimal) of 4.8 stars or more
-- Matches the Sequelize models; run once on an existing database (a fresh `npm run db:sync` already has all of it).
--   psql -h localhost -U postgres -d prafi_db -v ON_ERROR_STOP=1 -f db/migrations/20261009_product_categories.sql
BEGIN;

ALTER TABLE tenant_categories RENAME TO product_categories;
ALTER SEQUENCE tenant_categories_id_seq RENAME TO product_categories_id_seq;
ALTER TABLE product_categories RENAME CONSTRAINT tenant_categories_pkey TO product_categories_pkey;
ALTER TABLE product_categories RENAME CONSTRAINT tenant_categories_name_key TO product_categories_name_key;

-- Optional image (the carousel); deleting the image only clears it
ALTER TABLE product_categories
  ADD COLUMN image_id INTEGER UNIQUE REFERENCES images (id) ON DELETE SET NULL ON UPDATE CASCADE;

-- Products: one category each (null only for products whose owner had no UMKM profile)
ALTER TABLE products
  ADD COLUMN category_id INTEGER REFERENCES product_categories (id) ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX products_category_id ON products (category_id);
UPDATE products p SET category_id = t.tenant_category_id FROM tenants t WHERE t.user_id = p.tenant_id;

ALTER TABLE tenants DROP COLUMN tenant_category_id;

-- Recommendation follows the reviews from now on (the tenant's own checkbox is gone)
UPDATE products p SET is_recommended = COALESCE(
  (SELECT ROUND(AVG(r.stars)::numeric, 1) FROM reviews r WHERE r.product_id = p.id) >= 4.8,
  false
);

COMMIT;
