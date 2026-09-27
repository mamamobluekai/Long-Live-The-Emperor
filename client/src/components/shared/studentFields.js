// Shared student display helpers used by the student tables and the
// student detail modal on the teacher and supervisor dashboards.

export function getStudentName(student = {}) {
  return [student.first_name, student.middle_name, student.last_name, student.suffix]
    .filter(Boolean)
    .join(' ');
}

export function getStudentInitials(student = {}) {
  return (
    [student.first_name, student.last_name]
      .filter(Boolean)
      .map((name) => name.charAt(0))
      .join('')
      .toUpperCase()
      .slice(0, 2) || 'ST'
  );
}

export function getStudentContact(student = {}) {
  return student.contact_number || student.phone || '';
}

export function getStudentStrand(student = {}) {
  return student.track_strand || student.strand || '';
}
