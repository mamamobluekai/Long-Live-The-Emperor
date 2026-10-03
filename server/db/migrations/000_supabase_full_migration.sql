-- ===========================================================================
--  Work Immersion Management System (WIMS)
--  SINGLE-FILE, FULL SUPABASE / POSTGRES MIGRATION
-- ===========================================================================
--
--  PURPOSE
--    Creates the complete database schema on a fresh Supabase (or any
--    PostgreSQL 13+) project in ONE run. This is the flattened equivalent of:
--      server/db/schema.sql                     (baseline DDL)
--      server/db/migrations/002 .. 026          (evolution)
--    plus the runtime `ensure*Schema()` guards baked into controllers/services
--    that this project relies on because it has no automatic migration runner.
--
--  HOW TO RUN ON SUPABASE
--    1. Supabase Dashboard -> SQL Editor -> New query.
--    2. Paste this whole file.
--    3. Run. Everything is idempotent (IF NOT EXISTS / ON CONFLICT), so it is
--       safe to run more than once.
--
--    Command line alternative (uses the Supabase connection string):
--      psql "postgresql://postgres:<PASSWORD>@db.<PROJECT-REF>.supabase.co:5432/postgres" \
--           -f server/db/migrations/000_supabase_full_migration.sql
--
--  NOTES
--    * `citext` is created in the `extensions` schema on Supabase by default;
--      we attempt CREATE EXTENSION and it is a no-op if already present.
--    * This app uses INTEGER SERIAL primary keys and INTEGER foreign keys
--      everywhere. It does NOT use Supabase Auth (auth.users) - it has its own
--      `users` table with bcrypt passwords and JWT login. No Supabase-specific
--      RLS policies are required for the app to work, because the Node backend
--      connects with the database role directly. (See the header comment about
--      RLS at the end of the file if you later expose tables via supabase-js.)
--    * `ALTER DATABASE ... SET TIMEZONE` (migration 017) is wrapped in a DO
--      block that ignores insufficient_privilege, so it works on Supabase.
--
--  APPLIED IN ORDER: baseline -> 002..026 -> runtime-only guards.
-- ===========================================================================

-- ===========================================================================
-- SECTION 0 - Extension
-- ===========================================================================
CREATE EXTENSION IF NOT EXISTS citext;

-- ===========================================================================
-- SECTION 1 - BASELINE (server/db/schema.sql)
-- ===========================================================================

-- Main users table - contains only fields common to every role.
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  email VARCHAR(255) NOT NULL UNIQUE,
  password VARCHAR(255) NOT NULL,
  role VARCHAR(50) NOT NULL CHECK (role IN ('admin', 'teacher', 'student', 'supervisor', 'coordinator')),
  status VARCHAR(50) NOT NULL DEFAULT 'pending',
  phone VARCHAR(50),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Admin role-specific table.
CREATE TABLE IF NOT EXISTS admins (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  first_name VARCHAR(100) NOT NULL,
  last_name VARCHAR(100) NOT NULL,
  employee_id VARCHAR(100) UNIQUE,
  department VARCHAR(255),
  photo_url VARCHAR(512),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Teacher role-specific table.
CREATE TABLE IF NOT EXISTS teachers (
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

-- Student role-specific table (no company fields).
CREATE TABLE IF NOT EXISTS students (
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
  grade_level VARCHAR(50) NOT NULL DEFAULT '12',
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

-- Supervisor role-specific table (has company information).
CREATE TABLE IF NOT EXISTS supervisors (
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

-- Coordinator role-specific table.
CREATE TABLE IF NOT EXISTS coordinators (
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

-- Teacher batches (coordinator -> teacher grouping).
-- NOTE: created BEFORE student_attendance because student_attendance carries an
-- inline FK to teacher_batches. On a fresh database the referenced table must
-- already exist, or CREATE TABLE fails with 42P01.
CREATE TABLE IF NOT EXISTS teacher_batches (
  id SERIAL PRIMARY KEY,
  coordinator_id INTEGER NOT NULL REFERENCES coordinators(id) ON DELETE CASCADE,
  teacher_id INTEGER NOT NULL REFERENCES teachers(id) ON DELETE CASCADE,
  batch_label VARCHAR(255) NOT NULL,
  max_students INTEGER NOT NULL DEFAULT 30,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Students assigned to teacher batches.
CREATE TABLE IF NOT EXISTS teacher_batch_students (
  id SERIAL PRIMARY KEY,
  teacher_batch_id INTEGER NOT NULL REFERENCES teacher_batches(id) ON DELETE CASCADE,
  student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  assigned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (teacher_batch_id, student_id)
);

-- Per-student, per-day attendance record.
CREATE TABLE IF NOT EXISTS student_attendance (
  id SERIAL PRIMARY KEY,
  student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  teacher_batch_id INTEGER NOT NULL REFERENCES teacher_batches(id) ON DELETE CASCADE,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  status VARCHAR(50) NOT NULL DEFAULT 'checked_out',
  check_in_time TIMESTAMP,
  check_out_time TIMESTAMP,
  latitude NUMERIC(10, 7),
  longitude NUMERIC(13, 7),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (student_id, date)
);

-- GPS trail rows tied to an attendance record.
CREATE TABLE IF NOT EXISTS student_locations (
  id SERIAL PRIMARY KEY,
  student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  attendance_id INTEGER NOT NULL REFERENCES student_attendance(id) ON DELETE CASCADE,
  latitude NUMERIC(10, 7) NOT NULL,
  longitude NUMERIC(13, 7) NOT NULL,
  accuracy INTEGER,
  recorded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_student_attendance_student_date ON student_attendance(student_id, date);
CREATE INDEX IF NOT EXISTS idx_student_attendance_batch_date ON student_attendance(teacher_batch_id, date);
CREATE INDEX IF NOT EXISTS idx_student_locations_student_attendance ON student_locations(student_id, attendance_id);
CREATE INDEX IF NOT EXISTS idx_student_locations_recorded_at ON student_locations(recorded_at);

-- Document types reference table (seeded below with the 10 defaults).
CREATE TABLE IF NOT EXISTS document_types (
  id SERIAL PRIMARY KEY,
  code VARCHAR(100) NOT NULL UNIQUE,
  name VARCHAR(255) NOT NULL,
  section VARCHAR(100),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Student requirement submissions (one per student).
CREATE TABLE IF NOT EXISTS student_requirement_submissions (
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

-- Individual uploaded documents under a submission.
CREATE TABLE IF NOT EXISTS student_documents (
  id SERIAL PRIMARY KEY,
  submission_id INTEGER NOT NULL REFERENCES student_requirement_submissions(id) ON DELETE CASCADE,
  student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  document_type_id INTEGER NOT NULL REFERENCES document_types(id),
  document_name VARCHAR(255),
  file_path TEXT,
  original_name VARCHAR(255),
  mime_type VARCHAR(255),
  file_size INTEGER,
  cloudinary_public_id VARCHAR(255),
  cloudinary_url TEXT,
  resource_type VARCHAR(50) NOT NULL DEFAULT 'raw',
  status VARCHAR(100) NOT NULL DEFAULT 'Uploaded',
  remarks TEXT,
  verified_by INTEGER REFERENCES users(id),
  verified_date TIMESTAMP,
  uploaded_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Audit trail of submission actions.
CREATE TABLE IF NOT EXISTS submission_logs (
  id SERIAL PRIMARY KEY,
  submission_id INTEGER NOT NULL REFERENCES student_requirement_submissions(id) ON DELETE CASCADE,
  actor_id INTEGER REFERENCES users(id),
  action VARCHAR(255) NOT NULL,
  remarks TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- (teacher_batches and teacher_batch_students are created earlier, before
--  student_attendance, because that table has an inline FK to teacher_batches.)

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

-- GPS snapshot captured on every attendance event (check-in / check-out / live).
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
  appeal_date DATE NOT NULL DEFAULT CURRENT_DATE,
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

-- Extra attendance columns (accuracy, per-event coordinates, appeal links, photo).
ALTER TABLE student_attendance ADD COLUMN IF NOT EXISTS check_in_lat NUMERIC(10, 7);
ALTER TABLE student_attendance ADD COLUMN IF NOT EXISTS check_in_lng NUMERIC(13, 7);
ALTER TABLE student_attendance ADD COLUMN IF NOT EXISTS check_out_lat NUMERIC(10, 7);
ALTER TABLE student_attendance ADD COLUMN IF NOT EXISTS check_out_lng NUMERIC(13, 7);
ALTER TABLE student_attendance ADD COLUMN IF NOT EXISTS check_in_accuracy INTEGER;
ALTER TABLE student_attendance ADD COLUMN IF NOT EXISTS check_out_accuracy INTEGER;
ALTER TABLE student_attendance ADD COLUMN IF NOT EXISTS appeal_time_in_id INTEGER REFERENCES attendance_appeals(id) ON DELETE SET NULL;
ALTER TABLE student_attendance ADD COLUMN IF NOT EXISTS appeal_time_out_id INTEGER REFERENCES attendance_appeals(id) ON DELETE SET NULL;
ALTER TABLE students ADD COLUMN IF NOT EXISTS photo_url VARCHAR(512);

-- Deployment requests (from coordinator to supervisor).
CREATE TABLE IF NOT EXISTS deployment_requests (
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

-- Students named on a deployment request.
CREATE TABLE IF NOT EXISTS deployment_request_students (
  id SERIAL PRIMARY KEY,
  deployment_request_id INTEGER NOT NULL REFERENCES deployment_requests(id) ON DELETE CASCADE,
  student_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE (deployment_request_id, student_id)
);

-- Login attempt / lockout tracking.
CREATE TABLE IF NOT EXISTS login_attempts (
  id SERIAL PRIMARY KEY,
  email VARCHAR(255) NOT NULL,
  ip_address VARCHAR(100),
  attempts INTEGER NOT NULL DEFAULT 0,
  last_attempt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  locked_until TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_login_attempts_email ON login_attempts(email);
CREATE INDEX IF NOT EXISTS idx_login_attempts_ip ON login_attempts(ip_address);

-- Baseline performance indexes.
CREATE INDEX IF NOT EXISTS idx_users_role_status ON users(role, status);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_students_user_id ON students(user_id);
CREATE INDEX IF NOT EXISTS idx_admins_user_id ON admins(user_id);
CREATE INDEX IF NOT EXISTS idx_teachers_user_id ON teachers(user_id);
CREATE INDEX IF NOT EXISTS idx_supervisors_user_id ON supervisors(user_id);
CREATE INDEX IF NOT EXISTS idx_coordinators_user_id ON coordinators(user_id);
CREATE INDEX IF NOT EXISTS idx_submission_status ON student_requirement_submissions(status);
CREATE INDEX IF NOT EXISTS idx_teacher_batches_coordinator ON teacher_batches(coordinator_id);
CREATE INDEX IF NOT EXISTS idx_teacher_batches_teacher ON teacher_batches(teacher_id);
CREATE INDEX IF NOT EXISTS idx_deployment_requests_status ON deployment_requests(status);

-- Seed the 10 default requirement document types.
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
  ('student_profile_form', 'Student Profile Form', 'academic')
ON CONFLICT (code) DO NOTHING;

-- Generic uploaded files store.
CREATE TABLE IF NOT EXISTS files (
  id SERIAL PRIMARY KEY,
  student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  original_name VARCHAR(255) NOT NULL,
  cloudinary_public_id VARCHAR(255) NOT NULL,
  cloudinary_url TEXT NOT NULL,
  resource_type VARCHAR(50) NOT NULL DEFAULT 'raw',
  file_size INTEGER,
  mime_type VARCHAR(255),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_files_student_id ON files(student_id);

-- ===========================================================================
-- SECTION 2 - MIGRATIONS 002 .. 026
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 002_attendance_features : tables already created in the baseline above
-- (attendance_config, gps_logs, attendance_appeals). The ALTERs are the delta:
-- ---------------------------------------------------------------------------
ALTER TABLE student_attendance ADD COLUMN IF NOT EXISTS check_in_lat NUMERIC(10, 7);
ALTER TABLE student_attendance ADD COLUMN IF NOT EXISTS check_in_lng NUMERIC(13, 7);
ALTER TABLE student_attendance ADD COLUMN IF NOT EXISTS check_out_lat NUMERIC(10, 7);
ALTER TABLE student_attendance ADD COLUMN IF NOT EXISTS check_out_lng NUMERIC(13, 7);
ALTER TABLE student_attendance ADD COLUMN IF NOT EXISTS check_in_accuracy INTEGER;
ALTER TABLE student_attendance ADD COLUMN IF NOT EXISTS check_out_accuracy INTEGER;
ALTER TABLE student_attendance ADD COLUMN IF NOT EXISTS appeal_time_in_id INTEGER REFERENCES attendance_appeals(id) ON DELETE SET NULL;
ALTER TABLE student_attendance ADD COLUMN IF NOT EXISTS appeal_time_out_id INTEGER REFERENCES attendance_appeals(id) ON DELETE SET NULL;
ALTER TABLE attendance_appeals ADD COLUMN IF NOT EXISTS appeal_date DATE DEFAULT CURRENT_DATE;
ALTER TABLE students ADD COLUMN IF NOT EXISTS photo_url VARCHAR(512);

-- ---------------------------------------------------------------------------
-- 003_add_supervisor_to_teacher_batches
-- ---------------------------------------------------------------------------
ALTER TABLE IF EXISTS teacher_batches
  ADD COLUMN IF NOT EXISTS supervisor_id INTEGER REFERENCES users(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_teacher_batches_supervisor ON teacher_batches(supervisor_id);

-- ---------------------------------------------------------------------------
-- 004_certificates
-- ---------------------------------------------------------------------------
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

-- ---------------------------------------------------------------------------
-- 005_certificate_templates
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS certificate_templates (
  id SERIAL PRIMARY KEY,
  supervisor_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  school_name VARCHAR(255) NOT NULL DEFAULT 'Work Immersion Program',
  company_name VARCHAR(255) NOT NULL DEFAULT 'Host Company',
  program_name VARCHAR(255) NOT NULL DEFAULT 'Work Immersion',
  footer_text TEXT NOT NULL DEFAULT 'Verify this certificate at the issuing institution. This is an official record of work immersion completion.',
  border_color VARCHAR(20) NOT NULL DEFAULT '#1e3a8a',
  title_text VARCHAR(255) NOT NULL DEFAULT 'CERTIFICATE OF COMPLETION',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(supervisor_id)
);

CREATE INDEX IF NOT EXISTS idx_certificate_templates_supervisor ON certificate_templates(supervisor_id);

-- ---------------------------------------------------------------------------
-- 006_admin_module : system settings, audit logs, notifications, evaluations.
-- ---------------------------------------------------------------------------
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

INSERT INTO system_settings (id, system_name)
  SELECT 1, 'Work Immersion Monitoring System'
  WHERE NOT EXISTS (SELECT 1 FROM system_settings WHERE id = 1);

-- ---------------------------------------------------------------------------
-- 007_add_photo_url_to_role_tables
-- ---------------------------------------------------------------------------
ALTER TABLE teachers ADD COLUMN IF NOT EXISTS photo_url VARCHAR(512);
ALTER TABLE supervisors ADD COLUMN IF NOT EXISTS photo_url VARCHAR(512);
ALTER TABLE coordinators ADD COLUMN IF NOT EXISTS photo_url VARCHAR(512);

-- ---------------------------------------------------------------------------
-- 008_add_audit_logs_columns
-- ---------------------------------------------------------------------------
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS module VARCHAR(100);
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT 'success';
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS device TEXT;

CREATE INDEX IF NOT EXISTS idx_audit_logs_module ON audit_logs(module);
CREATE INDEX IF NOT EXISTS idx_audit_logs_status ON audit_logs(status);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_created ON audit_logs(user_id, created_at);

-- ---------------------------------------------------------------------------
-- 009_social_feed
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS feed_posts (
  id SERIAL PRIMARY KEY,
  author_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  post_type VARCHAR(50) NOT NULL DEFAULT 'announcement',
  title VARCHAR(255),
  content TEXT NOT NULL,
  image_url TEXT,
  link_url TEXT,
  link_title VARCHAR(255),
  link_description TEXT,
  link_domain VARCHAR(255),
  link_thumbnail TEXT,
  audience VARCHAR(50) NOT NULL DEFAULT 'all',
  is_pinned BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS feed_comments (
  id SERIAL PRIMARY KEY,
  post_id INTEGER NOT NULL REFERENCES feed_posts(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  parent_comment_id INTEGER REFERENCES feed_comments(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS feed_likes (
  id SERIAL PRIMARY KEY,
  post_id INTEGER NOT NULL REFERENCES feed_posts(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(post_id, user_id)
);

CREATE TABLE IF NOT EXISTS feed_survey_options (
  id SERIAL PRIMARY KEY,
  post_id INTEGER NOT NULL REFERENCES feed_posts(id) ON DELETE CASCADE,
  option_text TEXT NOT NULL,
  option_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS feed_survey_responses (
  id SERIAL PRIMARY KEY,
  post_id INTEGER NOT NULL REFERENCES feed_posts(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  option_id INTEGER NOT NULL REFERENCES feed_survey_options(id) ON DELETE CASCADE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(post_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_feed_posts_author ON feed_posts(author_id);
CREATE INDEX IF NOT EXISTS idx_feed_posts_created ON feed_posts(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_feed_posts_pinned ON feed_posts(is_pinned);
CREATE INDEX IF NOT EXISTS idx_feed_comments_post ON feed_comments(post_id);
CREATE INDEX IF NOT EXISTS idx_feed_likes_post ON feed_likes(post_id);
CREATE INDEX IF NOT EXISTS idx_feed_survey_options_post ON feed_survey_options(post_id);
CREATE INDEX IF NOT EXISTS idx_feed_survey_responses_post ON feed_survey_responses(post_id);

-- ---------------------------------------------------------------------------
-- 010_student_evaluation : rubric categories + student evaluations.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS evaluation_criteria (
  id SERIAL PRIMARY KEY,
  category_name VARCHAR(255) NOT NULL,
  indicators JSONB NOT NULL DEFAULT '[]'::jsonb,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS student_evaluations (
  id SERIAL PRIMARY KEY,
  student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  evaluator_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  batch_id INTEGER,
  category_scores JSONB NOT NULL DEFAULT '{}'::jsonb,
  overall_score NUMERIC(4,2),
  overall_percentage NUMERIC(5,2),
  comments TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_student_evaluations_student ON student_evaluations(student_id);
CREATE INDEX IF NOT EXISTS idx_student_evaluations_evaluator ON student_evaluations(evaluator_id);
CREATE INDEX IF NOT EXISTS idx_student_evaluations_batch ON student_evaluations(batch_id);

INSERT INTO evaluation_criteria (id, category_name, indicators, sort_order) VALUES
(1, 'Teamwork', '["Works cooperatively with team members","Contributes to team goals","Shares information and resources","Respects team members'' ideas and opinions","Resolves conflicts constructively"]', 1),
(2, 'Communication', '["Expresses ideas clearly","Listens actively to others","Follows instructions accurately","Asks for clarification when needed"]', 2),
(3, 'Attendance and Punctuality', '["Arrives on time for work","Attends all scheduled activities","Notifies supervisor of absences promptly"]', 3),
(4, 'Productivity/Resilience', '["Completes tasks within deadlines","Maintains quality of work under pressure","Adapts to changing priorities","Bounces back from setbacks","Manages time effectively","Handles multiple tasks efficiently"]', 4),
(5, 'Initiative/Proactivity', '["Seeks out additional responsibilities","Identifies areas for improvement","Takes initiative without being asked","Offers innovative solutions","Demonstrates self-direction","Volunteers for challenging tasks"]', 5),
(6, 'Judgemental/Decision Making', '["Makes sound decisions","Considers consequences before acting","Seeks guidance when appropriate"]', 6),
(7, 'Dependability/Reliability', '["Completes assigned tasks consistently","Follows through on commitments","Can be trusted with confidential information","Takes responsibility for actions"]', 7),
(8, 'Attitude', '["Demonstrates positive outlook","Shows enthusiasm for work","Accepts constructive feedback","Treats others with respect","Maintains professional demeanor"]', 8),
(9, 'Professionalism', '["Maintains appropriate appearance","Uses professional language","Adheres to company policies","Demonstrates ethical behavior"]', 9)
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 011_work_immersion_schedules
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS work_immersion_schedules (
  id SERIAL PRIMARY KEY,
  teacher_batch_id INTEGER NOT NULL REFERENCES teacher_batches(id) ON DELETE CASCADE,
  supervisor_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  duration_type VARCHAR(20) NOT NULL DEFAULT 'days' CHECK (duration_type IN ('hours', 'days')),
  duration_value INTEGER NOT NULL DEFAULT 80,
  start_date DATE NOT NULL DEFAULT CURRENT_DATE,
  end_date DATE,
  created_by INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (teacher_batch_id, supervisor_id)
);

CREATE INDEX IF NOT EXISTS idx_work_immersion_schedules_batch ON work_immersion_schedules(teacher_batch_id);
CREATE INDEX IF NOT EXISTS idx_work_immersion_schedules_supervisor ON work_immersion_schedules(supervisor_id);

-- ---------------------------------------------------------------------------
-- 012_student_daily_documentation
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS student_daily_documentation (
  id SERIAL PRIMARY KEY,
  student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  teacher_batch_id INTEGER NOT NULL REFERENCES teacher_batches(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  day_number INTEGER NOT NULL CHECK (day_number BETWEEN 1 AND 10),
  file_id INTEGER REFERENCES files(id) ON DELETE SET NULL,
  reasoning TEXT,
  status VARCHAR(50) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'submitted', 'reviewed', 'graded')),
  teacher_score INTEGER CHECK (teacher_score BETWEEN 0 AND 100),
  teacher_feedback TEXT,
  graded_by INTEGER REFERENCES users(id),
  graded_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (student_id, teacher_batch_id, date)
);

CREATE INDEX IF NOT EXISTS idx_daily_doc_student_batch ON student_daily_documentation(student_id, teacher_batch_id);
CREATE INDEX IF NOT EXISTS idx_daily_doc_batch_date ON student_daily_documentation(teacher_batch_id, date);
CREATE INDEX IF NOT EXISTS idx_daily_doc_status ON student_daily_documentation(status);

CREATE TABLE IF NOT EXISTS documentation_criteria (
  id SERIAL PRIMARY KEY,
  criterion_name VARCHAR(255) NOT NULL,
  points INTEGER NOT NULL CHECK (points BETWEEN 0 AND 100),
  description TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_doc_criteria_sort ON documentation_criteria(sort_order);

INSERT INTO documentation_criteria (id, criterion_name, points, description, sort_order) VALUES
  (1, 'Completeness of Daily Entries', 20, 'Student submits documentation for every required immersion day.', 1),
  (2, 'Accuracy of Information', 15, 'Activities, dates, times, and experiences are truthful and correctly recorded.', 2),
  (3, 'Description of Activities', 20, 'Clearly explains what the student actually did during the day.', 3),
  (4, 'Reflection and Learning', 20, 'Explains what the student learned, difficulties encountered, and how the experience improved their skills.', 4),
  (5, 'Relevance to Work Immersion', 10, 'Documentation is related to the assigned workplace, tasks, and learning competencies.', 5),
  (6, 'Organization and Presentation', 5, 'Entries are organized, readable, and properly formatted.', 6),
  (7, 'Professionalism', 5, 'Uses appropriate language and demonstrates professional attitude in documentation.', 7),
  (8, 'Supporting Evidence', 5, 'Includes appropriate evidence when required, such as photos, signatures, task records, or other verification.', 8)
ON CONFLICT (id) DO UPDATE SET
  criterion_name = EXCLUDED.criterion_name,
  points = EXCLUDED.points,
  description = EXCLUDED.description,
  sort_order = EXCLUDED.sort_order,
  updated_at = CURRENT_TIMESTAMP;

-- ---------------------------------------------------------------------------
-- 013_password_reset_tokens
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token VARCHAR(255) NOT NULL UNIQUE,
  expires_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_reset_tokens_token ON password_reset_tokens(token);
CREATE INDEX IF NOT EXISTS idx_reset_tokens_user_id ON password_reset_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_reset_tokens_expires_at ON password_reset_tokens(expires_at);

-- ---------------------------------------------------------------------------
-- 014_immersion_schedule : settings columns + immersion_periods.
-- ---------------------------------------------------------------------------
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

ALTER TABLE teacher_batches ADD COLUMN IF NOT EXISTS immersion_period_id INTEGER REFERENCES immersion_periods(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_teacher_batches_period ON teacher_batches(immersion_period_id);

-- ---------------------------------------------------------------------------
-- 015_period_archive : period-bound users + archive snapshot tables.
-- ---------------------------------------------------------------------------
ALTER TABLE users ADD COLUMN IF NOT EXISTS immersion_period_id INTEGER REFERENCES immersion_periods(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_users_period ON users(immersion_period_id);

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

-- ---------------------------------------------------------------------------
-- 016_attendance_status_present : widen the attendance status CHECK.
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'student_attendance_status_check'
      AND table_name = 'student_attendance'
  ) THEN
    ALTER TABLE student_attendance DROP CONSTRAINT student_attendance_status_check;
  END IF;
END $$;

ALTER TABLE student_attendance
  ADD CONSTRAINT student_attendance_status_check
  CHECK (status IN ('checked_in', 'checked_out', 'absent', 'present'));

-- ---------------------------------------------------------------------------
-- 017_manila_dates : lock all date semantics to Asia/Manila.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION manila_date(ts TIMESTAMPTZ)
RETURNS DATE
LANGUAGE SQL
IMMUTABLE
PARALLEL SAFE
AS $$ SELECT (ts AT TIME ZONE 'Asia/Manila')::DATE; $$;

CREATE OR REPLACE FUNCTION manila_today()
RETURNS DATE
LANGUAGE SQL
STABLE
AS $$ SELECT (NOW() AT TIME ZONE 'Asia/Manila')::DATE; $$;

DO $$
BEGIN
  EXECUTE format('ALTER DATABASE %I SET TIMEZONE TO %L', current_database(), 'Asia/Manila');
EXCEPTION WHEN insufficient_privilege THEN
  RAISE NOTICE 'Skipping ALTER DATABASE (insufficient privilege). Set TIMEZONE in server config or per-session.';
END $$;

-- ---------------------------------------------------------------------------
-- 018_normalize_student_registration_fields
-- ---------------------------------------------------------------------------
UPDATE users
SET phone = ''
WHERE role = 'student' AND phone IS NULL;

UPDATE students
SET middle_name = COALESCE(middle_name, ''),
    gender = COALESCE(gender, ''),
    contact_number = COALESCE(contact_number, ''),
    email = COALESCE(email, ''),
    grade_level = '12',
    section = COALESCE(section, ''),
    track_strand = COALESCE(track_strand, ''),
    school = COALESCE(school, '')
WHERE middle_name IS NULL
   OR gender IS NULL
   OR contact_number IS NULL
   OR email IS NULL
   OR grade_level IS NULL
   OR grade_level <> '12'
   OR section IS NULL
   OR track_strand IS NULL
   OR school IS NULL;

ALTER TABLE students
   ALTER COLUMN grade_level SET DEFAULT '12',
   ALTER COLUMN grade_level SET NOT NULL;

-- ---------------------------------------------------------------------------
-- 019_allow_multiple_batches_per_teacher
-- ---------------------------------------------------------------------------
ALTER TABLE IF EXISTS teacher_batches
  DROP CONSTRAINT IF EXISTS teacher_batches_teacher_id_key;
CREATE INDEX IF NOT EXISTS idx_teacher_batches_teacher ON teacher_batches(teacher_id);

-- ---------------------------------------------------------------------------
-- 019_grade_appeals
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS grade_appeals (
  id SERIAL PRIMARY KEY,
  student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  evaluation_id INTEGER NOT NULL REFERENCES student_evaluations(id) ON DELETE CASCADE,
  batch_id INTEGER,
  category_id INTEGER REFERENCES evaluation_criteria(id) ON DELETE SET NULL,
  reason TEXT NOT NULL,
  status VARCHAR(50) NOT NULL DEFAULT 'pending',
  supervisor_response TEXT,
  reviewed_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_grade_appeals_student ON grade_appeals(student_id);
CREATE INDEX IF NOT EXISTS idx_grade_appeals_evaluation ON grade_appeals(evaluation_id);
CREATE INDEX IF NOT EXISTS idx_grade_appeals_status ON grade_appeals(status);
CREATE INDEX IF NOT EXISTS idx_grade_appeals_batch ON grade_appeals(batch_id);

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS update_grade_appeals_updated_at ON grade_appeals;
CREATE TRIGGER update_grade_appeals_updated_at
  BEFORE UPDATE ON grade_appeals
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ---------------------------------------------------------------------------
-- 020_automated_documentation_grading
-- ---------------------------------------------------------------------------
ALTER TABLE student_daily_documentation
  ADD COLUMN IF NOT EXISTS submitted_at TIMESTAMP,
  ADD COLUMN IF NOT EXISTS auto_score NUMERIC(5,2),
  ADD COLUMN IF NOT EXISTS auto_stars SMALLINT CHECK (auto_stars BETWEEN 1 AND 4),
  ADD COLUMN IF NOT EXISTS auto_label VARCHAR(50),
  ADD COLUMN IF NOT EXISTS auto_breakdown JSONB,
  ADD COLUMN IF NOT EXISTS auto_scored_at TIMESTAMP;

CREATE INDEX IF NOT EXISTS idx_daily_doc_auto_stars ON student_daily_documentation(auto_stars);

-- ---------------------------------------------------------------------------
-- 020_editable_document_types
-- ---------------------------------------------------------------------------
ALTER TABLE document_types
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS sort_order INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS description TEXT;

WITH ordered AS (
  SELECT id, ROW_NUMBER() OVER (ORDER BY id) * 10 AS seq
  FROM document_types
)
UPDATE document_types dt
SET sort_order = ordered.seq
FROM ordered
WHERE dt.id = ordered.id
  AND dt.sort_order = 0;

CREATE INDEX IF NOT EXISTS idx_document_types_active
  ON document_types (is_active, sort_order);

-- ---------------------------------------------------------------------------
-- 021_announcement_audiences
-- ---------------------------------------------------------------------------
UPDATE feed_posts
SET audience = 'student'
WHERE audience = 'grade_12';

ALTER TABLE feed_posts
  DROP CONSTRAINT IF EXISTS feed_posts_audience_check;

ALTER TABLE feed_posts
  ADD CONSTRAINT feed_posts_audience_check
  CHECK (audience IN ('all', 'student', 'teacher', 'supervisor', 'coordinator'));

-- ---------------------------------------------------------------------------
-- 021_star_rating_grading : replaces automated scoring with teacher star ratings.
-- ---------------------------------------------------------------------------
ALTER TABLE student_daily_documentation
  ADD COLUMN IF NOT EXISTS criteria_ratings JSONB,
  ADD COLUMN IF NOT EXISTS final_stars SMALLINT CHECK (final_stars BETWEEN 1 AND 4),
  ADD COLUMN IF NOT EXISTS final_label VARCHAR(50);

ALTER TABLE student_daily_documentation
  DROP COLUMN IF EXISTS auto_score,
  DROP COLUMN IF EXISTS auto_stars,
  DROP COLUMN IF EXISTS auto_label,
  DROP COLUMN IF EXISTS auto_breakdown,
  DROP COLUMN IF EXISTS auto_scored_at;

CREATE INDEX IF NOT EXISTS idx_daily_doc_final_stars ON student_daily_documentation(final_stars);

-- ---------------------------------------------------------------------------
-- 022_coordinator_labelled_batches
-- ---------------------------------------------------------------------------
UPDATE deployment_requests
SET batch_label = 'Awaiting coordinator'
WHERE direction = 'supervisor_to_coordinator'
  AND status <> 'fulfilled'
  AND (batch_label IS NULL OR batch_label = '');

ALTER TABLE deployment_requests
  ADD COLUMN IF NOT EXISTS teacher_batch_id INTEGER
  REFERENCES teacher_batches(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_deployment_requests_batch
  ON deployment_requests (teacher_batch_id);

-- ---------------------------------------------------------------------------
-- 023_holidays_blocked_dates : Philippine holidays + supervisor-blocked dates.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ph_holidays (
  id SERIAL PRIMARY KEY,
  holiday_date DATE NOT NULL,
  name VARCHAR(120) NOT NULL,
  is_regular BOOLEAN NOT NULL DEFAULT FALSE,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_ph_holidays_date ON ph_holidays (holiday_date);
CREATE INDEX IF NOT EXISTS idx_ph_holidays_date ON ph_holidays (holiday_date);

CREATE TABLE IF NOT EXISTS work_immersion_blocked_dates (
  id SERIAL PRIMARY KEY,
  teacher_batch_id INTEGER NOT NULL REFERENCES teacher_batches(id) ON DELETE CASCADE,
  supervisor_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  blocked_date DATE NOT NULL,
  reason VARCHAR(200),
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_immersion_blocked_unique
  ON work_immersion_blocked_dates (teacher_batch_id, supervisor_id, blocked_date)
  WHERE supervisor_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS ux_immersion_blocked_batch_null
  ON work_immersion_blocked_dates (teacher_batch_id, blocked_date)
  WHERE supervisor_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_immersion_blocked_batch
  ON work_immersion_blocked_dates (teacher_batch_id, blocked_date);

-- Seed: only law-fixed dates (movable feasts are added via the UI each year).
INSERT INTO ph_holidays (holiday_date, name, is_regular) VALUES
  (DATE '2024-01-01', 'New Year''s Day', true),
  (DATE '2024-04-09', 'Araw ng Kagitingan (Rizal Day)', true),
  (DATE '2024-05-01', 'Labor Day', true),
  (DATE '2024-06-12', 'Independence Day', true),
  (DATE '2024-08-21', 'Ninoy Aquino Day', false),
  (DATE '2024-11-30', 'Bonifacio Day', true),
  (DATE '2024-12-25', 'Christmas Day', true),
  (DATE '2024-12-30', 'Rizal Day', true),
  (DATE '2024-12-31', 'New Year''s Eve', false),
  (DATE '2025-01-01', 'New Year''s Day', true),
  (DATE '2025-04-09', 'Araw ng Kagitingan (Rizal Day)', true),
  (DATE '2025-05-01', 'Labor Day', true),
  (DATE '2025-06-12', 'Independence Day', true),
  (DATE '2025-08-21', 'Ninoy Aquino Day', false),
  (DATE '2025-11-30', 'Bonifacio Day', true),
  (DATE '2025-12-25', 'Christmas Day', true),
  (DATE '2025-12-30', 'Rizal Day', true),
  (DATE '2025-12-31', 'New Year''s Eve', false),
  (DATE '2026-01-01', 'New Year''s Day', true),
  (DATE '2026-04-09', 'Araw ng Kagitingan (Rizal Day)', true),
  (DATE '2026-05-01', 'Labor Day', true),
  (DATE '2026-06-12', 'Independence Day', true),
  (DATE '2026-08-21', 'Ninoy Aquino Day', false),
  (DATE '2026-11-30', 'Bonifacio Day', true),
  (DATE '2026-12-25', 'Christmas Day', true),
  (DATE '2026-12-30', 'Rizal Day', true),
  (DATE '2026-12-31', 'New Year''s Eve', false)
ON CONFLICT (holiday_date) DO NOTHING;

DO $$
DECLARE
  y INTEGER;
  last_monday DATE;
BEGIN
  FOR y IN 2024..2030 LOOP
    last_monday := make_date(y, 8, 31) - ((EXTRACT(DOW FROM make_date(y, 8, 31))::INTEGER + 6) % 7);
    INSERT INTO ph_holidays (holiday_date, name, is_regular)
    VALUES (last_monday, 'National Heroes Day', true)
    ON CONFLICT (holiday_date) DO NOTHING;
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- 024_batch_certificate_templates : per-batch designs.
-- ---------------------------------------------------------------------------
ALTER TABLE certificate_templates
  ADD COLUMN IF NOT EXISTS teacher_batch_id INTEGER
    REFERENCES teacher_batches(id) ON DELETE CASCADE;

ALTER TABLE certificate_templates
  DROP CONSTRAINT IF EXISTS certificate_templates_supervisor_id_key;

CREATE UNIQUE INDEX IF NOT EXISTS ux_certificate_templates_batch
  ON certificate_templates (teacher_batch_id)
  WHERE teacher_batch_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS ux_certificate_templates_supervisor_default
  ON certificate_templates (supervisor_id)
  WHERE teacher_batch_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_certificate_templates_lookup
  ON certificate_templates (supervisor_id, teacher_batch_id);

ALTER TABLE certificates
  ADD COLUMN IF NOT EXISTS teacher_batch_id INTEGER
    REFERENCES teacher_batches(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_certificates_batch
  ON certificates (teacher_batch_id);

-- ---------------------------------------------------------------------------
-- 025_maintenance_mode
-- ---------------------------------------------------------------------------
ALTER TABLE system_settings
  ADD COLUMN IF NOT EXISTS maintenance_mode BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE system_settings
  ADD COLUMN IF NOT EXISTS maintenance_message TEXT;
ALTER TABLE system_settings
  ADD COLUMN IF NOT EXISTS maintenance_started_at TIMESTAMP;
ALTER TABLE system_settings
  ADD COLUMN IF NOT EXISTS maintenance_estimated_end TIMESTAMP;

-- ---------------------------------------------------------------------------
-- 026_security_hardening
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS refresh_tokens (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash VARCHAR(128) NOT NULL UNIQUE,
  jti VARCHAR(64) NOT NULL,
  ip_address VARCHAR(100),
  user_agent TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMP NOT NULL,
  revoked_at TIMESTAMP,
  replaced_by VARCHAR(64)
);

CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user_id ON refresh_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_token_hash ON refresh_tokens(token_hash);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_jti ON refresh_tokens(jti);

CREATE TABLE IF NOT EXISTS revoked_tokens (
  id SERIAL PRIMARY KEY,
  jti VARCHAR(64) NOT NULL UNIQUE,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  reason VARCHAR(120),
  revoked_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMP NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_revoked_tokens_jti ON revoked_tokens(jti);
CREATE INDEX IF NOT EXISTS idx_revoked_tokens_expires_at ON revoked_tokens(expires_at);

CREATE TABLE IF NOT EXISTS csrf_secrets (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  secret_hash VARCHAR(128) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMP NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_csrf_secrets_user_id ON csrf_secrets(user_id);

CREATE TABLE IF NOT EXISTS security_events (
  id SERIAL PRIMARY KEY,
  event_type VARCHAR(60) NOT NULL,
  severity VARCHAR(20) NOT NULL DEFAULT 'info',
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  email VARCHAR(255),
  ip_address VARCHAR(100),
  user_agent TEXT,
  path VARCHAR(500),
  method VARCHAR(10),
  detail TEXT,
  metadata JSONB,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_security_events_type ON security_events(event_type);
CREATE INDEX IF NOT EXISTS idx_security_events_ip ON security_events(ip_address);
CREATE INDEX IF NOT EXISTS idx_security_events_email ON security_events(email);
CREATE INDEX IF NOT EXISTS idx_security_events_created_at ON security_events(created_at);

CREATE TABLE IF NOT EXISTS file_upload_audit (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  original_name VARCHAR(500),
  detected_mime VARCHAR(150),
  declared_mime VARCHAR(150),
  file_size INTEGER,
  decision VARCHAR(20) NOT NULL DEFAULT 'accepted',
  reason VARCHAR(255),
  ip_address VARCHAR(100),
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_file_upload_audit_user_id ON file_upload_audit(user_id);
CREATE INDEX IF NOT EXISTS idx_file_upload_audit_decision ON file_upload_audit(decision);

ALTER TABLE login_attempts
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP;

CREATE INDEX IF NOT EXISTS idx_login_attempts_ip ON login_attempts(ip_address);

-- ===========================================================================
-- SECTION 3 - RUNTIME-ONLY TABLES / COLUMNS
-- These are created on demand by ensure*Schema() guards in controllers and
-- services and have NO numbered migration file. They MUST be included or the
-- related features will 42P01 (undefined_table) on a clean database.
-- ===========================================================================

-- chat.controller.js -> ensureChatTables()
CREATE TABLE IF NOT EXISTS batch_group_messages (
  id SERIAL PRIMARY KEY,
  teacher_batch_id INTEGER NOT NULL REFERENCES teacher_batches(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS batch_group_message_replies (
  id SERIAL PRIMARY KEY,
  parent_message_id INTEGER NOT NULL REFERENCES batch_group_messages(id) ON DELETE CASCADE,
  teacher_batch_id INTEGER NOT NULL REFERENCES teacher_batches(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE batch_group_messages
  ADD COLUMN IF NOT EXISTS parent_message_id INTEGER REFERENCES batch_group_messages(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS deleted_by_user_ids INTEGER[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS reactions JSONB DEFAULT '{}';

ALTER TABLE batch_group_message_replies
  ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS deleted_by_user_ids INTEGER[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS reactions JSONB DEFAULT '{}';

CREATE INDEX IF NOT EXISTS idx_batch_group_messages_batch
  ON batch_group_messages(teacher_batch_id, created_at);
CREATE INDEX IF NOT EXISTS idx_batch_group_message_replies_parent
  ON batch_group_message_replies(parent_message_id, created_at);

-- supervisor.controller.js -> ensureSupervisorReportsTable()
CREATE TABLE IF NOT EXISTS supervisor_reports (
  id SERIAL PRIMARY KEY,
  supervisor_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  batch_id INTEGER,
  batch_source VARCHAR(30) NOT NULL DEFAULT 'deployment',
  teacher_id INTEGER,
  category VARCHAR(80) NOT NULL,
  priority VARCHAR(20) NOT NULL DEFAULT 'normal',
  message TEXT NOT NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'open',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_supervisor_reports_supervisor ON supervisor_reports(supervisor_id);
CREATE INDEX IF NOT EXISTS idx_supervisor_reports_student ON supervisor_reports(student_id);

-- notification.service.js -> ensureNotificationSchema() (extra columns)
ALTER TABLE notifications
  ADD COLUMN IF NOT EXISTS category VARCHAR(50) NOT NULL DEFAULT 'general',
  ADD COLUMN IF NOT EXISTS priority VARCHAR(20) NOT NULL DEFAULT 'normal',
  ADD COLUMN IF NOT EXISTS entity_type VARCHAR(50),
  ADD COLUMN IF NOT EXISTS entity_id INTEGER,
  ADD COLUMN IF NOT EXISTS event_key VARCHAR(255),
  ADD COLUMN IF NOT EXISTS read_at TIMESTAMP;

CREATE INDEX IF NOT EXISTS idx_notifications_user_unread
  ON notifications(user_id, is_read, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_user_created
  ON notifications(user_id, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_notifications_user_event
  ON notifications(user_id, event_key)
  WHERE event_key IS NOT NULL;

-- evaluation.controller.js -> ensureEvaluationTables() (extra column)
ALTER TABLE student_evaluations
  ADD COLUMN IF NOT EXISTS overall_percentage NUMERIC(5,2);

-- 019_allow_multiple_batches_per_teacher runtime cleanup (kept idempotent)
DELETE FROM work_immersion_schedules
WHERE supervisor_id IS NULL
  AND id NOT IN (
    SELECT MAX(id) FROM work_immersion_schedules
    WHERE supervisor_id IS NULL
    GROUP BY teacher_batch_id
  );

-- ===========================================================================
-- SECTION 4 - OPTIONAL: Row Level Security note
-- ===========================================================================
-- The Node backend connects to Postgres with the database role directly and
-- enforces authorization at the API layer, so NO RLS policies are required for
-- the app to function. Supabase enables RLS by default only when you turn it
-- on, and newly created tables via the SQL editor are NOT auto-RLS-enabled.
--
-- If you later expose these tables through supabase-js / the anon key, enable
-- RLS and add explicit policies per table, for example:
--
--   ALTER TABLE users ENABLE ROW LEVEL SECURITY;
--   -- (then add CREATE POLICY statements appropriate to your access model)
--
-- Do NOT enable RLS blindly: with RLS on and no policies, the anon key will see
-- zero rows, and the Node backend (if it uses the anon role) would break.
--
-- ===========================================================================
-- END OF MIGRATION
-- ===========================================================================
