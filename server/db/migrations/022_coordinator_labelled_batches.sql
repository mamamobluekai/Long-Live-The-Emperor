-- Migration: coordinator-labelled deployment batches (022)
--
-- Flow change: a supervisor no longer names the batch on their request. The
-- COORDINATOR labels the batch when they fulfil the request, and the supervisor
-- is attached to that batch exactly the way a teacher is.
--
--   1. Supervisor requests N students from a coordinator (no batch label).
--      The row is stored with the AWAITING_LABEL placeholder below.
--   2. Coordinator picks the students, supplies the batch label, and fulfils.
--      A teacher_batches row is created with supervisor_id set, the students are
--      linked, and teacher_batch_id is stored back on the request.

-- Placeholder written on supervisor requests; replaced by the coordinator's
-- label the moment the request is fulfilled.
UPDATE deployment_requests
SET batch_label = 'Awaiting coordinator'
WHERE direction = 'supervisor_to_coordinator'
  AND status <> 'fulfilled'
  AND (batch_label IS NULL OR batch_label = '');

-- Link a fulfilled request back to the teacher batch the coordinator created.
ALTER TABLE deployment_requests
  ADD COLUMN IF NOT EXISTS teacher_batch_id INTEGER
  REFERENCES teacher_batches(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_deployment_requests_batch
  ON deployment_requests (teacher_batch_id);
