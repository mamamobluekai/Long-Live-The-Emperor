-- Grade Appeals System
-- Allows students to appeal their evaluation grades
-- Supervisors can review and respond to appeals

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

-- Add trigger to update updated_at
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