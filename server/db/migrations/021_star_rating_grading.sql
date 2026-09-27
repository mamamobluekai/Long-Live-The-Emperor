-- 021: Replace automated documentation scoring with teacher star ratings
--
-- The teacher rates every grading criterion with 1-5 stars; the grade is then
-- derived from those ratings, weighted by each criterion's points.
-- The auto_* columns from migration 020 are no longer used and are dropped.

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
