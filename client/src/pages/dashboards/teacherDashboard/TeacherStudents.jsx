import { useState, useEffect } from 'react';
import { useAuth } from '../../../context/AuthContext';
import { getMyTeacherBatch, getTeacherBatchStudents } from '../../../api/teacherApi';
import styles from './TeacherStudents.module.css';

// Teacher's read-only student list, grouped by batch. A teacher may handle
// several batches, so every assigned batch is shown with its students.
function TeacherStudents() {
  const { token } = useAuth();
  const [batches, setBatches] = useState([]);
  const [studentsByBatch, setStudentsByBatch] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    async function init() {
      setLoading(true);
      setError('');
      try {
        const res = await getMyTeacherBatch(token);
        const list = res?.batches || [];
        if (cancelled) return;
        setBatches(list);

        const entries = await Promise.all(
          list.map(async (b) => {
            try {
              const s = await getTeacherBatchStudents(b.id, token);
              return [b.id, s?.students || []];
            } catch {
              return [b.id, []];
            }
          })
        );
        if (!cancelled) setStudentsByBatch(Object.fromEntries(entries));
      } catch (err) {
        if (!cancelled) setError(err.message || 'Failed to load students.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    init();
    return () => { cancelled = true; };
  }, [token]);

  const totalStudents = Object.values(studentsByBatch).reduce(
    (sum, arr) => sum + (arr?.length || 0),
    0
  );

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div>
          <h2 className={styles.title}>My Students</h2>
          <p className={styles.batchTag}>
            {batches.length} {batches.length === 1 ? 'batch' : 'batches'} · {totalStudents} {totalStudents === 1 ? 'student' : 'students'}
          </p>
        </div>
      </div>

      {error && <p className={styles.error}>{error}</p>}
      {loading && <p className={styles.info}>Loading…</p>}

      {!loading && batches.length === 0 && (
        <p className={styles.empty}>No batches assigned to you yet.</p>
      )}

      {!loading && batches.map((b) => {
        const students = studentsByBatch[b.id] || [];
        return (
          <section key={b.id} className={styles.batchSection}>
            <div className={styles.batchSectionHeader}>
              <h3 className={styles.batchSectionTitle}>{b.batch_label}</h3>
              <span className={styles.batchCount}>
                {students.length} {students.length === 1 ? 'student' : 'students'}
              </span>
            </div>
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
                  {students.length === 0 && (
                    <tr><td colSpan="4" className={styles.empty}>No students assigned.</td></tr>
                  )}
                  {students.map((s) => (
                    <tr key={s.id || s.student_id}>
                      <td>{s.first_name} {s.last_name}</td>
                      <td>{s.student_number || s.student_id || '—'}</td>
                      <td>{[s.grade_level, s.track_strand].filter(Boolean).join(' / ') || '—'}</td>
                      <td>{s.email || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        );
      })}
    </div>
  );
}

export default TeacherStudents;