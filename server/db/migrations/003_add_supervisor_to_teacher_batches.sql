-- Migration: link teacher batches to a supervisor (003)
-- Run with the pg pool / psql against work_immersion_db.

ALTER TABLE IF EXISTS teacher_batches
  ADD COLUMN IF NOT EXISTS supervisor_id INTEGER REFERENCES users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_teacher_batches_supervisor ON teacher_batches(supervisor_id);
