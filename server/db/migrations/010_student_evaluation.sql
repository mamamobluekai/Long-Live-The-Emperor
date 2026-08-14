-- Migration: Student Evaluation Criteria and Evaluations (010)

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
