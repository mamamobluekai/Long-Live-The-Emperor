CREATE TABLE IF NOT EXISTS attendance_push_subscriptions (
  id BIGSERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL UNIQUE,
  subscription JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_attendance_push_subscriptions_user
  ON attendance_push_subscriptions(user_id);

CREATE TABLE IF NOT EXISTS attendance_push_reminders (
  id BIGSERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  teacher_batch_id INTEGER NOT NULL REFERENCES teacher_batches(id) ON DELETE CASCADE,
  reminder_date DATE NOT NULL,
  reminder_type VARCHAR(10) NOT NULL CHECK (reminder_type IN ('time_in', 'time_out')),
  sent_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (user_id, teacher_batch_id, reminder_date, reminder_type)
);
