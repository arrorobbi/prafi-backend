-- 2026-10-08 (2): who uploaded each image, so users can throw away their own unsaved uploads.
-- Existing images get NULL (no uploader): they can only change through their product / profile / account.
--   psql -h localhost -U postgres -d prafi_db -v ON_ERROR_STOP=1 -f db/migrations/20261008_2_image_uploader.sql
BEGIN;
ALTER TABLE images ADD COLUMN uploader_id UUID REFERENCES users (id) ON DELETE SET NULL ON UPDATE CASCADE;
COMMIT;
