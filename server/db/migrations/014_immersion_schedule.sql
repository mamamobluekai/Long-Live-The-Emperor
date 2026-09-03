-- Migration: Work Immersion Schedule & Periods (014)
-- Adds immersion schedule fields to system_settings and creates immersion_periods table

-- Add immersion schedule columns to system_settings
ALTER TABLE system_settings ADD COLUMN IF NOT EXISTS immersion_start_date DATE;
ALTER TABLE system_settings ADD COLUMN IF NOT EXISTS immersion_end_date DATE;
ALTER TABLE system_settings ADD COLUMN IF NOT EXISTS auto_activate BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE system_settings ADD COLUMN IF NOT EXISTS auto_deactivate BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE system_settings ADD COLUMN IF NOT EXISTS access_student BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE system_settings ADD COLUMN IF NOT EXISTS access_teacher BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE system_settings ADD COLUMN IF NOT EXISTS access_coordinator BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE system_settings ADD COLUMN IF NOT EXISTS access_supervisor BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE system_settings ADD COLUMN IF NOT EXISTS required_hours INTEGER DEFAULT 80;
ALTER TABLE system_settings ADD COLUMN IF NOT EXISTS working_days VARCHAR(50) DEFAULT 'Mon,Tue,Wed,Thu,Fri';

-- Create immersion_periods table for batch-specific periods
CREATE TABLE IF NOT EXISTS immersion_periods (
  id SERIAL PRIMARY KEY,
  period_name VARCHAR(255) NOT NULL,
  academic_year VARCHAR(50) NOT NULL,
  semester VARCHAR(50) NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  required_hours INTEGER DEFAULT 80,
  working_days VARCHAR(50) DEFAULT 'Mon,Tue,Wed,Thu,Fri',
  status VARCHAR(20) NOT NULL DEFAULT 'upcoming' CHECK (status IN ('upcoming', 'ongoing', 'completed')),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_immersion_periods_status ON immersion_periods(status);
CREATE INDEX IF NOT EXISTS idx_immersion_periods_dates ON immersion_periods(start_date, end_date);

-- Link teacher_batches to immersion_periods
ALTER TABLE teacher_batches ADD COLUMN IF NOT EXISTS immersion_period_id INTEGER REFERENCES immersion_periods(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_teacher_batches_period ON teacher_batches(immersion_period_id);
