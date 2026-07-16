import { useAuth } from '../../../context/AuthContext';
import styles from './TeacherSettings.module.css';

function TeacherSettings() {
  const { user } = useAuth();
  return (
    <div className={styles.page}>
      <h2 className={styles.title}>Settings</h2>
      <div className={styles.card}>
        <h3 className={styles.section}>Account</h3>
        <p className={styles.row}><span>Name</span><strong>{user?.first_name} {user?.last_name}</strong></p>
        <p className={styles.row}><span>Email</span><strong>{user?.email}</strong></p>
        <p className={styles.row}><span>Role</span><strong>{user?.role}</strong></p>
      </div>
      <div className={styles.card}>
        <h3 className={styles.section}>Attendance Windows</h3>
        <p className={styles.hint}>
          Time In: 8:00 AM – 8:30 AM · Time Out: 5:00 PM – 5:30 PM (Asia/Manila).
          Adjust per-batch schedules from the Attendance page.
        </p>
      </div>
    </div>
  );
}

export default TeacherSettings;
