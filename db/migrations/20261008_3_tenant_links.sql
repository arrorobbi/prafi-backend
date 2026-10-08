-- 2026-10-08 (3): optional tenant links. Instagram becomes optional; Google Bisnis and Shopee links are new.
-- Profiles saved with an empty Instagram link get NULL (no link), so they count as complete again.
--   psql -h localhost -U postgres -d prafi_db -v ON_ERROR_STOP=1 -f db/migrations/20261008_3_tenant_links.sql
BEGIN;
ALTER TABLE tenants ALTER COLUMN instagram_link DROP NOT NULL;
UPDATE tenants SET instagram_link = NULL WHERE btrim(instagram_link) = '';
ALTER TABLE tenants ADD COLUMN google_business_link VARCHAR(255);
ALTER TABLE tenants ADD COLUMN shopee_link VARCHAR(255);
COMMIT;
