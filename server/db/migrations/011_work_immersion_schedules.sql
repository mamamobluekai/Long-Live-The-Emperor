-- Migration: Work Immersion Schedules (011)

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
