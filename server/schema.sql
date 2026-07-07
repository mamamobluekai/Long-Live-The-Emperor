-- Work Immersion Management System Database Schema
-- PostgreSQL compatible

CREATE EXTENSION IF NOT EXISTS citext;

-- Main Users Table - Contains only common fields
CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  email VARCHAR(255) NOT NULL UNIQUE,
  password VARCHAR(255) NOT NULL,
  role VARCHAR(50) NOT NULL CHECK (role IN ('admin', 'teacher', 'student', 'supervisor', 'coordinator')),
  status VARCHAR(50) NOT NULL DEFAULT 'pending',
  phone VARCHAR(50),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Admin Role Specific Table
CREATE TABLE admins (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  first_name VARCHAR(100) NOT NULL,
  last_name VARCHAR(100) NOT NULL,
  employee_id VARCHAR(100) UNIQUE,
  department VARCHAR(255),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Teacher Role Specific Table
CREATE TABLE teachers (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  first_name VARCHAR(100) NOT NULL,
  last_name VARCHAR(100) NOT NULL,
  employee_id VARCHAR(100) UNIQUE,
  department VARCHAR(255),
  designation VARCHAR(255),
  school VARCHAR(255),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Student Role Specific Table (No company fields - students don't have companies)
CREATE TABLE students (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  student_number VARCHAR(100) UNIQUE,
  first_name VARCHAR(100) NOT NULL,
  middle_name VARCHAR(100),
  last_name VARCHAR(100) NOT NULL,
  suffix VARCHAR(20),
  gender VARCHAR(20),
  birthdate DATE,
  age INTEGER,
  contact_number VARCHAR(50),
  email VARCHAR(255),
  home_address TEXT,
  grade_level VARCHAR(50),
  section VARCHAR(100),
  track_strand VARCHAR(255),
  school VARCHAR(255),
  preferred_industry VARCHAR(255),
  preferred_company VARCHAR(255),
  career_goal TEXT,
  industry_reason TEXT,
  guardian_name VARCHAR(255),
  guardian_relationship VARCHAR(100),
  guardian_contact VARCHAR(50),
  guardian_email VARCHAR(255),
  guardian_address TEXT,
  emergency_contact VARCHAR(255),
  emergency_contact_number VARCHAR(50),
  academic_notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Supervisor Role Specific Table (Has company information)
CREATE TABLE supervisors (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  first_name VARCHAR(100) NOT NULL,
  last_name VARCHAR(100) NOT NULL,
  employee_id VARCHAR(100) UNIQUE,
  company_name VARCHAR(255) NOT NULL,
  designation VARCHAR(255),
  department VARCHAR(255),
  company_address TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Coordinator Role Specific Table
CREATE TABLE coordinators (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  first_name VARCHAR(100) NOT NULL,
  last_name VARCHAR(100) NOT NULL,
  employee_id VARCHAR(100) UNIQUE,
  department VARCHAR(255),
  designation VARCHAR(255),
  school VARCHAR(255),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Document Types Reference Table
CREATE TABLE document_types (
  id SERIAL PRIMARY KEY,
  code VARCHAR(100) NOT NULL UNIQUE,
  name VARCHAR(255) NOT NULL,
  section VARCHAR(100),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Student Requirement Submissions
CREATE TABLE student_requirement_submissions (
  id SERIAL PRIMARY KEY,
  student_id INTEGER NOT NULL UNIQUE REFERENCES students(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status VARCHAR(100) NOT NULL DEFAULT 'Pending',
  progress INTEGER NOT NULL DEFAULT 0,
  coordinator_feedback TEXT,
  reviewed_by INTEGER REFERENCES users(id),
  reviewed_at TIMESTAMP,
  submitted_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE student_documents (
  id SERIAL PRIMARY KEY,
  submission_id INTEGER NOT NULL REFERENCES student_requirement_submissions(id) ON DELETE CASCADE,
  student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  document_type_id INTEGER NOT NULL REFERENCES document_types(id),
  document_name VARCHAR(255),
  file_path TEXT NOT NULL,
  original_name VARCHAR(255),
  mime_type VARCHAR(255),
  file_size INTEGER,
  status VARCHAR(100) NOT NULL DEFAULT 'Uploaded',
  remarks TEXT,
  verified_by INTEGER REFERENCES users(id),
  verified_date TIMESTAMP,
  uploaded_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE submission_logs (
  id SERIAL PRIMARY KEY,
  submission_id INTEGER NOT NULL REFERENCES student_requirement_submissions(id) ON DELETE CASCADE,
  actor_id INTEGER REFERENCES users(id),
  action VARCHAR(255) NOT NULL,
  remarks TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Teacher Batches
CREATE TABLE teacher_batches (
  id SERIAL PRIMARY KEY,
  coordinator_id INTEGER NOT NULL REFERENCES coordinators(id) ON DELETE CASCADE,
  teacher_id INTEGER NOT NULL UNIQUE REFERENCES teachers(id) ON DELETE CASCADE,
  batch_label VARCHAR(255) NOT NULL,
  max_students INTEGER NOT NULL DEFAULT 30,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Students assigned to teacher batches
CREATE TABLE teacher_batch_students (
  id SERIAL PRIMARY KEY,
  teacher_batch_id INTEGER NOT NULL REFERENCES teacher_batches(id) ON DELETE CASCADE,
  student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  assigned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (teacher_batch_id, student_id)
);

-- Deployment Requests (from coordinator to supervisor)
CREATE TABLE deployment_requests (
  id SERIAL PRIMARY KEY,
  coordinator_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  supervisor_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  batch_label VARCHAR(255) NOT NULL,
  strand VARCHAR(255),
  num_students INTEGER NOT NULL,
  notes TEXT,
  direction VARCHAR(100) NOT NULL,
  status VARCHAR(100) NOT NULL DEFAULT 'pending',
  responded_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Students in deployment requests
CREATE TABLE deployment_request_students (
  id SERIAL PRIMARY KEY,
  deployment_request_id INTEGER NOT NULL REFERENCES deployment_requests(id) ON DELETE CASCADE,
  student_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE (deployment_request_id, student_id)
);

CREATE TABLE login_attempts (
  id SERIAL PRIMARY KEY,
  email VARCHAR(255) NOT NULL,
  ip_address VARCHAR(100),
  attempts INTEGER NOT NULL DEFAULT 0,
  last_attempt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  locked_until TIMESTAMP
);

-- Indexes for Performance
CREATE INDEX idx_users_role_status ON users(role, status);
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_students_user_id ON students(user_id);
CREATE INDEX idx_admins_user_id ON admins(user_id);
CREATE INDEX idx_teachers_user_id ON teachers(user_id);
CREATE INDEX idx_supervisors_user_id ON supervisors(user_id);
CREATE INDEX idx_coordinators_user_id ON coordinators(user_id);
CREATE INDEX idx_submission_status ON student_requirement_submissions(status);
CREATE INDEX idx_teacher_batches_coordinator ON teacher_batches(coordinator_id);
CREATE INDEX idx_deployment_requests_status ON deployment_requests(status);
CREATE INDEX idx_login_attempts_email ON login_attempts(email);

INSERT INTO document_types (code, name, section) VALUES
  ('guardian_consent', 'Guardian Consent', 'guardian'),
  ('medical_certificate', 'Medical Certificate', 'medical'),
  ('accident_insurance', 'Accident Insurance', 'medical'),
  ('vaccination_record', 'Vaccination Record', 'medical'),
  ('emergency_contact_form', 'Emergency Contact Form', 'medical'),
  ('form_138', 'Form 138', 'academic'),
  ('good_moral', 'Good Moral Certificate', 'academic'),
  ('psa_birth_certificate', 'PSA Birth Certificate', 'academic'),
  ('id_picture', 'ID Picture', 'academic'),
  ('student_profile_form', 'Student Profile Form', 'academic');
