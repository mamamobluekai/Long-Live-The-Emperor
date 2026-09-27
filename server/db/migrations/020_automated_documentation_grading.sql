-- 020: Automated daily-documentation grading
-- Stores the computed score, the 4-point star rating, and the per-criterion
-- breakdown so the teacher dashboard can show stars instead of a typed number.

ALTER TABLE student_daily_documentation
  ADD COLUMN IF NOT EXISTS submitted_at TIMESTAMP,
  ADD COLUMN IF NOT EXISTS auto_score NUMERIC(5,2),
  ADD COLUMN IF NOT EXISTS auto_stars SMALLINT CHECK (auto_stars BETWEEN 1 AND 4),
  ADD COLUMN IF NOT EXISTS auto_label VARCHAR(50),
  ADD COLUMN IF NOT EXISTS auto_breakdown JSONB,
  ADD COLUMN IF NOT EXISTS auto_scored_at TIMESTAMP;

CREATE INDEX IF NOT EXISTS idx_daily_doc_auto_stars ON student_daily_documentation(auto_stars);
