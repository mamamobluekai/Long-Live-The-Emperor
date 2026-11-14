-- Migration: Add archived_at soft-delete column to students (2026-11-14)
-- When a coordinator removes a student, archived_at is set and the student
-- moves to the archived section instead of being hard-deleted.

ALTER TABLE students ADD COLUMN IF NOT EXISTS archived_at TIMESTAMP;
