-- Migration 026: Security hardening.
--
-- Adds the persistence layer used by the application-level security controls
-- for the ten threat classes this capstone must defend against:
--
--   1. SQL injection            -> no new storage (parameterized queries + input guard)
--   2. Brute force              -> `security_events` telemetry
--   3. Credential stuffing      -> `security_events` + `login_attempts` (existing)
--   4. DDoS / API flooding      -> `security_events` telemetry
--   5. XSS                      -> no new storage (output encoding + CSP)
--   6. CSRF                     -> `csrf_secrets` (double-submit token store)
--   7. Session hijacking        -> `refresh_tokens`, `revoked_tokens`
--   8. Account enumeration      -> generic errors (no storage change)
--   9. File upload attacks      -> `file_upload_audit`
--  10. Broken access control    -> `security_events` telemetry
--
-- All statements are idempotent so the migration can be re-run safely.
--
-- Run with: psql -h <host> -U <user> -d <dbname> -f 026_security_hardening.sql

-- ---------------------------------------------------------------------------
-- Refresh tokens: one row per issued refresh token so tokens can be rotated,
-- tracked by device/IP and revoked on logout or on suspected theft.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS refresh_tokens (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash VARCHAR(128) NOT NULL UNIQUE,
  jti VARCHAR(64) NOT NULL,
  ip_address VARCHAR(100),
  user_agent TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMP NOT NULL,
  revoked_at TIMESTAMP,
  replaced_by VARCHAR(64)
);

CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user_id ON refresh_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_token_hash ON refresh_tokens(token_hash);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_jti ON refresh_tokens(jti);

-- ---------------------------------------------------------------------------
-- Revoked access tokens: keeps a short-lived deny-list keyed by the token's
-- JWT id (`jti`) so a logged-out or force-terminated access token cannot be
-- replayed until it would naturally expire ("less than one access-token TTL").
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS revoked_tokens (
  id SERIAL PRIMARY KEY,
  jti VARCHAR(64) NOT NULL UNIQUE,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  reason VARCHAR(120),
  revoked_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMP NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_revoked_tokens_jti ON revoked_tokens(jti);
CREATE INDEX IF NOT EXISTS idx_revoked_tokens_expires_at ON revoked_tokens(expires_at);

-- ---------------------------------------------------------------------------
-- CSRF secrets: server-side half of the signed double-submit cookie pattern.
-- One active secret per user session, rotated on login and cleared on logout.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS csrf_secrets (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  secret_hash VARCHAR(128) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMP NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_csrf_secrets_user_id ON csrf_secrets(user_id);

-- ---------------------------------------------------------------------------
-- Security events: append-only telemetry feed for every control in this
-- migration. Also doubles as the DDoS / credential-stuffing detection source
-- (aggregated by IP, email or event_type within a rolling window).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS security_events (
  id SERIAL PRIMARY KEY,
  event_type VARCHAR(60) NOT NULL,
  severity VARCHAR(20) NOT NULL DEFAULT 'info',
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  email VARCHAR(255),
  ip_address VARCHAR(100),
  user_agent TEXT,
  path VARCHAR(500),
  method VARCHAR(10),
  detail TEXT,
  metadata JSONB,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_security_events_type ON security_events(event_type);
CREATE INDEX IF NOT EXISTS idx_security_events_ip ON security_events(ip_address);
CREATE INDEX IF NOT EXISTS idx_security_events_email ON security_events(email);
CREATE INDEX IF NOT EXISTS idx_security_events_created_at ON security_events(created_at);

-- ---------------------------------------------------------------------------
-- File upload audit: records every upload attempt (accepted or rejected) with
-- the detected MIME type so malicious payloads can be investigated after the
-- fact.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS file_upload_audit (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  original_name VARCHAR(500),
  detected_mime VARCHAR(150),
  declared_mime VARCHAR(150),
  file_size INTEGER,
  decision VARCHAR(20) NOT NULL DEFAULT 'accepted',
  reason VARCHAR(255),
  ip_address VARCHAR(100),
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_file_upload_audit_user_id ON file_upload_audit(user_id);
CREATE INDEX IF NOT EXISTS idx_file_upload_audit_decision ON file_upload_audit(decision);

-- ---------------------------------------------------------------------------
-- Extend login_attempts so it can also be keyed by IP (credential stuffing
-- frequently rotates the target email from a single source address).
-- ---------------------------------------------------------------------------
ALTER TABLE login_attempts
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP;

CREATE INDEX IF NOT EXISTS idx_login_attempts_ip ON login_attempts(ip_address);

COMMENT ON TABLE refresh_tokens IS
  'Rotating refresh tokens. token_hash prevents storing a usable token at rest.';
COMMENT ON TABLE revoked_tokens IS
  'Short-lived deny-list of access-token jti values revoked before natural expiry.';
COMMENT ON TABLE csrf_secrets IS
  'Server-side half of the signed double-submit CSRF cookie pattern.';
COMMENT ON TABLE security_events IS
  'Append-only security telemetry also used for brute-force / stuffing detection.';
COMMENT ON TABLE file_upload_audit IS
  'Audit trail of every file upload attempt and its validation decision.';

