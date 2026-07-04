const requiredInfoFields = [
  'student_number', 'first_name', 'last_name', 'gender', 'birthdate', 'age',
  'contact_number', 'email', 'home_address', 'grade_level', 'section',
  'track_strand', 'school', 'preferred_industry', 'career_goal', 'industry_reason',
  'guardian_name', 'guardian_relationship', 'guardian_contact', 'guardian_email',
  'guardian_address', 'emergency_contact', 'emergency_contact_number',
];

const requiredDocumentCodes = [
  'guardian_consent',
  'medical_certificate',
  'accident_insurance',
  'vaccination_record',
  'emergency_contact_form',
  'form_138',
  'good_moral',
  'psa_birth_certificate',
  'id_picture',
  'student_profile_form',
];

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const phoneRegex = /^[0-9+\-\s()]{7,20}$/;

module.exports = {
  requiredInfoFields,
  requiredDocumentCodes,
  emailRegex,
  phoneRegex,
};