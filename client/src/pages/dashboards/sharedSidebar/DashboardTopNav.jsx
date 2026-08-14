import { useNavigate } from 'react-router-dom';
import styles from './DashboardTopNav.module.css';

function DashboardTopNav({ user, onLogout, title }) {
  const navigate = useNavigate();
  const displayName = user?.first_name || user?.last_name
    ? `${user?.first_name || ''} ${user?.last_name || ''}`.trim()
    : user?.email;

  return (
    <div className={styles.topnav}>
      <div className={styles.brand}>
        <span className={styles.brandMark} aria-hidden="true">
          {(title || 'D').charAt(0).toUpperCase()}
        </span>
        <span className={styles.brandName}>{title}</span>
      </div>

      <div className={styles.right}>
        <button
          type="button"
          onClick={() => navigate(`/dashboard/${user?.role?.toLowerCase()}/profile`)}
          className={styles.profileBtn}
        >
          {user?.photo_url ? (
            <img src={user.photo_url} alt="" className={styles.avatar} />
          ) : (
            <div className={styles.avatarPlaceholder}>
              {(displayName || 'U').charAt(0).toUpperCase()}
            </div>
          )}
          <div className={styles.user}>
            <span className={styles.userName}>{displayName}</span>
            <span className={styles.userRole}>{user?.role || ''}</span>
          </div>
          <svg
            className={styles.chevron}
            width="14"
            height="14"
            viewBox="0 0 14 14"
            fill="none"
            aria-hidden="true"
          >
            <path
              d="M3.5 5.25L7 8.75L10.5 5.25"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>

        {onLogout ? (
          <button type="button" className={styles.logoutBtn} onClick={onLogout}>
            Log out
          </button>
        ) : null}
      </div>
    </div>
  );
}

export default DashboardTopNav;