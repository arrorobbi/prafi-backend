-- 2026-10-08: product price + recommended flag, tenant Instagram link, product reviews.
-- Matches the Sequelize models; run once on an existing database (a fresh `npm run db:sync` already has all of it).
--   psql -h localhost -U postgres -d prafi_db -v ON_ERROR_STOP=1 -f db/migrations/20261008_price_instagram_reviews.sql
BEGIN;

-- Tenant profile: Instagram link (required). Existing profiles get '' and count as incomplete until filled in.
ALTER TABLE tenants ADD COLUMN instagram_link VARCHAR(255) NOT NULL DEFAULT '';
ALTER TABLE tenants ALTER COLUMN instagram_link DROP DEFAULT;

-- Products: price in rupiah replaces qty. Existing products start at 0 until their owner sets a price.
ALTER TABLE products ADD COLUMN price INTEGER NOT NULL DEFAULT 0;
ALTER TABLE products ALTER COLUMN price DROP DEFAULT;
ALTER TABLE products ADD COLUMN is_recommended BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE products DROP COLUMN qty;

-- Reviews: many per product, deleted with their product
CREATE TABLE reviews (
  id SERIAL PRIMARY KEY,
  product_id UUID NOT NULL REFERENCES products (id) ON DELETE CASCADE ON UPDATE CASCADE,
  name VARCHAR(100) NOT NULL,
  stars INTEGER NOT NULL,
  review TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE,
  updated_at TIMESTAMP WITH TIME ZONE
);
CREATE INDEX reviews_product_id ON reviews (product_id);

COMMIT;
