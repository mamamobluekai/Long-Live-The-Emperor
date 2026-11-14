-- Migration: Add student_limit to coordinators (2026-11-14)
-- Each coordinator can manage up to student_limit students.
-- Default is 100. Admin can edit per coordinator.

ALTER TABLE coordinators ADD COLUMN IF NOT EXISTS student_limit INTEGER NOT NULL DEFAULT 100;
