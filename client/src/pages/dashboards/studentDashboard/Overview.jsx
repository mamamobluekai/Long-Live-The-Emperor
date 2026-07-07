import styles from './Overview.module.css';

function Overview({ user }) {
  return (
    <div>
      <div className={styles.pageHeader}>
        <h2>Overview</h2>
        <p>Welcome back! Quick links to manage your requirements and track your placement.</p>
      </div>
      <div className={styles.grid}>
        <div className={styles.card}>
          <h3>Requirements</h3>
          <p>Upload your documents and fill in your personal information.</p>
        </div>
        <div className={styles.card}>
          <h3>Placement Status</h3>
          <p>See whether your requirements have been approved and placements assigned.</p>
        </div>
        <div className={styles.card}>
          <h3>Announcements</h3>
          <p>Check coordinator updates and reminders.</p>
        </div>
      </div>
    </div>
  );
}

export default Overview;
