-- Migration 025: system-wide maintenance mode.
--
-- When enabled, non-admin accounts (student, teacher, supervisor, coordinator)
-- are refused at login and on subsequent API calls, while admins stay signed in
-- so an administrator can always turn the flag back off. Without that exemption
-- an accidental toggle would lock every account out of the system with no
-- in-app way to recover.
--
-- Run with: psql -h <host> -U <user> -d <dbname> -f 025_maintenance_mode.sql

ALTER TABLE system_settings
  ADD COLUMN IF NOT EXISTS maintenance_mode BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE system_settings
  ADD COLUMN IF NOT EXISTS maintenance_message TEXT;

ALTER TABLE system_settings
  ADD COLUMN IF NOT EXISTS maintenance_started_at TIMESTAMP;

ALTER TABLE system_settings
  ADD COLUMN IF NOT EXISTS maintenance_estimated_end TIMESTAMP;

COMMENT ON COLUMN system_settings.maintenance_mode IS
  'When true, non-admin roles are blocked at login and on API calls; admins are exempt.';
COMMENT ON COLUMN system_settings.maintenance_message IS
  'Reason shown to blocked users on the login screen and maintenance screen.';
COMMENT ON COLUMN system_settings.maintenance_started_at IS
  'Timestamp of when maintenance mode was last switched on.';
COMMENT ON COLUMN system_settings.maintenance_estimated_end IS
  'Optional expected end time, displayed as "expected back by" to blocked users.';
