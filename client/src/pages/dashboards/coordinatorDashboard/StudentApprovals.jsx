import { useEffect, useState } from 'react';
import {
  getPendingStudents,
  approveStudent,
  disapproveStudent,
  uploadStudentsExcel,
} from '../../../api/coordinatorApi';
import styles from './CoordinatorDashboard.module.css';

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
    let mounted = true;
    const fetchData = async () => {
      setLoading(true);
      setError('');
      try {
        const data = await getPendingStudents();
        if (mounted) setStudents(data.students || []);
      } catch (err) {
        if (mounted) setError(err.message);
      } finally {
        if (mounted) setLoading(false);
      }
    };
    fetchData();
    return () => {
      mounted = false;
    };
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
      setMessage('Student approved. An email with their password setup link was sent.');
      load();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleDisapprove = async (id) => {
    try {
      await disapproveStudent(id);
      setMessage('Student disapproved.');
      load();
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div>
      <div className={styles.pageHeader}>
        <h2>Student Management</h2>
        <p>Upload new student accounts in bulk and approve pending registrations from one place.</p>
      </div>

      {message && <div className={styles.message}>{message}</div>}
      {error && <div className={styles.error}>{error}</div>}

      <div className={styles.section}>
        <h3 className={styles.sectionTitle}>Bulk Upload Students</h3>
        <p className={styles.muted}>
          Upload an Excel file to create pending student accounts. Required columns include Student ID,
          First Name, Last Name, and Email.
        </p>
        <div className={styles.row}>
          <input type="file" accept=".xlsx,.xls" onChange={(e) => setFile(e.target.files[0])} />
          <button className={styles.btn} onClick={handleUpload} disabled={uploading || !file}>
            {uploading ? 'Uploading...' : 'Upload Students'}
          </button>
        </div>
        {uploadMessage && <div className={styles.message}>{uploadMessage}</div>}
        {uploadError && <div className={styles.error}>{uploadError}</div>}
      </div>

      <div className={styles.section}>
        <h3 className={styles.sectionTitle}>Pending Student Approvals</h3>
        {loading ? (
          <p className={styles.loading}>Loading students...</p>
        ) : students.length === 0 ? (
          <p className={styles.empty}>No pending students.</p>
        ) : (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Student ID</th>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {students.map((s) => (
                  <tr key={s.id}>
                    <td>{s.student_number || '-'}</td>
                    <td>
                      {s.first_name || ''} {s.last_name || ''}
                    </td>
                    <td>{s.email}</td>
                    <td>
                      <span className={`${styles.badge} ${statusBadge(s.status)}`}>
                        {s.status}
                      </span>
                    </td>
                    <td>
                      <div className={styles.actions}>
                        <button className={styles.btnApprove} onClick={() => handleApprove(s.id)}>
                          Approve
                        </button>
                        <button className={styles.btnReject} onClick={() => handleDisapprove(s.id)}>
                          Disapprove
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

export default StudentApprovals;
