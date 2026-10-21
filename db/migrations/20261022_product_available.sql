-- 2026-10-22: a seller marks a product "Tersedia" (available) or "Stok Kosong" (out of stock). Out-of-stock products
-- are hidden from the public pages until they are available again. Every existing product starts available.
--   psql -h localhost -U postgres -d prafi_db -v ON_ERROR_STOP=1 -f db/migrations/20261022_product_available.sql
BEGIN;
ALTER TABLE products ADD COLUMN is_available BOOLEAN NOT NULL DEFAULT true;
COMMIT;
