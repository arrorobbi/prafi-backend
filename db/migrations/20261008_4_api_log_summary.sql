-- 2026-10-08 (4): API logs keep the names of the sent fields and a safe summary of the response.
-- From now on only create/update/delete requests are stored; older GET rows age out with LOG_RETENTION_DAYS.
--   psql -h localhost -U postgres -d prafi_db -v ON_ERROR_STOP=1 -f db/migrations/20261008_4_api_log_summary.sql
BEGIN;
ALTER TABLE api_logs ADD COLUMN request_fields JSONB;
ALTER TABLE api_logs ADD COLUMN response_summary JSONB;
COMMIT;
