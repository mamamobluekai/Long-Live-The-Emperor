import { useAuth } from '../../../context/AuthContext';
import { useTheme } from '../../../context/themeContextValue';
import { useState } from 'react';
import { updateUserProfile } from '../../../api/userApi';
import { useToast } from '../../../components/admin/toastContext';
import styles from './TeacherSettings.module.css';

function TeacherSettings() {
  const { user, updateUser } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const { showToast } = useToast();
  const [skipSplashScreen, setSkipSplashScreen] = useState(() => {
    try {
      const val = localStorage.getItem('wim-skip-splash-screen');
      if (val === null) return true;
      return val !== 'false';
    } catch {
      return true;
    }
  });
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
          <button
            type="button"
            className={styles.themeToggleBtn}
            onClick={toggleTheme}
            aria-pressed={theme === 'dark'}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '10px',
              padding: '10px 16px',
              border: '1px solid #e8dcdf',
              borderRadius: '10px',
              background: '#ffffff',
              color: '#3d3034',
              fontFamily: 'inherit',
              fontSize: '0.9rem',
              fontWeight: 600,
              cursor: 'pointer',
              transition: 'all 0.15s ease',
              minWidth: '140px',
            }}
          >
            <span>{theme === 'dark' ? 'Dark' : 'Light'}</span>
            <span
              style={{
                width: '38px',
                height: '20px',
                borderRadius: '999px',
                background: theme === 'dark' ? '#8b1e2d' : '#dcc9cf',
                position: 'relative',
                transition: 'background 0.15s ease',
                flexShrink: 0,
              }}
            >
              <span
                style={{
                  position: 'absolute',
                  top: '2px',
                  left: theme === 'dark' ? '20px' : '2px',
                  width: '16px',
                  height: '16px',
                  borderRadius: '50%',
                  background: '#ffffff',
                  transition: 'left 0.15s ease',
                }}
              />
            </span>
          </button>
        </div>
        <div className={styles.themeToggle}>
          <label className={styles.themeLabel}>Skip Splash Screen</label>
          <button
            type="button"
            className={styles.themeToggleBtn}
            onClick={async () => {
              const next = !skipSplashScreen;
              setSkipSplashScreen(next);
              localStorage.setItem('wim-skip-splash-screen', String(next));
              try {
                await updateUserProfile({ skip_splash_screen: next });
                updateUser({ skip_splash_screen: next });
              } catch (err) {
                setSkipSplashScreen(!next);
                localStorage.setItem('wim-skip-splash-screen', String(!next));
                showToast(err.message, 'error');
              }
            }}
            aria-pressed={skipSplashScreen}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '10px',
              padding: '10px 16px',
              border: '1px solid #e8dcdf',
              borderRadius: '10px',
              background: '#ffffff',
              color: '#3d3034',
              fontFamily: 'inherit',
              fontSize: '0.9rem',
              fontWeight: 600,
              cursor: 'pointer',
              transition: 'all 0.15s ease',
              minWidth: '140px',
            }}
          >
            <span>{skipSplashScreen ? 'ON' : 'OFF'}</span>
            <span
              style={{
                width: '38px',
                height: '20px',
                borderRadius: '999px',
                background: skipSplashScreen ? '#8b1e2d' : '#dcc9cf',
                position: 'relative',
                transition: 'background 0.15s ease',
                flexShrink: 0,
              }}
            >
              <span
                style={{
                  position: 'absolute',
                  top: '2px',
                  left: skipSplashScreen ? '20px' : '2px',
                  width: '16px',
                  height: '16px',
                  borderRadius: '50%',
                  background: '#ffffff',
                  transition: 'left 0.15s ease',
                }}
              />
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}

export default TeacherSettings;
