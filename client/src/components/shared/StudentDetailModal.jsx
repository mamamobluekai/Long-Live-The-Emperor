import { useEffect } from 'react';
import {
  getStudentName,
  getStudentInitials,
  getStudentContact,
  getStudentStrand,
} from './studentFields';
import styles from './StudentDetailModal.module.css';

const emptyValue = 'Not provided';

function formatValue(value) {
  if (value === null || value === undefined || value === '') return emptyValue;
  return value;
}

function formatDate(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString();
}

function DetailItem({ label, value }) {
  return (
    <div className={styles.detailItem}>
      <span>{label}</span>
      <strong>{formatValue(value)}</strong>
    </div>
  );
}

function DetailSection({ title, children }) {
  return (
    <section className={styles.detailSection}>
      <h3>{title}</h3>
      <div className={styles.detailGrid}>{children}</div>
    </section>
  );
}

// Shared "all student information" modal used by the teacher and supervisor
// student tables so both dashboards show exactly the same detail view.
function StudentDetailModal({ student, batch, onClose, children }) {
  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = prevOverflow;
    };
  }, [onClose]);

  if (!student) return null;

  const name = getStudentName(student) || 'Student';
  const coordinatorName = batch
    ? `${batch.coordinator_first_name || ''} ${batch.coordinator_last_name || ''}`.trim()
    : '';

  return (
    <div
      className={styles.overlay}
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section className={styles.modal} role="dialog" aria-modal="true" aria-labelledby="student-modal-title">
        <div className={styles.header}>
          <div className={styles.identityBlock}>
            {student.photo_url ? (
              <img className={styles.avatar} src={student.photo_url} alt="" />
            ) : (
              <div className={styles.avatarFallback}>{getStudentInitials(student)}</div>
            )}
            <div>
              <span className={styles.eyebrow}>STUDENT INFORMATION</span>
              <h2 id="student-modal-title">{name}</h2>
              <p>
                {student.student_number || `Student ${student.student_id || ''}`}
                {student.grade_level ? ` · Grade ${student.grade_level}` : ''}
              </p>
            </div>
          </div>
          <button type="button" className={styles.closeButton} onClick={onClose} aria-label="Close student information">
            x
          </button>
        </div>

        <div className={styles.body}>
          <DetailSection title="Academic">
            <DetailItem label="Student Number" value={student.student_number || student.student_id} />
            <DetailItem label="Account Status" value={student.account_status || student.status} />
            <DetailItem label="Grade Level" value={student.grade_level} />
            <DetailItem label="Section" value={student.section} />
            <DetailItem label="Track / Strand" value={getStudentStrand(student)} />
            <DetailItem label="School" value={student.school} />
            <DetailItem label="Academic Notes" value={student.academic_notes} />
          </DetailSection>

          <DetailSection title="Personal">
            <DetailItem label="Gender" value={student.gender} />
            <DetailItem label="Birthdate" value={formatDate(student.birthdate)} />
            <DetailItem label="Age" value={student.age} />
            <DetailItem label="Email" value={student.email} />
            <DetailItem label="Contact Number" value={getStudentContact(student)} />
            <DetailItem label="Home Address" value={student.home_address} />
          </DetailSection>

          <DetailSection title="Immersion">
            <DetailItem label="Batch" value={batch?.batch_label} />
            <DetailItem label="Coordinator" value={coordinatorName} />
            <DetailItem label="Preferred Industry" value={student.preferred_industry} />
            <DetailItem label="Preferred Company" value={student.preferred_company} />
            <DetailItem label="Career Goal" value={student.career_goal} />
            <DetailItem label="Industry Reason" value={student.industry_reason} />
          </DetailSection>

          <DetailSection title="Guardian / Emergency">
            <DetailItem label="Guardian Name" value={student.guardian_name} />
            <DetailItem label="Guardian Relationship" value={student.guardian_relationship} />
            <DetailItem label="Guardian Contact" value={student.guardian_contact} />
            <DetailItem label="Guardian Email" value={student.guardian_email} />
            <DetailItem label="Guardian Address" value={student.guardian_address} />
            <DetailItem label="Emergency Contact" value={student.emergency_contact} />
            <DetailItem
              label="Emergency Number"
              value={student.emergency_contact_number}
            />
          </DetailSection>

          {children}
        </div>
      </section>
    </div>
  );
}

export default StudentDetailModal;
