-- ===========================================================================
-- 028 - Seed an approved student account (dexterrilles06@gmail.com)
-- ===========================================================================
--  Run in Supabase Dashboard -> SQL Editor, or with psql.
--
--  Login: dexterrilles06@gmail.com / password123
--
--  Notes:
--   * The hash is bcrypt cost 12, matching utils/hashPassword.js (SALT_ROUNDS).
--     Verified to match the literal password "password123".
--   * status is 'approved' so the account can sign in immediately. Login rejects
--     anything other than 'approved'/'pending' - see user.controller.js.
--   * email is stored lowercase because the registration endpoint normalises to
--     lowercase (normalizeEmail) and the login query matches exactly.
--   * Idempotent: re-running resets the password to the one below and refreshes
--     the profile fields without creating a duplicate account.
-- ===========================================================================

BEGIN;

-- 1. The auth row. `users.id` is generated, so the profile row below is created
--    from a subquery rather than a hardcoded id.
INSERT INTO users (email, password, role, status, phone)
VALUES (
  'dexterrilles06@gmail.com',
  '$2b$12$zahNctGfhp3nq14L6ffx4uqlSEuf0LbsbiopC9oT1HnWmtDvQAo0S',
  'student',
  'approved',
  NULL
)
ON CONFLICT (email) DO UPDATE
  SET password    = EXCLUDED.password,
      role        = 'student',
      status      = 'approved',
      updated_at  = CURRENT_TIMESTAMP;

-- 2. The matching students profile. `students.user_id` is UNIQUE with a FK to
--    users(id), so ON CONFLICT (user_id) keeps a re-run from erroring.
INSERT INTO students
  (user_id, student_number, first_name, middle_name, last_name, grade_level,
   section, track_strand, school, contact_number, gender, email)
SELECT
  u.id, 'STU-028', 'Dexter', NULL, 'Rilles', '12',
  '', '', '', NULL, '', u.email
FROM users u
WHERE u.email = 'dexterrilles06@gmail.com'
ON CONFLICT (user_id) DO UPDATE
  SET first_name     = EXCLUDED.first_name,
      last_name      = EXCLUDED.last_name,
      student_number = EXCLUDED.student_number;

COMMIT;

-- 3. Verify: expect status = approved and a bcrypt hash starting $2b$12$.
SELECT u.id, u.email, u.role, u.status, s.student_number, s.first_name, s.last_name
FROM users u
LEFT JOIN students s ON s.user_id = u.id
WHERE u.email = 'dexterrilles06@gmail.com';