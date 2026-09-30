-- Migration 023: Philippine holidays + supervisor-blocked immersion dates.
--
-- Two new tables:
--   1. ph_holidays - Philippine non-working days. Seeded with the regular
--      annual holidays; the coordinator can add proclaimed special (often
--      "moved") dates and edit/delete any row each year.
--   2. work_immersion_blocked_dates - dates a supervisor blocks for a batch
--      (e.g. a school event) so they are not counted as immersion days, even
--      when they fall on a Mon-Fri.
--
-- Both are skipped by the shared day builder in server/utils/immersionDays.js,
-- which every role (supervisor, teacher, student) now uses, so day numbers
-- agree across all views.
--
-- Run with: psql -h <host> -U <user> -d <dbname> -f 023_holidays_blocked_dates.sql

-- ---------------------------------------------------------------------------
-- 1) Philippine holidays
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ph_holidays (
  id SERIAL PRIMARY KEY,
  holiday_date DATE NOT NULL,
  name VARCHAR(120) NOT NULL,
  -- true = regular annual holiday, false = one-off special/non-working day
  is_regular BOOLEAN NOT NULL DEFAULT FALSE,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- One holiday per date; re-running the migration is safe.
CREATE UNIQUE INDEX IF NOT EXISTS ux_ph_holidays_date ON ph_holidays (holiday_date);
CREATE INDEX IF NOT EXISTS idx_ph_holidays_date ON ph_holidays (holiday_date);

-- ---------------------------------------------------------------------------
-- 2) Supervisor-blocked dates
-- ---------------------------------------------------------------------------
-- Keyed to the same (teacher_batch_id, supervisor_id) pair the schedule itself
-- uses (work_immersion_schedules). supervisor_id NULL means the block applies
-- to the whole batch. A date blocked for the batch applies to every supervisor
-- in it; a date blocked for one supervisor applies only to them.
CREATE TABLE IF NOT EXISTS work_immersion_blocked_dates (
  id SERIAL PRIMARY KEY,
  teacher_batch_id INTEGER NOT NULL REFERENCES teacher_batches(id) ON DELETE CASCADE,
  supervisor_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  blocked_date DATE NOT NULL,
  reason VARCHAR(200),
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Postgres treats NULLs as distinct in unique indexes, so enforce one row per
-- (batch, supervisor, date) in code instead, using IS NOT DISTINCT FROM.
CREATE UNIQUE INDEX IF NOT EXISTS ux_immersion_blocked_unique
  ON work_immersion_blocked_dates (teacher_batch_id, supervisor_id, blocked_date)
  WHERE supervisor_id IS NOT NULL;

-- Batch-wide blocks (supervisor_id IS NULL) are the common case and need their
-- own partial unique index for the same reason.
CREATE UNIQUE INDEX IF NOT EXISTS ux_immersion_blocked_batch_null
  ON work_immersion_blocked_dates (teacher_batch_id, blocked_date)
  WHERE supervisor_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_immersion_blocked_batch
  ON work_immersion_blocked_dates (teacher_batch_id, blocked_date);

-- ---------------------------------------------------------------------------
-- 3) Seed Philippine holidays
-- ---------------------------------------------------------------------------
-- Scope: only dates that are FIXED BY LAW are seeded, so they are correct in
-- any year without guessing:
--   Regular (RA 9492, as amended by RA 9849): New Year's Day (Jan 1),
--   Araw ng Kagitingan (Apr 9), Labor Day (May 1), Independence Day (Jun 12),
--   National Heroes Day (last Monday of August), Bonifacio Day (Nov 30),
--   Christmas Day (Dec 25), Rizal Day (Dec 30).
--   Special non-working days that happen to be fixed: Ninoy Aquino Day (Aug 21)
--   and New Year's Eve (Dec 31) - marked is_regular = false.
--
-- Deliberately NOT seeded, because their real dates are proclaimed each year
-- and guessing them would silently shift every student's immersion schedule:
--   - Holy Week (Maundy Thursday, Good Friday, Black Saturday)
--   - Eid'l Fitr and Eid'l Adha
--   - All Saints Day / All Souls Day (Nov 1-2, NOT holidays under RA 9492)
--   - Christmas Day observed on Dec 24/26 when it falls on a weekend
--   - the yearly proclamation of special non-working days
-- Add those through the UI or by hand.
-- NOTE: holiday names are single-quoted string literals, and the apostrophe in
-- "New Year's ..." is escaped by doubling it ('New Year''s Day'). Double quotes
-- would denote an identifier in Postgres, not a string.
INSERT INTO ph_holidays (holiday_date, name, is_regular) VALUES
  (DATE '2024-01-01', 'New Year''s Day', true),
  (DATE '2024-04-09', 'Araw ng Kagitingan (Rizal Day)', true),
  (DATE '2024-05-01', 'Labor Day', true),
  (DATE '2024-06-12', 'Independence Day', true),
  (DATE '2024-08-21', 'Ninoy Aquino Day', false),
  (DATE '2024-11-30', 'Bonifacio Day', true),
  (DATE '2024-12-25', 'Christmas Day', true),
  (DATE '2024-12-30', 'Rizal Day', true),
  (DATE '2024-12-31', 'New Year''s Eve', false),
  (DATE '2025-01-01', 'New Year''s Day', true),
  (DATE '2025-04-09', 'Araw ng Kagitingan (Rizal Day)', true),
  (DATE '2025-05-01', 'Labor Day', true),
  (DATE '2025-06-12', 'Independence Day', true),
  (DATE '2025-08-21', 'Ninoy Aquino Day', false),
  (DATE '2025-11-30', 'Bonifacio Day', true),
  (DATE '2025-12-25', 'Christmas Day', true),
  (DATE '2025-12-30', 'Rizal Day', true),
  (DATE '2025-12-31', 'New Year''s Eve', false),
  (DATE '2026-01-01', 'New Year''s Day', true),
  (DATE '2026-04-09', 'Araw ng Kagitingan (Rizal Day)', true),
  (DATE '2026-05-01', 'Labor Day', true),
  (DATE '2026-06-12', 'Independence Day', true),
  (DATE '2026-08-21', 'Ninoy Aquino Day', false),
  (DATE '2026-11-30', 'Bonifacio Day', true),
  (DATE '2026-12-25', 'Christmas Day', true),
  (DATE '2026-12-30', 'Rizal Day', true),
  (DATE '2026-12-31', 'New Year''s Eve', false)
ON CONFLICT (holiday_date) DO NOTHING;

-- National Heroes Day: the last Monday of August. Computed rather than
-- hard-coded so it is right for every year.
DO $$
DECLARE
  y INTEGER;
  last_monday DATE;
BEGIN
  FOR y IN 2024..2030 LOOP
    -- Aug 31 is a Monday in 5 of 7 years, so walk back from the 31st to the
    -- final Monday of the month.
    last_monday := make_date(y, 8, 31) - ((EXTRACT(DOW FROM make_date(y, 8, 31))::INTEGER + 6) % 7);
    INSERT INTO ph_holidays (holiday_date, name, is_regular)
    VALUES (last_monday, 'National Heroes Day', true)
    ON CONFLICT (holiday_date) DO NOTHING;
  END LOOP;
END $$;

COMMENT ON TABLE ph_holidays IS
  'Philippine non-working days. Regular holidays are fixed by law; special non-working days are proclaimed yearly and added here.';
COMMENT ON TABLE work_immersion_blocked_dates IS
  'Dates a supervisor blocks for a batch, excluded from immersion day counting (e.g. school events).';
