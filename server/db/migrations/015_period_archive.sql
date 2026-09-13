-- Migration: Period-bound users + Archive (015)
-- Links each non-admin user account to a single immersion_period and adds
-- archive tables that snapshot period data after the period ends.

-- 1) Link users to an immersion period so we can target deletions per period.
ALTER TABLE users ADD COLUMN IF NOT EXISTS immersion_period_id INTEGER REFERENCES immersion_periods(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_users_period ON users(immersion_period_id);

-- 2) Archive metadata: one row per archived period.
CREATE TABLE IF NOT EXISTS archive_periods (
  id SERIAL PRIMARY KEY,
  immersion_period_id INTEGER NOT NULL UNIQUE REFERENCES immersion_periods(id) ON DELETE RESTRICT,
  period_name VARCHAR(255) NOT NULL,
  academic_year VARCHAR(50) NOT NULL,
  semester VARCHAR(50) NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  student_count INTEGER NOT NULL DEFAULT 0,
  teacher_count INTEGER NOT NULL DEFAULT 0,
  supervisor_count INTEGER NOT NULL DEFAULT 0,
  coordinator_count INTEGER NOT NULL DEFAULT 0,
  batch_count INTEGER NOT NULL DEFAULT 0,
  attendance_record_count INTEGER NOT NULL DEFAULT 0,
  archived_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  archived_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  notes TEXT
);

CREATE INDEX IF NOT EXISTS idx_archive_periods_archived_at ON archive_periods(archived_at DESC);

-- 3) Archive snapshot tables. Each row stores the original id so the snapshot
-- is self-contained and can be inspected independently of the live DB.

CREATE TABLE IF NOT EXISTS archive_users (
  id SERIAL PRIMARY KEY,
  archive_period_id INTEGER NOT NULL REFERENCES archive_periods(id) ON DELETE CASCADE,
  original_user_id INTEGER NOT NULL,
  email VARCHAR(255) NOT NULL,
  role VARCHAR(50) NOT NULL,
  status VARCHAR(50),
  phone VARCHAR(50),
  profile JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP,
  updated_at TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_archive_users_period ON archive_users(archive_period_id);
CREATE INDEX IF NOT EXISTS idx_archive_users_role ON archive_users(archive_period_id, role);

CREATE TABLE IF NOT EXISTS archive_teacher_batches (
  id SERIAL PRIMARY KEY,
  archive_period_id INTEGER NOT NULL REFERENCES archive_periods(id) ON DELETE CASCADE,
  original_batch_id INTEGER NOT NULL,
  batch_label VARCHAR(255) NOT NULL,
  max_students INTEGER NOT NULL DEFAULT 30,
  teacher_user_id INTEGER,
  teacher_name VARCHAR(255),
  supervisor_user_id INTEGER,
  supervisor_name VARCHAR(255),
  coordinator_user_id INTEGER,
  coordinator_name VARCHAR(255),
  attendance_config JSONB,
  work_immersion_schedule JSONB,
  students JSONB NOT NULL DEFAULT '[]'::jsonb,
  attendance_records JSONB NOT NULL DEFAULT '[]'::jsonb,
  attendance_appeals JSONB NOT NULL DEFAULT '[]'::jsonb,
  gps_logs JSONB NOT NULL DEFAULT '[]'::jsonb,
  daily_documentation JSONB NOT NULL DEFAULT '[]'::jsonb,
  student_documents JSONB NOT NULL DEFAULT '[]'::jsonb,
  evaluations JSONB NOT NULL DEFAULT '[]'::jsonb,
  certificates JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_archive_batches_period ON archive_teacher_batches(archive_period_id);

CREATE TABLE IF NOT EXISTS archive_deployment_requests (
  id SERIAL PRIMARY KEY,
  archive_period_id INTEGER NOT NULL REFERENCES archive_periods(id) ON DELETE CASCADE,
  original_request_id INTEGER NOT NULL,
  batch_label VARCHAR(255) NOT NULL,
  strand VARCHAR(255),
  num_students INTEGER NOT NULL,
  notes TEXT,
  direction VARCHAR(100) NOT NULL,
  status VARCHAR(100) NOT NULL,
  coordinator_name VARCHAR(255),
  supervisor_name VARCHAR(255),
  student_names JSONB NOT NULL DEFAULT '[]'::jsonb,
  responded_at TIMESTAMP,
  created_at TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_archive_deployments_period ON archive_deployment_requests(archive_period_id);
