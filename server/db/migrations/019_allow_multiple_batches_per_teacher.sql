-- Allow a teacher to handle MULTIPLE teacher batches.
--
-- Previously teacher_batches.teacher_id was UNIQUE, which hard-limited a
-- teacher to a single batch. Coordinators now assign a teacher to several
-- batches, so we drop that uniqueness constraint.
ALTER TABLE IF EXISTS teacher_batches
  DROP CONSTRAINT IF EXISTS teacher_batches_teacher_id_key;

-- Helpful for "list every batch this teacher handles" and the teacher
-- dashboard batch picker.
CREATE INDEX IF NOT EXISTS idx_teacher_batches_teacher ON teacher_batches(teacher_id);