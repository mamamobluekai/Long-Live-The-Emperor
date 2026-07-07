import styles from './DashboardShell.module.css';

const roleLabels = {
  admin: 'Administrator',
  coordinator: 'Coordinator',
  teacher: 'Teacher',
  student: 'Student',
  supervisor: 'Supervisor',
};

function DashboardShell({ user, title, children, onLogout }) {
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
            <div className={styles.userBadge}>
              <strong>{user?.email || 'User'}</strong>
              <div className={styles.userRole}>{user?.role || 'role'}</div>
            </div>
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