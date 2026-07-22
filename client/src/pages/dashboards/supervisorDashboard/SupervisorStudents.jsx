import { useEffect, useState } from 'react';
import { getSupervisorBatches } from '../../../api/supervisorApi';
import Feedback from '../../../components/Feedback';
import styles from './SupervisorDashboard.module.css';

function SupervisorStudents() {
  const [batches, setBatches] = useState([]);
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
            <div key={b.request_id} className={styles.section}>
              <h3 className={styles.sectionTitle}>
                {b.batch_label}
                <span className={styles.badge} style={{ marginLeft: 10 }}>
                  {b.strand || 'General'}
                </span>
              </h3>
              <p className={styles.muted}>
                Coordinator: {b.coordinator_first_name} {b.coordinator_last_name} ·{' '}
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
                        <tr key={s.id}>
                          <td>{s.student_id}</td>
                          <td>
                            {s.first_name} {s.last_name}
                          </td>
                          <td>{s.email}</td>
                          <td>{s.strand || '-'}</td>
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
    </div>
  );
}

export default SupervisorStudents;
