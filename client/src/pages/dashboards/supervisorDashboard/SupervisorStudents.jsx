import { useEffect, useState } from 'react';
import { createSupervisorReportConcern, getSupervisorBatches } from '../../../api/supervisorApi';
import Feedback from '../../../components/Feedback';
import StudentDetailModal from '../../../components/shared/StudentDetailModal';
import { getStudentName } from '../../../components/shared/studentFields';
import styles from './SupervisorStudent.module.css';

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
                        <th>Contact No.</th>
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
                          <td>{s.contact_number || s.phone || '-'}</td>
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

        return (
          <StudentDetailModal student={student} batch={batch} onClose={closeStudent}>
            {reportStatus && (
              <div className={`${styles.reportNotice} ${styles['reportNotice_' + reportStatus.type]}`}>
                {reportStatus.text}
              </div>
            )}

            <div className={styles.modalActions}>
              <button type="button" className={styles.reportButton} onClick={() => setReportOpen((open) => !open)}>
                {reportOpen ? 'Hide Report' : 'Report Concern'}
              </button>
              <button type="button" className={styles.closeAction} onClick={closeStudent}>
                Close
              </button>
            </div>

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
          </StudentDetailModal>
        );
      })()}
    </div>
  );
}

export default SupervisorStudents;
