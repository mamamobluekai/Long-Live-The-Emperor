-- ===========================================================================
-- 027 - Seed the primary admin account (admin1@wims.edu.ph)
-- ===========================================================================
--  Run in Supabase Dashboard -> SQL Editor. Idempotent: safe to run twice.
--  Bootstrap password: "password 123" (bcrypt, cost 10 - same format the Node
--  backend uses). This is applied ONLY when the account is first created -- see
--  the ON CONFLICT clause below for why re-runs must never reset it.
-- ===========================================================================

BEGIN;

-- 1. Create / repair the auth row.
--    status must be 'approved': that is the value the rest of the app writes
--    (see seed_approved_supervisors.sql). Login only rejects 'pending' and
--    'disapproved', so 'approved' is the safe, conventional choice.
--    DO UPDATE deliberately does NOT touch `password`: re-running this file must
--    never roll a live admin's changed password back to the published default.
--    It only repairs role/status so a mis-stamped row still becomes usable.
INSERT INTO users (email, password, role, status, phone)
VALUES ('admin1@wims.edu.ph', '$2b$10$hjmr8VEd/D1BTmu8oSXuXujqXf2n.Xh.yR6zb4YFIRrgfYs9bpdn2', 'admin', 'approved', NULL)
ON CONFLICT (email) DO UPDATE
  SET role    = 'admin',
      status  = 'approved',
      updated_at = CURRENT_TIMESTAMP;

-- 2. Make sure the matching admins profile row exists.
INSERT INTO admins (user_id, first_name, last_name, employee_id, department)
SELECT u.id, 'Admin', 'User', 'ADM-001', 'Administration'
FROM users u
WHERE u.email = 'admin1@wims.edu.ph'
ON CONFLICT (user_id) DO NOTHING;

COMMIT;

-- 3. Reset the admin password to the default bootstrap value.
--    Run this ALONE, only if the password is genuinely lost. It is destructive:
--    anyone holding a session for this account keeps it, so rotate/re-login
--    afterwards. Change the hash before using it anywhere real.
--
--    UPDATE users
--    SET password = '$2b$10$hjmr8VEd/D1BTmu8oSXuXujqXf2n.Xh.yR6zb4YFIRrgfYs9bpdn2',
--        updated_at = CURRENT_TIMESTAMP
--    WHERE email = 'admin1@wims.edu.ph';

-- 4. Verify.
SELECT u.id, u.email, u.role, u.status, a.first_name, a.last_name
FROM users u
LEFT JOIN admins a ON a.user_id = u.id
WHERE u.email = 'admin1@wims.edu.ph';
