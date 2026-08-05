-- Migration: Add profile pictures to teachers, supervisors, coordinators (2026-08-04)
-- Run with psql/pg against work_immersion_db.

ALTER TABLE teachers ADD COLUMN IF NOT EXISTS photo_url VARCHAR(512);
ALTER TABLE supervisors ADD COLUMN IF NOT EXISTS photo_url VARCHAR(512);
ALTER TABLE coordinators ADD COLUMN IF NOT EXISTS photo_url VARCHAR(512);
