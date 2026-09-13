-- Migration: widen student_attendance.status check constraint to include 'present'.
-- Reason: when an attendance appeal is approved, we want the appealed day to
-- show as fully Present for the student regardless of attendance_type.
-- The original schema.sql has NO check constraint on status, but the live
-- database has one (student_attendance_status_check) that only allows the
-- legacy values. This migration drops the old constraint (if present) and
-- adds a wider one that also allows 'present'.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'student_attendance_status_check'
      AND table_name = 'student_attendance'
  ) THEN
    ALTER TABLE student_attendance DROP CONSTRAINT student_attendance_status_check;
  END IF;
END $$;

ALTER TABLE student_attendance
  ADD CONSTRAINT student_attendance_status_check
  CHECK (status IN ('checked_in', 'checked_out', 'absent', 'present'));