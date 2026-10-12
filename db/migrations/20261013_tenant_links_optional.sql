-- 2026-10-13: every link of a UMKM profile is optional (WhatsApp, Google Maps and Facebook were required).
-- Empty values and the old "-" placeholder become NULL (no link).
--   psql -h localhost -U postgres -d prafi_db -v ON_ERROR_STOP=1 -f db/migrations/20261013_tenant_links_optional.sql
BEGIN;
ALTER TABLE tenants ALTER COLUMN fb_link DROP NOT NULL;
ALTER TABLE tenants ALTER COLUMN whatsapp_link DROP NOT NULL;
ALTER TABLE tenants ALTER COLUMN gmaps_link DROP NOT NULL;
UPDATE tenants SET fb_link = NULL WHERE btrim(fb_link) IN ('', '-');
UPDATE tenants SET whatsapp_link = NULL WHERE btrim(whatsapp_link) IN ('', '-');
UPDATE tenants SET gmaps_link = NULL WHERE btrim(gmaps_link) IN ('', '-');
COMMIT;
