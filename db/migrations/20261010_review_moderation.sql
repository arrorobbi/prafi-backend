-- 2026-10-10: guarding reviews.
--   * moderation: a seller reports a review of their product, an admin or disnakertrans hides it or keeps it;
--     hidden reviews stay in the table but no longer show or count in ratings
--   * duplicate guard: who posted (browser id from the page + a hash of the IP, never the IP itself)
--   * recommendation now needs at least 3 visible reviews (and an average of 4.8 or more)
-- Matches the Sequelize models; run once on an existing database (a fresh `npm run db:sync` already has all of it).
--   psql -h localhost -U postgres -d prafi_db -v ON_ERROR_STOP=1 -f db/migrations/20261010_review_moderation.sql
BEGIN;

ALTER TABLE reviews
  ADD COLUMN client_id VARCHAR(64),
  ADD COLUMN ip_hash VARCHAR(64),
  ADD COLUMN is_hidden BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN report_status VARCHAR(10),
  ADD COLUMN report_reason TEXT,
  ADD COLUMN reported_at TIMESTAMP WITH TIME ZONE,
  ADD COLUMN reported_by UUID REFERENCES users (id) ON DELETE SET NULL ON UPDATE CASCADE,
  ADD COLUMN moderated_at TIMESTAMP WITH TIME ZONE,
  ADD COLUMN moderated_by UUID REFERENCES users (id) ON DELETE SET NULL ON UPDATE CASCADE,
  ADD COLUMN moderation_note TEXT,
  ADD CONSTRAINT reviews_report_status_check CHECK (report_status IN ('pending', 'kept', 'hidden'));

-- The once-a-day check and the per-IP rate limit look reviews up by these
CREATE INDEX reviews_ip_hash_created_at ON reviews (ip_hash, created_at);
CREATE INDEX reviews_report_status ON reviews (report_status) WHERE report_status IS NOT NULL;

-- Recommendation under the new rule: at least 3 visible reviews and an average (1 decimal) of 4.8 or more
UPDATE products p SET is_recommended = COALESCE(
  (SELECT COUNT(*) >= 3 AND ROUND(AVG(r.stars)::numeric, 1) >= 4.8 FROM reviews r WHERE r.product_id = p.id AND NOT r.is_hidden),
  false
);

COMMIT;
