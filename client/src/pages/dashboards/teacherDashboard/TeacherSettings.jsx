import { useAuth } from '../../../context/AuthContext';
import { useTheme } from '../../../context/themeContextValue';
import { Sun, Moon } from 'lucide-react';
import styles from './TeacherSettings.module.css';

function TeacherSettings() {
  const { user } = useAuth();
  const { theme, setTheme } = useTheme();
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
          Attendance opens and closes automatically using the window times your
          supervisor saved for each batch (default: Time In 8:00 AM &ndash; 8:30 AM,
          Time Out 5:00 PM &ndash; 5:30 PM, Asia/Manila). Students see the exact
          window for their own batch on the Attendance page.
        </p>
      </div>
      <div className={styles.card}>
        <h3 className={styles.section}>Additional Settings</h3>
        <div className={styles.themeToggle}>
          <label className={styles.themeLabel}>Theme</label>
          <div className={styles.themeButtons}>
            <button
              type="button"
              className={`${styles.themeButton} ${theme === 'light' ? styles.themeButtonActive : ''}`}
              onClick={() => setTheme('light')}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '10px 16px',
                border: `1px solid ${theme === 'light' ? '#581725' : '#e8dcdf'}`,
                borderRadius: '10px',
                background: theme === 'light' ? 'linear-gradient(135deg, #581725 0%, #6d1e30 100%)' : '#ffffff',
                color: theme === 'light' ? '#ffffff' : '#3d3034',
                fontFamily: 'inherit',
                fontSize: '0.9rem',
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
            >
              <Sun size={16} />
              Light
            </button>
            <button
              type="button"
              className={`${styles.themeButton} ${theme === 'dark' ? styles.themeButtonActive : ''}`}
              onClick={() => setTheme('dark')}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '10px 16px',
                border: `1px solid ${theme === 'dark' ? '#8b1e2d' : '#e8dcdf'}`,
                borderRadius: '10px',
                background: theme === 'dark' ? 'linear-gradient(135deg, #8b1e2d 0%, #6d1e30 100%)' : '#ffffff',
                color: theme === 'dark' ? '#ffffff' : '#3d3034',
                fontFamily: 'inherit',
                fontSize: '0.9rem',
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
            >
              <Moon size={16} />
              Dark
            </button>
          </div>
          <p className={styles.themeHint}>Choose your preferred color scheme. Changes apply immediately.</p>
        </div>
      </div>
    </div>
  );
}

export default TeacherSettings;
