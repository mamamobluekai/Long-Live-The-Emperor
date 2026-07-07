import { useEffect, useState } from 'react';
import {
  getPendingStudents,
  approveStudent,
  disapproveStudent,
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

  const handleApprove = async (id) => {
    try {
      await approveStudent(id);
      setMessage('Student approved. An email with their password was sent.');
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
        <h2>Student Approvals</h2>
        <p>Review and approve pending student registrations.</p>
      </div>

      {message && <div className={styles.message}>{message}</div>}
      {error && <div className={styles.error}>{error}</div>}

      <div className={styles.section}>
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
