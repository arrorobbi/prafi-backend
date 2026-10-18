-- 2026-10-18: texts of the public site that admins and disnakertrans edit ("Konten Situs", e.g. the footer's about
-- text) in a small key/value table site_settings (also holds the bounce check's last read inbox message), and a note
-- on users whose emails did not arrive (email_issue: not_found, mailbox_full, rejected, delayed, send_failed).
--   psql -h localhost -U postgres -d prafi_db -v ON_ERROR_STOP=1 -f db/migrations/20261018_site_content_email_issues.sql
-- 2026-10-18:
--  * site_settings: texts of the website that admins and disnakertrans edit (Konten Situs), e.g. the footer's
--    "about" paragraph; also small values the backend keeps for itself (where the bounce check stopped reading).
--  * users.email_issue*: the last delivery problem of the account's email address: a bounce reply in the site's
--    mailbox (address not found, mailbox full, …) or an error while sending. Cleared when the address is verified
--    or changed.
--   psql -h localhost -U postgres -d prafi_db -v ON_ERROR_STOP=1 -f db/migrations/20261018_site_content_email_issues.sql
BEGIN;

CREATE TABLE site_settings (
  key VARCHAR(64) PRIMARY KEY,
  value TEXT NOT NULL,
  updated_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE users ADD COLUMN email_issue VARCHAR(32);
ALTER TABLE users ADD COLUMN email_issue_detail TEXT;
ALTER TABLE users ADD COLUMN email_issue_at TIMESTAMPTZ;

COMMIT;
