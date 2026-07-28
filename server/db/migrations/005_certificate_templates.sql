-- Migration: supervisor certificate templates (005)
-- Run with the pg pool / psql against work_immersion_db.

CREATE TABLE IF NOT EXISTS certificate_templates (
  id SERIAL PRIMARY KEY,
  supervisor_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  school_name VARCHAR(255) NOT NULL DEFAULT 'Work Immersion Program',
  company_name VARCHAR(255) NOT NULL DEFAULT 'Host Company',
  program_name VARCHAR(255) NOT NULL DEFAULT 'Work Immersion',
  footer_text TEXT NOT NULL DEFAULT 'Verify this certificate at the issuing institution. This is an official record of work immersion completion.',
  border_color VARCHAR(20) NOT NULL DEFAULT '#1e3a8a',
  title_text VARCHAR(255) NOT NULL DEFAULT 'CERTIFICATE OF COMPLETION',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(supervisor_id)
);

CREATE INDEX IF NOT EXISTS idx_certificate_templates_supervisor ON certificate_templates(supervisor_id);
