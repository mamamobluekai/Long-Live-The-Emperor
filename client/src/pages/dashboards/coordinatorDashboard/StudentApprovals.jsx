import { useEffect, useState } from 'react';
import {
  getPendingStudents,
  approveStudent,
  disapproveStudent,
  uploadStudentsExcel,
} from '../../../api/coordinatorApi';
import styles from './StudentApprovals.module.css';

const statusBadge = (status) => {
  const map = {
    pending: styles.badgePending,
    approved: styles.badgeApproved,
    rejected: styles.badgeRejected,
    'needs revision': styles.badgeNeeds,
  };

  return map[String(status).toLowerCase()] || styles.badgePending;
};

function StudentApprovals() {
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(true);

  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [uploadMessage, setUploadMessage] = useState('');
  const [uploadError, setUploadError] = useState('');

  const load = async () => {
    setLoading(true);
    setError('');

    try {
      const data = await getPendingStudents();
      setStudents(data.students || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const handleUpload = async () => {
    if (!file) {
      setUploadError('Please select an Excel file first.');
      return;
    }

    setUploading(true);
    setUploadError('');
    setUploadMessage('');
    setMessage('');
    setError('');

    try {
      const data = await uploadStudentsExcel(file);

      const r = data.results || {};
      const summary = data.message || 'Upload complete.';
      const detail = r.failed ? ` (${r.failed} failed)` : '';

      setUploadMessage(`${summary}${detail}`);
      setFile(null);

      await load();
    } catch (err) {
      setUploadError(err.message);
    } finally {
      setUploading(false);
    }
  };

  const handleApprove = async (id) => {
    try {
      await approveStudent(id);

      setMessage(
        'Student approved. An email with their password setup link was sent.'
      );

      await load();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleDisapprove = async (id) => {
    try {
      await disapproveStudent(id);

      setMessage('Student disapproved.');

      await load();
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div className={styles.page}>
      {/* HEADER */}
      <div className={styles.pageHeader}>
        <div>
          <span className={styles.eyebrow}>STUDENT MANAGEMENT</span>

          <h2>Students</h2>

          <p>
            Manage student accounts, upload students in bulk, and review
            pending registrations.
          </p>
        </div>

        
      </div>

      {/* ALERTS */}
      {message && (
        <div className={`${styles.alert} ${styles.alertSuccess}`}>
          <span className={styles.alertIcon}>✓</span>
          <span>{message}</span>
          <button onClick={() => setMessage('')}>×</button>
        </div>
      )}

      {error && (
        <div className={`${styles.alert} ${styles.alertError}`}>
          <span className={styles.alertIcon}>!</span>
          <span>{error}</span>
          <button onClick={() => setError('')}>×</button>
        </div>
      )}

      {/* BULK UPLOAD */}
      <section className={styles.uploadCard}>
        <div className={styles.cardHeader}>
          

          <div>
            <h3>Bulk Upload Students</h3>
            <p>
              Import multiple student accounts using an Excel spreadsheet.
            </p>
          </div>
        </div>

        <div className={styles.uploadContent}>
          <div className={styles.uploadBox}>
            <div className={styles.uploadSymbol}>↑</div>

            <div className={styles.uploadText}>
              <strong>
                {file ? file.name : 'Choose an Excel file'}
              </strong>

              <span>
                {file
                  ? `${(file.size / 1024 / 1024).toFixed(2)} MB`
                  : 'Supported formats: .xlsx and .xls'}
              </span>
            </div>

            <label className={styles.chooseBtn}>
              Browse
              <input
                type="file"
                accept=".xlsx,.xls"
                onChange={(e) => {
                  setFile(e.target.files?.[0] || null);
                  setUploadError('');
                  setUploadMessage('');
                }}
              />
            </label>
          </div>

          <button
            className={styles.uploadBtn}
            onClick={handleUpload}
            disabled={uploading || !file}
          >
            {uploading ? (
              <>
                <span className={styles.spinner}></span>
                Uploading...
              </>
            ) : (
              <>
                Upload Students
              </>
            )}
          </button>
        </div>

        <div className={styles.uploadHint}>
          <span>ⓘ</span>
          Required columns: Student ID, First Name, Last Name, and Email.
        </div>

        {uploadMessage && (
          <div className={`${styles.smallAlert} ${styles.smallSuccess}`}>
            ✓ {uploadMessage}
          </div>
        )}

        {uploadError && (
          <div className={`${styles.smallAlert} ${styles.smallError}`}>
            ! {uploadError}
          </div>
        )}
      </section>

      {/* STUDENTS */}
      <section className={styles.studentsCard}>
        <div className={styles.studentsHeader}>
          <div>
            <span className={styles.sectionLabel}>REGISTRATION</span>

            <h3>Pending Student Approvals</h3>

            <p>
              Review and approve student accounts waiting for registration.
            </p>
          </div>

          <div className={styles.studentCount}>
            <strong>{students.length}</strong>
            <span>Pending</span>
          </div>
        </div>

        {loading ? (
          <div className={styles.loading}>
            <span className={styles.spinnerDark}></span>
            <p>Loading students...</p>
          </div>
        ) : students.length === 0 ? (
          <div className={styles.empty}>
            <div className={styles.emptyIcon}>✓</div>

            <h4>No pending students</h4>

            <p>
              All student registrations have been processed.
            </p>
          </div>
        ) : (
          <div className={styles.tableContainer}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>STUDENT</th>
                  <th>EMAIL</th>
                  <th>STATUS</th>
                  <th className={styles.actionHeader}>ACTIONS</th>
                </tr>
              </thead>

              <tbody>
                {students.map((student) => {
                  const fullName =
                    `${student.first_name || ''} ${
                      student.last_name || ''
                    }`.trim();

                  return (
                    <tr key={student.id}>
                      <td>
                        <div className={styles.studentCell}>
                          <div className={styles.studentAvatar}>
                            {(student.first_name || 'S')
                              .charAt(0)
                              .toUpperCase()}
                          </div>

                          <div>
                            <strong>
                              {fullName || 'Unnamed Student'}
                            </strong>

                            <span>
                              {student.student_number || 'No student ID'}
                            </span>
                          </div>
                        </div>
                      </td>

                      <td>
                        <span className={styles.email}>
                          {student.email || '-'}
                        </span>
                      </td>

                      <td>
                        <span
                          className={`${styles.badge} ${statusBadge(
                            student.status
                          )}`}
                        >
                          <span className={styles.statusDot}></span>
                          {student.status || 'Pending'}
                        </span>
                      </td>

                      <td>
                        <div className={styles.actions}>
                          <button
                            className={styles.approveBtn}
                            onClick={() =>
                              handleApprove(student.id)
                            }
                          >
                            ✓ Approve
                          </button>

                          <button
                            className={styles.rejectBtn}
                            onClick={() =>
                              handleDisapprove(student.id)
                            }
                          >
                            Disapprove
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

export default StudentApprovals;