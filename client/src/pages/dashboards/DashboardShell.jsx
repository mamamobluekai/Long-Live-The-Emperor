import { useNavigate } from 'react-router-dom';
import styles from './DashboardShell.module.css';

const roleLabels = {
  admin: 'Administrator',
  coordinator: 'Coordinator',
  teacher: 'Teacher',
  student: 'Student',
  supervisor: 'Supervisor',
};

function DashboardShell({ user, title, children, onLogout, profilePath }) {
  const navigate = useNavigate();
  const displayName = user?.first_name || user?.last_name
    ? `${user?.first_name || ''} ${user?.last_name || ''}`.trim()
    : user?.email;

  return (
    <div className={styles.container}>
      <div className={styles.inner}>
        <div className={styles.header}>
          <div>
            <p className={styles.roleLabel}>
              {roleLabels[user?.role] || 'Dashboard'}
            </p>
            <h1 className={styles.title}>{title}</h1>
          </div>
          <div className={styles.userInfo}>
            {profilePath ? (
              <button
                type="button"
                onClick={() => navigate(profilePath)}
                className={styles.profileBtn}
              >
                {user?.photo_url ? (
                  <img src={user.photo_url} alt="Profile" className={styles.avatar} />
                ) : (
                  <div className={styles.avatarPlaceholder}>
                    {(displayName || 'U').charAt(0).toUpperCase()}
                  </div>
                )}
                <div className={styles.userMeta}>
                  <strong className={styles.userName}>{displayName}</strong>
                  <div className={styles.userRole}>{user?.role || 'role'}</div>
                </div>
              </button>
            ) : (
              <div className={styles.profileBtn}>
                {user?.photo_url ? (
                  <img src={user.photo_url} alt="Profile" className={styles.avatar} />
                ) : (
                  <div className={styles.avatarPlaceholder}>
                    {(displayName || 'U').charAt(0).toUpperCase()}
                  </div>
                )}
                <div className={styles.userMeta}>
                  <strong className={styles.userName}>{displayName}</strong>
                  <div className={styles.userRole}>{user?.role || 'role'}</div>
                </div>
              </div>
            )}
            {onLogout ? (
              <button
                type="button"
                onClick={onLogout}
                className={styles.logoutBtn}
              >
                Logout
              </button>
            ) : null}
          </div>
        </div>
        {children}
      </div>
    </div>
  );
}

export default DashboardShell;