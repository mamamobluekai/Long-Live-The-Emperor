UPDATE feed_posts
SET audience = 'student'
WHERE audience = 'grade_12';

ALTER TABLE feed_posts
  DROP CONSTRAINT IF EXISTS feed_posts_audience_check;

ALTER TABLE feed_posts
  ADD CONSTRAINT feed_posts_audience_check
  CHECK (audience IN ('all', 'student', 'teacher', 'supervisor', 'coordinator'));
