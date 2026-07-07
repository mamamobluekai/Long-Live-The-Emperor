import styles from './Announcements.module.css';

function Announcements() {
  return (
    <div>
      <div className={styles.pageHeader}>
        <h2>Announcements</h2>
        <p>Coordinator updates, reminders, and important notices.</p>
      </div>
      <div className={styles.section}>
        <p className={styles.empty}>No announcements yet. Check back later for updates from your coordinator.</p>
      </div>
    </div>
  );
}

export default Announcements;
