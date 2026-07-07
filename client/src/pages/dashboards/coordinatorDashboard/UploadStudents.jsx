import { useState } from 'react';
import { uploadStudentsExcel } from '../../../api/coordinatorApi';
import styles from './CoordinatorDashboard.module.css';

function UploadStudents() {
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const handleUpload = async () => {
    if (!file) {
      setError('Please select an Excel file first.');
      return;
    }
    setLoading(true);
    setError('');
    setMessage('');
    try {
      const data = await uploadStudentsExcel(file);
      const r = data.results || {};
      setMessage(
        `${data.message || 'Upload complete.'}${r.failed ? ` (${r.failed} failed, see console)` : ''}`
      );
      if (r.failed && r.errors) console.warn('Student upload errors:', r.errors);
      setFile(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <div className={styles.pageHeader}>
        <h2>Upload Students</h2>
        <p>
          Upload an Excel file (.xlsx) to bulk-create pending student accounts. Accounts are created
          with <strong>pending</strong> status and can be approved from the Student Approvals page.
        </p>
      </div>

      {message && <div className={styles.message}>{message}</div>}
      {error && <div className={styles.error}>{error}</div>}

      <div className={styles.section}>
        <p className={styles.muted}>
          Required columns: <strong>Student ID</strong>, <strong>First Name</strong>,{' '}
          <strong>Last Name</strong>, <strong>Email</strong>. Optional: Middle Name, Grade Level,
          Section, Strand, School, Contact Number, Gender.
        </p>
        <input type="file" accept=".xlsx,.xls" onChange={(e) => setFile(e.target.files[0])} />
        <div className={styles.actions} style={{ marginTop: 12 }}>
          <button className={styles.btn} onClick={handleUpload} disabled={loading || !file}>
            {loading ? 'Uploading...' : 'Upload Students'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default UploadStudents;
