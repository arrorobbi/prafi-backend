-- 2026-10-08 (5): API logs keep the email given to auth endpoints (login, sign-up, forgot password…),
-- also for guests and failed attempts (wrong email / password).
--   psql -h localhost -U postgres -d prafi_db -v ON_ERROR_STOP=1 -f db/migrations/20261008_5_api_log_auth_email.sql
BEGIN;
ALTER TABLE api_logs ADD COLUMN auth_email VARCHAR(255);
COMMIT;
