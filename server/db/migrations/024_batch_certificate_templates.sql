-- Migration 024: per-batch certificate designs.
--
-- certificate_templates was keyed UNIQUE(supervisor_id), i.e. one design for
-- every batch a supervisor handled. Batches host different companies, so the
-- design now belongs to the batch, with the supervisor row kept as the
-- fallback/default for any batch that has no design of its own.
--
-- Run with: psql -h <host> -U <user> -d <dbname> -f 024_batch_certificate_templates.sql

ALTER TABLE certificate_templates
  ADD COLUMN IF NOT EXISTS teacher_batch_id INTEGER
    REFERENCES teacher_batches(id) ON DELETE CASCADE;

-- CRITICAL: migration 005 created a table-level UNIQUE(supervisor_id). Until it
-- is dropped, a supervisor can only ever have ONE design row, so no per-batch
-- design can be inserted at all - the insert fails on that constraint. The
-- replacements below are partial indexes (one per batch, one for the default).
ALTER TABLE certificate_templates
  DROP CONSTRAINT IF EXISTS certificate_templates_supervisor_id_key;

-- Seed the existing supervisor-level rows as NULL teacher_batch_id (they
-- already are) so nothing changes for existing data: they keep working as the
-- per-supervisor default.

-- Per-batch designs must be unique per batch. NULL is excluded on purpose:
-- the default rows share NULL for every batch they cover, and Postgres treats
-- NULLs as distinct in unique indexes anyway.
CREATE UNIQUE INDEX IF NOT EXISTS ux_certificate_templates_batch
  ON certificate_templates (teacher_batch_id)
  WHERE teacher_batch_id IS NOT NULL;

-- One default per supervisor.
CREATE UNIQUE INDEX IF NOT EXISTS ux_certificate_templates_supervisor_default
  ON certificate_templates (supervisor_id)
  WHERE teacher_batch_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_certificate_templates_lookup
  ON certificate_templates (supervisor_id, teacher_batch_id);

COMMENT ON COLUMN certificate_templates.teacher_batch_id IS
  'Batch this design applies to. NULL = the supervisor default, used for any of their batches without a design of its own.';

-- Certificates record which batch issued them, so a later design change can be
-- reported and so the same batch design is used when regenerating a download.
ALTER TABLE certificates
  ADD COLUMN IF NOT EXISTS teacher_batch_id INTEGER
    REFERENCES teacher_batches(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_certificates_batch
  ON certificates (teacher_batch_id);

COMMENT ON COLUMN certificates.teacher_batch_id IS
  'Batch that issued this certificate; drives which certificate design applies.';
