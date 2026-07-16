-- Migration: attendance scheduling, GPS logging, appeals, student photos (2026-07-16)
-- Run with the pg pool / psql against work_immersion_db.

-- Per-batch attendance schedule configuration (Asia/Manila by default).
CREATE TABLE IF NOT EXISTS attendance_config (
  id SERIAL PRIMARY KEY,
  teacher_batch_id INTEGER NOT NULL UNIQUE REFERENCES teacher_batches(id) ON DELETE CASCADE,
  time_in_open TIME NOT NULL DEFAULT '08:00',
  time_in_close TIME NOT NULL DEFAULT '08:30',
  time_out_open TIME NOT NULL DEFAULT '17:00',
  time_out_close TIME NOT NULL DEFAULT '17:30',
  timezone VARCHAR(64) NOT NULL DEFAULT 'Asia/Manila',
  manual_open BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- GPS snapshot captured on every attendance event (check-in / check-out).
CREATE TABLE IF NOT EXISTS gps_logs (
  id SERIAL PRIMARY KEY,
  student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  teacher_batch_id INTEGER NOT NULL REFERENCES teacher_batches(id) ON DELETE CASCADE,
  attendance_id INTEGER REFERENCES student_attendance(id) ON DELETE SET NULL,
  event_type VARCHAR(20) NOT NULL CHECK (event_type IN ('check_in', 'check_out', 'live')),
  latitude NUMERIC(10, 7) NOT NULL,
  longitude NUMERIC(13, 7) NOT NULL,
  accuracy INTEGER,
  student_name VARCHAR(255),
  recorded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_gps_logs_student ON gps_logs(student_id);
CREATE INDEX IF NOT EXISTS idx_gps_logs_batch ON gps_logs(teacher_batch_id);
CREATE INDEX IF NOT EXISTS idx_gps_logs_recorded ON gps_logs(recorded_at);

-- Attendance appeals submitted by students when they miss a window.
CREATE TABLE IF NOT EXISTS attendance_appeals (
  id SERIAL PRIMARY KEY,
  student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  teacher_batch_id INTEGER NOT NULL REFERENCES teacher_batches(id) ON DELETE CASCADE,
  teacher_id INTEGER NOT NULL REFERENCES teachers(id) ON DELETE CASCADE,
  attendance_type VARCHAR(20) NOT NULL CHECK (attendance_type IN ('time_in', 'time_out')),
  excuse TEXT NOT NULL,
  file_url TEXT,
  file_name VARCHAR(255),
  status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  teacher_comment TEXT,
  reviewed_by INTEGER REFERENCES users(id),
  reviewed_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_appeals_teacher ON attendance_appeals(teacher_id);
CREATE INDEX IF NOT EXISTS idx_appeals_status ON attendance_appeals(status);

-- Accuracy columns + appeal reference on the existing attendance table.
ALTER TABLE student_attendance ADD COLUMN IF NOT EXISTS check_in_accuracy INTEGER;
ALTER TABLE student_attendance ADD COLUMN IF NOT EXISTS check_out_accuracy INTEGER;
ALTER TABLE student_attendance ADD COLUMN IF NOT EXISTS appeal_time_in_id INTEGER REFERENCES attendance_appeals(id) ON DELETE SET NULL;
ALTER TABLE student_attendance ADD COLUMN IF NOT EXISTS appeal_time_out_id INTEGER REFERENCES attendance_appeals(id) ON DELETE SET NULL;

-- Optional student profile photo.
ALTER TABLE students ADD COLUMN IF NOT EXISTS photo_url VARCHAR(512);
