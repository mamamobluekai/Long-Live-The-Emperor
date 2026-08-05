-- Migration: Admin module — system settings, audit logs, notifications (2026-08-03)
-- Run with psql/pg against work_immersion_db.

-- Single-row system settings table.
CREATE TABLE IF NOT EXISTS system_settings (
  id INTEGER PRIMARY KEY DEFAULT 1,
  system_name VARCHAR(255) NOT NULL DEFAULT 'Work Immersion Monitoring System',
  logo_url TEXT,
  school_name VARCHAR(255),
  school_address TEXT,
  academic_year VARCHAR(50),
  semester VARCHAR(50),
  attendance_time_in TIME DEFAULT '08:00',
  attendance_time_out TIME DEFAULT '17:00',
  announcements TEXT,
  updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT one_settings_row CHECK (id = 1)
);

-- Audit trail for every privileged admin action.
CREATE TABLE IF NOT EXISTS audit_logs (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  action VARCHAR(100) NOT NULL,
  details TEXT,
  ip_address VARCHAR(100),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_user ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON audit_logs(created_at);

-- Notifications surfaced to the admin user.
CREATE TABLE IF NOT EXISTS notifications (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  title VARCHAR(255) NOT NULL,
  message TEXT NOT NULL,
  type VARCHAR(50) NOT NULL DEFAULT 'info',
  is_read BOOLEAN NOT NULL DEFAULT false,
  action_url TEXT,
  related_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_unread
  ON notifications(user_id, is_read) WHERE is_read = false;
CREATE INDEX IF NOT EXISTS idx_notifications_created ON notifications(created_at);

-- Evaluations submitted by teachers/supervisors for students.
CREATE TABLE IF NOT EXISTS evaluations (
  id SERIAL PRIMARY KEY,
  student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  evaluator_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  evaluation_type VARCHAR(100) NOT NULL,
  rating INTEGER CHECK (rating BETWEEN 1 AND 10),
  comments TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_evaluations_student ON evaluations(student_id);

-- Seed the settings row if it does not exist yet.
INSERT INTO system_settings (id, system_name)
  SELECT 1, 'Work Immersion Monitoring System'
  WHERE NOT EXISTS (SELECT 1 FROM system_settings WHERE id = 1);
