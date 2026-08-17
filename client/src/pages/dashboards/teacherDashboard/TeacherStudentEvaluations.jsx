import { useEffect, useState } from 'react';
import { getTeacherBatchEvaluations } from '../../../api/teacherApi';
import styles from '../supervisorDashboard/SupervisorEvaluation.module.css';

function TeacherStudentEvaluations() {
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError('');
      try {
        const data = await getTeacherBatchEvaluations();
        if (!cancelled) setGroups(data.groups || []);
      } catch (e) {
        if (!cancelled) setError(e.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, []);

  return (
    <div>
      <div className={styles.pageHeader}>
        <h2>Student Evaluations</h2>
        <p>View evaluations of your students grouped by supervisor.</p>
      </div>

      {error && <div className={styles.error}>{error}</div>}

      {loading ? (
        <p className={styles.loading}>Loading...</p>
      ) : groups.length === 0 ? (
        <p className={styles.empty}>No batches assigned yet.</p>
      ) : (
        groups.map((group) => (
          <div key={group.batch_id} className={styles.section}>
            <h3 className={styles.sectionTitle}>
              {group.batch_label}
            </h3>
            <p className={styles.muted} style={{ marginBottom: 14 }}>
              Supervisor: {group.supervisor_name}
            </p>

            {group.students.length === 0 ? (
              <p className={styles.empty}>No students in this batch.</p>
            ) : (
              <div className={styles.tableWrap}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>Student ID</th>
                      <th>Name</th>
                      <th>Email</th>
                      <th>Overall Score</th>
                      <th>Grade</th>
                      <th>Date Evaluated</th>
                    </tr>
                  </thead>
                  <tbody>
                    {group.students.map((s) => {
                      const ev = s.evaluation;
                      const percentage = ev?.overall_percentage || (ev?.overall_score ? Math.round((ev.overall_score / 5) * 10000) / 100 : 0);
                      const grade = percentage >= 90 ? 'Outstanding' :
                                    percentage >= 80 ? 'Very Satisfactory' :
                                    percentage >= 75 ? 'Satisfactory' :
                                    percentage >= 70 ? 'Fair' :
                                    percentage >= 0 ? 'Needs Improvement' : 'N/A';
                      return (
                        <tr key={s.student_id}>
                          <td>{s.student_number}</td>
                          <td>{s.first_name} {s.last_name}</td>
                          <td>{s.email}</td>
                          <td>{ev ? `${percentage}%` : '-'}</td>
                          <td>{ev ? grade : '-'}</td>
                          <td>
                            {ev?.created_at
                              ? new Date(ev.created_at).toLocaleDateString()
                              : '-'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        ))
      )}
    </div>
  );
}

export default TeacherStudentEvaluations;
