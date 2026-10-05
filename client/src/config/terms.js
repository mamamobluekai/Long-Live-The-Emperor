// Work Immersion Monitoring System Terms and Agreement.
//
// Kept as data rather than JSX inside the modal so the agreement is a single
// source of truth that can also be re-rendered anywhere else without copy-paste
// drift.
export const TERMS_SECTIONS = [
  {
    title: 'Welcome',
    body: [
      'Welcome to the Work Immersion Monitoring System. By creating an account and using this system, you acknowledge that you have read, understood, and agreed to the following terms and conditions.',
    ],
  },
  {
    title: '1. Account Registration',
    body: [
      'Users are required to provide accurate and complete information during registration. Student information may be verified against the official student records provided by the school. Users are responsible for ensuring that the information associated with their account is correct.',
    ],
  },
  {
    title: '2. Account Security',
    body: [
      'Users are responsible for maintaining the confidentiality of their account credentials. Passwords and other account information must not be shared with other individuals. Any activity performed using a user\u2019s account may be associated with that account.',
    ],
  },
  {
    title: '3. Appropriate Use',
    body: [
      'The system is intended solely for authorized Work Immersion and school-related activities. Users agree to use the system responsibly and only for its intended purposes, including attendance recording, requirement submission, deployment monitoring, daily logs, evaluations, and progress monitoring.',
    ],
  },
  {
    title: '4. Information and Document Submission',
    body: [
      'Users agree to provide truthful and appropriate information and to submit legitimate documents related to their Work Immersion activities. Users must not submit false, misleading, unauthorized, or inappropriate content.',
    ],
  },
  {
    title: '5. Attendance and Location Monitoring',
    body: [
      'Users agree to provide accurate attendance information. When enabled for Work Immersion monitoring, the system may collect and process location information to support authorized monitoring activities.',
    ],
  },
  {
    title: '6. Monitoring and Evaluation',
    body: [
      'Information submitted through the system, including attendance records, daily logs, requirements, location information, and evaluations, may be accessed by authorized school personnel and Work Immersion supervisors for legitimate monitoring, assessment, and administrative purposes.',
    ],
  },
  {
    title: '7. Privacy and Data Use',
    body: [
      'Information collected through the system will be used for authorized school and Work Immersion purposes. Users are expected to respect the privacy of other users and must not access, copy, modify, disclose, or distribute information without proper authorization.',
    ],
  },
  {
    title: '8. Prohibited Activities',
    body: [
      'Users must not:',
    ],
    list: [
      'Use another person\u2019s account or credentials.',
      'Provide false or misleading information.',
      'Manipulate attendance or other system records.',
      'Submit unauthorized or inappropriate files.',
      'Attempt to access restricted information or system functions.',
      'Modify or interfere with system data or functionality.',
      'Use the system for purposes unrelated to Work Immersion or authorized school activities.',
    ],
  },
  {
    title: '9. Account Management',
    body: [
      'The school or authorized system administrators may approve, reject, suspend, or restrict user accounts when necessary, including cases involving inaccurate information, unauthorized use, or violations of these terms.',
    ],
  },
  {
    title: '10. Acceptance of Terms',
    body: [
      'By selecting \u201cI Agree\u201d and proceeding with account registration, you confirm that you have read and understood these Terms and Agreement and agree to comply with them while using the Work Immersion Monitoring System.',
    ],
  },
];

export const TERMS_ACKNOWLEDGEMENT =
  'I have read, understood, and agree to the Terms and Agreement.';