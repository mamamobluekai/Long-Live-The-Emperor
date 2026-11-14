-- Migration: Add strand restriction to coordinators (2026-11-14)
-- A coordinator can be limited to a specific strand (e.g., GAS).
-- NULL means the coordinator can manage students from all strands.

ALTER TABLE coordinators ADD COLUMN IF NOT EXISTS strand VARCHAR(255);
