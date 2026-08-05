-- Migration: Add module, status, device columns to audit_logs (2026-08-04)
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS module VARCHAR(100);
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT 'success';
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS device TEXT;

CREATE INDEX IF NOT EXISTS idx_audit_logs_module ON audit_logs(module);
CREATE INDEX IF NOT EXISTS idx_audit_logs_status ON audit_logs(status);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_created ON audit_logs(user_id, created_at);
