-- Normalize optional student registration/import fields so new and existing records use empty strings instead of NULL.
UPDATE users
SET phone = ''
WHERE role = 'student' AND phone IS NULL;

UPDATE students
SET middle_name = COALESCE(middle_name, ''),
    gender = COALESCE(gender, ''),
    contact_number = COALESCE(contact_number, ''),
    email = COALESCE(email, ''),
   grade_level = '12',
    section = COALESCE(section, ''),
    track_strand = COALESCE(track_strand, ''),
    school = COALESCE(school, '')
WHERE middle_name IS NULL
   OR gender IS NULL
   OR contact_number IS NULL
   OR email IS NULL
   OR grade_level IS NULL
   OR grade_level <> '12'
   OR section IS NULL
   OR track_strand IS NULL
   OR school IS NULL;

ALTER TABLE students
   ALTER COLUMN grade_level SET DEFAULT '12',
   ALTER COLUMN grade_level SET NOT NULL;
