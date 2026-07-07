import DashboardShell from '../DashboardShell';
import styles from './StudentDashboard.module.css';

function StudentDashboard({ user, onLogout }) {
  return (
    <DashboardShell user={user} title="Student Dashboard" onLogout={onLogout}>
      <div className={styles.grid}>
        <div className={styles.card}>
          <h3>Requirements</h3>
          <p>Upload your documents and monitor your progress.</p>
        </div>
        <div className={styles.card}>
          <h3>Placement Status</h3>
          <p>See whether your deployment request has been approved.</p>
        </div>
        <div className={styles.card}>
          <h3>Announcements</h3>
          <p>Check coordinator updates and reminders.</p>
        </div>
      </div>
    </DashboardShell>
  );
}

export default StudentDashboard;