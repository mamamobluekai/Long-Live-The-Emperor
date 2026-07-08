import styles from './TeacherDashboard.module.css';

function TeacherOverview({ user }) {
  return (
    <div>
      <div className={styles.pageHeader}>
        <h2>Overview</h2>
        <p>Welcome back, {user?.email || 'Teacher'}.</p>
      </div>
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
    </div>
  );
}

export default TeacherOverview;
