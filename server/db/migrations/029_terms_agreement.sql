-- Migration 029: Terms and Agreement acceptance.
--
-- Every account must accept the Work Immersion Monitoring System Terms and
-- Agreement once. The flag lives on the users row so acceptance is per-user and
-- permanent: once set it is never shown again, and it survives re-login on any
-- device.
--
-- Existing accounts default to false, so the very next sign-in from each of them
-- is asked to read and accept the terms before reaching their dashboard.
--
-- Run with: node scripts/runMigration.js db/migrations/029_terms_agreement.sql

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS terms_accepted BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS terms_accepted_at TIMESTAMP;

COMMENT ON COLUMN users.terms_accepted IS
  'True once the user has read and accepted the Terms and Agreement. Until then the app shows the agreement after login and blocks the dashboard.';
COMMENT ON COLUMN users.terms_accepted_at IS
  'Timestamp of when the user accepted the Terms and Agreement.';