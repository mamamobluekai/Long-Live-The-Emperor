import DashboardShell from '../DashboardShell';
import styles from './CoordinatorDashboard.module.css';

function CoordinatorDashboard({ user, onLogout }) {
  return (
    <DashboardShell user={user} title="Coordinator Dashboard" onLogout={onLogout}>
      <div className={styles.grid}>
        <div className={styles.card}>
          <h3>Student Approvals</h3>
          <p>Approve new student accounts and review records.</p>
        </div>
        <div className={styles.card}>
          <h3>Requirements</h3>
          <p>Track student submissions and document completeness.</p>
        </div>
        <div className={styles.card}>
          <h3>Batches</h3>
          <p>Organize teachers, students, and deployment groups.</p>
        </div>
      </div>
    </DashboardShell>
  );
}

export default CoordinatorDashboard;