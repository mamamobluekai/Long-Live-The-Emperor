import { useState, useEffect } from 'react';
import axios from 'axios';
import { useAuth } from '../../../context/AuthContext';
import { useTeacherBatch } from '../../../hooks/useTeacherBatch';
import styles from './TeacherStudents.module.css';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

function TeacherStudents() {
  const { token } = useAuth();
  const { batchId: selectedBatchId, batchLabel } = useTeacherBatch();
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!selectedBatchId) return;
    setLoading(true);
    axios
      .get(`${API_URL}/coordinator/teacher-batches/${selectedBatchId}/students`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      .then((res) => setStudents(res.data?.students || []))
      .catch(() => setStudents([]))
      .finally(() => setLoading(false));
  }, [selectedBatchId, token]);

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div>
          <h2 className={styles.title}>My Students</h2>
          {batchLabel && <p className={styles.batchTag}>Batch: {batchLabel}</p>}
        </div>
      </div>

      {loading && <p className={styles.info}>Loading…</p>}

      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Name</th>
              <th>Student No.</th>
              <th>Grade / Strand</th>
              <th>Email</th>
            </tr>
          </thead>
          <tbody>
            {students.length === 0 && !loading && (
              <tr><td colSpan="4" className={styles.empty}>No students assigned.</td></tr>
            )}
            {students.map((s) => (
              <tr key={s.id}>
                <td>{s.first_name} {s.last_name}</td>
                <td>{s.student_number || '—'}</td>
                <td>{[s.grade_level, s.track_strand].filter(Boolean).join(' / ') || '—'}</td>
                <td>{s.email || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default TeacherStudents;
