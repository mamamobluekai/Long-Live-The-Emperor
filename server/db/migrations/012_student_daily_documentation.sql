-- Migration: Student Daily Documentation and Documentation Criteria (012)

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
