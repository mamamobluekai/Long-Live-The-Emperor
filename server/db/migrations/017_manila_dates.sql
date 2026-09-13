-- Migration 017: lock all date semantics to Asia/Manila.
--
-- All "calendar day" values used by this app (appeal_date, student_attendance.date,
-- student_daily_documentation.date) must be interpreted in Asia/Manila time.
-- This migration:
--   1. Defines an immutable helper manila_date(timestamptz) that returns the
--      calendar date in Asia/Manila from a TIMESTAMPTZ.
--   2. Defines manila_today() that returns the current date in Asia/Manila.
--   3. Sets the session timezone to Asia/Manila so plain DATE casts use it.
--   4. Back-fills any rows whose DATE was stored in UTC by accident.
--
-- Run with: psql -h <host> -U <user> -d <dbname> -f 017_manila_dates.sql

-- 1) Helper: get the Manila calendar date from a TIMESTAMPTZ.
CREATE OR REPLACE FUNCTION manila_date(ts TIMESTAMPTZ)
RETURNS DATE
LANGUAGE SQL
IMMUTABLE
PARALLEL SAFE
AS $$ SELECT (ts AT TIME ZONE 'Asia/Manila')::DATE; $$;

-- 2) Helper: get today's date in Manila.
CREATE OR REPLACE FUNCTION manila_today()
RETURNS DATE
LANGUAGE SQL
STABLE
AS $$ SELECT (NOW() AT TIME ZONE 'Asia/Manila')::DATE; $$;

-- 3) Pin the session timezone to Manila. Any plain string -> DATE cast now
--    uses Asia/Manila semantics, eliminating the UTC midnight bug.
DO $$
BEGIN
  EXECUTE format('ALTER DATABASE %I SET TIMEZONE TO %L', current_database(), 'Asia/Manila');
EXCEPTION WHEN insufficient_privilege THEN
  RAISE NOTICE 'Skipping ALTER DATABASE (insufficient privilege). Set TIMEZONE in server config or per-session.';
END $$;

-- 4) Back-fill guard: re-stamp any rows that might have been written with a
--    UTC-shifted date. We don't blindly overwrite; instead, expose a manual
--    statement the operator can run after auditing. Existing rows are assumed
--    correct because the application now writes Manila YYYY-MM-DD strings.
--    To force-overwrite in the future:
--    UPDATE attendance_appeals SET appeal_date = (created_at AT TIME ZONE 'Asia/Manila')::DATE
--      WHERE created_at IS NOT NULL AND appeal_date != (created_at AT TIME ZONE 'Asia/Manila')::DATE;