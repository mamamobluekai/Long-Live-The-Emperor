import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getSupervisors } from '../../../api/coordinatorApi';
import styles from './CoordinatorDashboard.module.css';

const statusBadge = (status) => {
  const map = {
    pending: styles.badgePending,
    approved: styles.badgeApproved,
    rejected: styles.badgeRejected,
    fulfilled: styles.badgeVerified,
  };
  return map[String(status || '').toLowerCase()] || styles.badgePending;
};

function Supervisors() {
  const [supervisors, setSupervisors] = useState([]);
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    let mounted = true;
    const fetchData = async () => {
      setLoading(true);
      setError('');
      try {
        const data = await getSupervisors(status || undefined);
        if (mounted) setSupervisors(data.supervisors || []);
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
  }, [status]);

  return (
    <div>
      <div className={styles.pageHeader}>
        <h2>Supervisors</h2>
        <p>Approved industry supervisors available for deployment requests.</p>
      </div>

      {error && <div className={styles.error}>{error}</div>}

      <div className={styles.section}>
        <div className={styles.controls}>
          <select className={styles.filterSelect} value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">All Statuses</option>
            <option value="approved">Approved</option>
            <option value="pending">Pending</option>
            <option value="disapproved">Disapproved</option>
          </select>
          <button
            className={styles.btn}
            onClick={() => navigate('/dashboard/coordinator/deployment-requests')}
          >
            New Deployment Request
          </button>
        </div>

        {loading ? (
          <p className={styles.loading}>Loading supervisors...</p>
        ) : supervisors.length === 0 ? (
          <p className={styles.empty}>No supervisors found.</p>
        ) : (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Company</th>
                  <th>Designation</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {supervisors.map((s) => (
                  <tr key={s.id}>
                    <td>
                      {s.first_name} {s.last_name}
                    </td>
                    <td>{s.email}</td>
                    <td>{s.company_name || '-'}</td>
                    <td>{s.designation || '-'}</td>
                    <td>
                      <span className={`${styles.badge} ${statusBadge(s.status)}`}>{s.status}</span>
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

export default Supervisors;
