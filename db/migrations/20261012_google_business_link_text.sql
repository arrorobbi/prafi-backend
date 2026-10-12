-- 2026-10-12: the Google Bisnis link of a UMKM profile can be far longer than 255 characters: VARCHAR(255) → TEXT.
-- Existing values are kept as they are.
--   psql -h localhost -U postgres -d prafi_db -v ON_ERROR_STOP=1 -f db/migrations/20261012_google_business_link_text.sql
ALTER TABLE tenants ALTER COLUMN google_business_link TYPE TEXT;
