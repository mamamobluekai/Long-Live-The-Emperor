import { useEffect, useState } from 'react';
import { createSupervisorReportConcern, getSupervisorBatches } from '../../../api/supervisorApi';
import Feedback from '../../../components/Feedback';
import styles from './SupervisorStudent.module.css';

const emptyValue = 'Not provided';

function formatValue(value) {
  if (value === null || value === undefined || value === '') return emptyValue;
  return value;
}

function formatDate(value) {
  if (!value) return emptyValue;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString();
}

function getStudentName(student) {
  return [
    student.first_name,
    student.middle_name,
    student.last_name,
    student.suffix,
  ].filter(Boolean).join(' ');
}

function getInitials(student) {
  return [student.first_name, student.last_name]
    .filter(Boolean)
    .map((name) => name.charAt(0))
    .join('')
    .toUpperCase()
    .slice(0, 2) || 'ST';
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

function SupervisorStudents() {
  const [batches, setBatches] = useState([]);
  const [selectedStudent, setSelectedStudent] = useState(null);
  const [reportOpen, setReportOpen] = useState(false);
  const [reportForm, setReportForm] = useState({ category: 'Concern', priority: 'normal', message: '' });
  const [reportStatus, setReportStatus] = useState(null);
  const [reporting, setReporting] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    async function init() {
      setLoading(true);
      setError('');
      try {
        const data = await getSupervisorBatches();
        if (!cancelled) setBatches(data.batches || []);
      } catch (e) {
        if (!cancelled) setError(e.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    init();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!selectedStudent) return undefined;

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') setSelectedStudent(null);
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [selectedStudent]);

  const openStudent = (student, batch) => {
    setSelectedStudent({ student, batch });
    setReportOpen(false);
    setReportForm({ category: 'Concern', priority: 'normal', message: '' });
    setReportStatus(null);
  };

  const closeStudent = () => {
    setSelectedStudent(null);
    setReportOpen(false);
    setReportStatus(null);
  };

  const submitReport = async (event) => {
    event.preventDefault();
    if (!selectedStudent || reporting) return;

    setReporting(true);
    setReportStatus(null);
    try {
      await createSupervisorReportConcern({
        student_id: selectedStudent.student.student_id,
        batch_id: selectedStudent.batch.request_id,
        batch_source: selectedStudent.batch.source,
        category: reportForm.category,
        priority: reportForm.priority,
        message: reportForm.message,
      });
      setReportStatus({ type: 'success', text: 'Report submitted.' });
      setReportForm({ category: 'Concern', priority: 'normal', message: '' });
      setReportOpen(false);
    } catch (err) {
      setReportStatus({ type: 'error', text: err.message || 'Failed to submit report.' });
    } finally {
      setReporting(false);
    }
  };

  const totalStudents = batches.reduce((sum, b) => sum + (b.students?.length || 0), 0);

  return (
    <div>
      <div className={styles.pageHeader}>
        <h2>Assigned Students</h2>
        <p>Students assigned to your deployment batches.</p>
      </div>

      {error && <Feedback type="error" message={error} />}

      {loading ? (
        <p className={styles.loading}>Loading students...</p>
      ) : batches.length === 0 ? (
        <p className={styles.empty}>No deployment batches assigned to you yet.</p>
      ) : (
        <>
          <div className={styles.statRow}>
            <div className={styles.statCard}>
              <span className={styles.statValue}>{batches.length}</span>
              <span className={styles.statLabel}>Batches</span>
            </div>
            <div className={styles.statCard}>
              <span className={styles.statValue}>{totalStudents}</span>
              <span className={styles.statLabel}>Students</span>
            </div>
          </div>

          {batches.map((b) => (
            <div key={`${b.source}-${b.request_id}`} className={styles.section}>
              <h3 className={styles.sectionTitle}>
                {b.batch_label}
                <span className={styles.badge} style={{ marginLeft: 10 }}>
                  {b.strand || 'General'}
                </span>
              </h3>
              <p className={styles.muted}>
                Coordinator: {b.coordinator_first_name} {b.coordinator_last_name} -{' '}
                {b.students?.length || 0} students
              </p>

              {b.students?.length === 0 ? (
                <p className={styles.empty}>No students assigned yet.</p>
              ) : (
                <div className={styles.tableWrap}>
                  <table className={styles.table}>
                    <thead>
                      <tr>
                        <th>Student ID</th>
                        <th>Name</th>
                        <th>Email</th>
                        <th>Strand</th>
                        <th>Grade Level</th>
                      </tr>
                    </thead>
                    <tbody>
                      {b.students.map((s) => (
                        <tr
                          key={`${b.source}-${b.request_id}-${s.student_id}`}
                          className={styles.studentRow}
                          onClick={() => openStudent(s, b)}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter' || event.key === ' ') {
                              event.preventDefault();
                              openStudent(s, b);
                            }
                          }}
                          role="button"
                          tabIndex={0}
                          aria-label={`View information for ${getStudentName(s)}`}
                        >
                          <td>{s.student_number || s.student_id}</td>
                          <td>{getStudentName(s)}</td>
                          <td>{s.email}</td>
                          <td>{s.track_strand || s.strand || '-'}</td>
                          <td>{s.grade_level || '-'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          ))}
        </>
      )}

      {selectedStudent && (() => {
        const { student, batch } = selectedStudent;
        const coordinatorName = `${batch.coordinator_first_name || ''} ${batch.coordinator_last_name || ''}`.trim();

        return (
          <div
            className={styles.modalOverlay}
            role="presentation"
            onMouseDown={(event) => {
              if (event.target === event.currentTarget) closeStudent();
            }}
          >
            <section className={styles.modal} role="dialog" aria-modal="true" aria-labelledby="student-modal-title">
              <div className={styles.modalHeader}>
                <div className={styles.identityBlock}>
                  {student.photo_url ? (
                    <img className={styles.studentAvatar} src={student.photo_url} alt="" />
                  ) : (
                    <div className={styles.studentAvatarFallback}>{getInitials(student)}</div>
                  )}
                  <div>
                    <span className={styles.modalEyebrow}>STUDENT INFORMATION</span>
                    <h2 id="student-modal-title">{getStudentName(student)}</h2>
                    <p>{student.student_number || `Student ${student.student_id}`} · Grade {student.grade_level || '12'}</p>
                  </div>
                </div>
                <button type="button" className={styles.closeButton} onClick={closeStudent} aria-label="Close student information">
                  x
                </button>
              </div>

              <div className={styles.modalBody}>
                {reportStatus && (
                  <div className={`${styles.reportNotice} ${styles['reportNotice_' + reportStatus.type]}`}>
                    {reportStatus.text}
                  </div>
                )}

                <DetailSection title="Academic">
                  <DetailItem label="Student Number" value={student.student_number || student.student_id} />
                  <DetailItem label="Account Status" value={student.account_status} />
                  <DetailItem label="Grade Level" value={student.grade_level} />
                  <DetailItem label="Section" value={student.section} />
                  <DetailItem label="Track / Strand" value={student.track_strand || student.strand} />
                  <DetailItem label="School" value={student.school} />
                  <DetailItem label="Academic Notes" value={student.academic_notes} />
                </DetailSection>

                <DetailSection title="Personal">
                  <DetailItem label="Gender" value={student.gender} />
                  <DetailItem label="Birthdate" value={formatDate(student.birthdate)} />
                  <DetailItem label="Age" value={student.age} />
                  <DetailItem label="Email" value={student.email} />
                  <DetailItem label="Contact Number" value={student.contact_number || student.phone} />
                  <DetailItem label="Home Address" value={student.home_address} />
                </DetailSection>

                <DetailSection title="Immersion">
                  <DetailItem label="Batch" value={batch.batch_label} />
                  <DetailItem label="Coordinator" value={coordinatorName} />
                  <DetailItem label="Preferred Industry" value={student.preferred_industry} />
                  <DetailItem label="Preferred Company" value={student.preferred_company} />
                  <DetailItem label="Career Goal" value={student.career_goal} />
                  <DetailItem label="Industry Reason" value={student.industry_reason} />
                </DetailSection>

                <DetailSection title="Guardian / Emergency">
                  <DetailItem label="Guardian Name" value={student.guardian_name} />
                  <DetailItem label="Relationship" value={student.guardian_relationship} />
                  <DetailItem label="Guardian Contact" value={student.guardian_contact} />
                  <DetailItem label="Guardian Email" value={student.guardian_email} />
                  <DetailItem label="Guardian Address" value={student.guardian_address} />
                  <DetailItem label="Emergency Contact" value={student.emergency_contact} />
                  <DetailItem label="Emergency Number" value={student.emergency_contact_number} />
                </DetailSection>

                {reportOpen && (
                  <form className={styles.reportForm} onSubmit={submitReport}>
                    <div className={styles.reportFormHeader}>
                      <h3>Report Problem or Concern</h3>
                      <p>{getStudentName(student)}</p>
                    </div>

                    <div className={styles.reportFields}>
                      <label>
                        Category
                        <select
                          value={reportForm.category}
                          onChange={(event) => setReportForm((form) => ({ ...form, category: event.target.value }))}
                        >
                          <option value="Concern">Concern</option>
                          <option value="Attendance">Attendance</option>
                          <option value="Performance">Performance</option>
                          <option value="Behavior">Behavior</option>
                          <option value="Safety">Safety</option>
                          <option value="Other">Other</option>
                        </select>
                      </label>

                      <label>
                        Priority
                        <select
                          value={reportForm.priority}
                          onChange={(event) => setReportForm((form) => ({ ...form, priority: event.target.value }))}
                        >
                          <option value="low">Low</option>
                          <option value="normal">Normal</option>
                          <option value="high">High</option>
                          <option value="urgent">Urgent</option>
                        </select>
                      </label>
                    </div>

                    <label className={styles.reportMessage}>
                      Details
                      <textarea
                        rows={4}
                        value={reportForm.message}
                        onChange={(event) => setReportForm((form) => ({ ...form, message: event.target.value }))}
                        placeholder="Describe the problem or concern."
                        required
                      />
                    </label>

                    <div className={styles.reportActions}>
                      <button type="button" className={styles.cancelReportButton} onClick={() => setReportOpen(false)}>
                        Cancel
                      </button>
                      <button type="submit" className={styles.submitReportButton} disabled={reporting || !reportForm.message.trim()}>
                        {reporting ? 'Submitting...' : 'Submit Report'}
                      </button>
                    </div>
                  </form>
                )}
              </div>

              <div className={styles.modalFooter}>
                <span>Assigned to your supervision</span>
                <div className={styles.footerActions}>
                  <button type="button" className={styles.reportButton} onClick={() => setReportOpen((open) => !open)}>
                    {reportOpen ? 'Hide Report' : 'Report Concern'}
                  </button>
                  <button type="button" className={styles.closeAction} onClick={closeStudent}>Close</button>
                </div>
              </div>
            </section>
          </div>
        );
      })()}
    </div>
  );
}

export default SupervisorStudents;
