import DashboardShell from '../DashboardShell';
import styles from './SupervisorDashboard.module.css';

function SupervisorDashboard({ user, onLogout }) {
  return (
    <DashboardShell user={user} title="Supervisor Dashboard" onLogout={onLogout}>
      <div className={styles.grid}>
        <div className={styles.card}>
          <h3>Deployment Requests</h3>
          <p>Review and respond to deployment proposals.</p>
        </div>
        <div className={styles.card}>
          <h3>Assigned Students</h3>
          <p>Track intern placements and company readiness.</p>
        </div>
        <div className={styles.card}>
          <h3>Company Updates</h3>
          <p>Share updates with the school and coordinator team.</p>
        </div>
      </div>
    </DashboardShell>
  );
}

export default SupervisorDashboard;