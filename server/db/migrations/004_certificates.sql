-- Migration: completion certificates (004)
-- Run with the pg pool / psql against work_immersion_db.

CREATE TABLE IF NOT EXISTS certificates (
  id SERIAL PRIMARY KEY,
  student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  full_name VARCHAR(255) NOT NULL,
  certificate_number VARCHAR(100) NOT NULL UNIQUE,
  completion_date DATE NOT NULL,
  requirements_status VARCHAR(100) NOT NULL,
  documentation_status VARCHAR(100) NOT NULL,
  attendance_days INTEGER NOT NULL,
  issued_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  cloudinary_public_id VARCHAR(255) NOT NULL,
  cloudinary_url TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_certificates_student_id ON certificates(student_id);
CREATE INDEX IF NOT EXISTS idx_certificates_certificate_number ON certificates(certificate_number);
