-- Seed 10 APPROVED supervisors, all with the password: password123
-- Password below is a bcrypt hash (cost 12) of 'password123'.
-- Employee IDs start at SUP-1001 because SUP-0001..0010 are already taken
-- by existing supervisors (supervisors.employee_id is UNIQUE).
-- Run against work_immersion_db. Safe to re-run.
--
-- Run this as a SCRIPT (psql -f, or "Execute script" in your DB tool), not
-- statement-by-statement in one tab. It opens its own transaction; if an
-- earlier run failed, the ROLLBACK below clears the aborted transaction first
-- (SQLSTATE 25P02) instead of failing every following statement.

ROLLBACK;

BEGIN;

CREATE TEMP TABLE seed_supervisors (
    employee_id  VARCHAR(100),
    first_name   VARCHAR(100),
    last_name    VARCHAR(100),
    email        VARCHAR(255),
    company_name VARCHAR(255),
    designation  VARCHAR(255),
    department   VARCHAR(255),
    phone        VARCHAR(50)
) ON COMMIT DROP;

INSERT INTO seed_supervisors (employee_id, first_name, last_name, email, company_name, designation, department, phone)
VALUES
    ('SUP-1001', 'Ana',     'Reyes',     'supervisor01@wims.edu.ph', 'Marinduque State University', 'HR Manager',       'Human Resource Management', '09171234501'),
    ('SUP-1002', 'Miguel',  'Santos',    'supervisor02@wims.edu.ph', 'St. Mary Trading',           'Branch Manager',   'Operations',                '09171234502'),
    ('SUP-1003', 'Carla',   'Bautista',  'supervisor03@wims.edu.ph', 'Marinduque Electric Coop',   'Accountant',       'Finance',                   '09171234503'),
    ('SUP-1004', 'Jose',    'Villanueva','supervisor04@wims.edu.ph', 'Boat Builders Inc',          'Overseeing',       'Production',                '09171234504'),
    ('SUP-1005', 'Grace',   'Dela Cruz', 'supervisor05@wims.edu.ph', 'Town Tourism Office',        'Tourism Officer',  'Front Desk',                '09171234505'),
    ('SUP-1006', 'Rico',    'Mendoza',   'supervisor06@wims.edu.ph', 'Mendoza Rice Mill',          'Plant Supervisor', 'Production',                '09171234506'),
    ('SUP-1007', 'Lea',     'Aquino',    'supervisor07@wims.edu.ph', 'Calapan Medical Center',     'Nursing Supervisor','Health Care',               '09171234507'),
    ('SUP-1008', 'Paolo',   'Garcia',    'supervisor08@wims.edu.ph', 'Island Pharmacy',            'Pharmacist',       'Sales',                     '09171234508'),
    ('SUP-1009', 'Nina',    'Torres',    'supervisor09@wims.edu.ph', 'Torres Printing Press',      'Press Operator',   'Operations',                '09171234509'),
    ('SUP-1010', 'Mark',    'Lopez',     'supervisor10@wims.edu.ph', 'Lopez Auto Shop',            'Service Advisor',  'Sales',                     '09171234510');

-- 1. Create the login accounts
INSERT INTO users (email, password, role, phone, status)
SELECT s.email,
       '$2b$12$HEgXBz/kgGVoMR1mWzHcceWxvPaOKSUVbFWhs.c0uZJ/PNqya9zSm',
       'supervisor',
       s.phone,
       'approved'
FROM seed_supervisors s
ON CONFLICT (email) DO NOTHING;

-- 2. Create the supervisor profiles
INSERT INTO supervisors (user_id, first_name, last_name, employee_id, company_name, designation, department)
SELECT u.id, s.first_name, s.last_name, s.employee_id, s.company_name, s.designation, s.department
FROM seed_supervisors s
JOIN users u ON u.email = s.email
WHERE NOT EXISTS (
    SELECT 1 FROM supervisors sup WHERE sup.user_id = u.id
);

COMMIT;

-- Verify: should return 10 approved supervisors
SELECT u.id, u.email, u.status, sup.employee_id, sup.first_name, sup.last_name,
       sup.company_name, sup.designation
FROM users u
JOIN supervisors sup ON sup.user_id = u.id
WHERE u.role = 'supervisor' AND u.status = 'approved'
ORDER BY sup.employee_id;
