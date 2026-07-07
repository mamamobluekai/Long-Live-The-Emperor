import DashboardShell from '../DashboardShell';
import styles from './TeacherDashboard.module.css';

function TeacherDashboard({ user, onLogout }) {
  return (
    <DashboardShell user={user} title="Teacher Dashboard" onLogout={onLogout}>
      <div className={styles.grid}>
        <div className={styles.card}>
          <h3>My Class</h3>
          <p>Monitor assigned students and batch progress.</p>
        </div>
        <div className={styles.card}>
          <h3>Student Status</h3>
          <p>Review submissions and provide guidance.</p>
        </div>
        <div className={styles.card}>
          <h3>Reporting</h3>
          <p>Track completion and deployment readiness.</p>
        </div>
      </div>
    </DashboardShell>
  );
}

export default TeacherDashboard;