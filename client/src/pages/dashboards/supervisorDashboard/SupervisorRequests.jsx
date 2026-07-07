import { useEffect, useState } from 'react';
import {
  getSupervisorDeploymentRequests,
  getDeploymentRequestStudents,
} from '../../../api/coordinatorApi';
import Feedback from '../../../components/Feedback';
import styles from './SupervisorDashboard.module.css';

const statusBadge = (status) => {
  const map = {
    pending: styles.badgePending,
    approved: styles.badgeApproved,
    rejected: styles.badgeRejected,
    fulfilled: styles.badgeFulfilled,
  };
  return map[String(status || '').toLowerCase()] || styles.badgePending;
};

function SupervisorRequests() {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [viewing, setViewing] = useState(null);
  const [viewStudents, setViewStudents] = useState([]);

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const data = await getSupervisorDeploymentRequests();
      setRequests(data.deployment_requests || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const handleView = async (id) => {
    try {
      const data = await getDeploymentRequestStudents(id);
      setViewStudents(data.students || []);
      setViewing(id);
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div>
      <div className={styles.pageHeader}>
        <h2>My Requests</h2>
        <p>Track deployment requests sent to coordinators and assigned students.</p>
      </div>

      {error && <Feedback type="error" message={error} />}

      {loading ? (
        <p className={styles.loading}>Loading...</p>
      ) : requests.length === 0 ? (
        <p className={styles.empty}>No deployment requests yet.</p>
      ) : (
        requests.map((r) => (
          <div key={r.id} className={styles.listItem}>
            <div className={styles.row}>
              <div>
                <h4>
                  {r.batch_label} — {r.coordinator_first_name} {r.coordinator_last_name}
                </h4>
                <p className={styles.muted}>
                  {r.direction === 'supervisor_to_coordinator' ? 'To Coordinator' : 'From Coordinator'} ·{' '}
                  {r.num_students} students needed
                  {r.strand ? ` · ${r.strand}` : ''}
                </p>
              </div>
              <div className={styles.row} style={{ flex: 'none' }}>
                <span className={`${styles.badge} ${statusBadge(r.status)}`}>{r.status}</span>
                {r.students && r.students.length > 0 && (
                  <button className={styles.btnSecondary} type="button" onClick={() => handleView(r.id)}>
                    View Students
                  </button>
                )}
              </div>
            </div>
          </div>
        ))
      )}

      {viewing && (
        <div className={styles.section}>
          <h3 className={styles.sectionTitle}>Assigned Students</h3>
          {viewStudents.length === 0 ? (
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
                  </tr>
                </thead>
                <tbody>
                  {viewStudents.map((s) => (
                    <tr key={s.id}>
                      <td>{s.student_id}</td>
                      <td>
                        {s.first_name} {s.last_name}
                      </td>
                      <td>{s.email}</td>
                      <td>{s.strand || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div className={styles.actions}>
            <button className={styles.btnSecondary} type="button" onClick={() => setViewing(null)}>
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default SupervisorRequests;
