import { useNavigate } from 'react-router-dom';
import {
  Menu,
  Bell,
  ChevronDown,
} from 'lucide-react';
import styles from './DashboardTopNav.module.css';

function DashboardTopNav({
  user,
  onLogout,
  onMenuClick,
}) {
  const navigate = useNavigate();

  const displayName =
    user?.first_name || user?.last_name
      ? `${user?.first_name || ''} ${user?.last_name || ''}`.trim()
      : user?.email || 'User';

  const role =
    user?.role
      ? user.role.charAt(0).toUpperCase() + user.role.slice(1)
      : '';

  const profilePath = `/dashboard/${user?.role?.toLowerCase()}/profile`;

  return (
    <header className={styles.topnav}>

      {/* =====================================
          LEFT — BRAND
      ===================================== */}
      <div className={styles.left}>

        {/* MOBILE MENU */}
        <button
          type="button"
          className={styles.menuButton}
          onClick={onMenuClick}
          aria-label="Open navigation menu"
        >
          <Menu size={21} strokeWidth={1.8} />
        </button>

        {/* BRAND */}
        <button
          type="button"
          className={styles.brand}
          onClick={() => navigate('/dashboard')}
        >
          <div className={styles.brandLogo}>
            <img
                src="/logo.png"
                alt="Work Immersion Monitoring System"
              />
          </div>

          <div className={styles.brandText}>
            <span className={styles.brandName}>
              e-MMERSION
            </span>

          </div>
        </button>

        

      </div>


      {/* =====================================
          RIGHT
      ===================================== */}
      <div className={styles.right}>

        {/* NOTIFICATIONS */}
        <button
          type="button"
          className={styles.notificationButton}
          aria-label="Notifications"
        >
          <Bell size={19} strokeWidth={1.8} />

          {/* Remove this if you don't have notifications yet */}
          <span className={styles.notificationDot} />
        </button>


        <div className={styles.verticalDivider} />


        {/* PROFILE */}
        <button
          type="button"
          onClick={() => navigate(profilePath)}
          className={styles.profileBtn}
        >

          {/* AVATAR */}
          {user?.photo_url ? (
            <img
              src={user.photo_url}
              alt=""
              className={styles.avatar}
            />
          ) : (
            <div className={styles.avatarPlaceholder}>
              {(displayName || 'U')
                .charAt(0)
                .toUpperCase()}
            </div>
          )}

          {/* USER INFO */}
          <div className={styles.user}>
            <span className={styles.userName}>
              {displayName}
            </span>

            <span className={styles.userRole}>
              {role}
            </span>
          </div>

          <ChevronDown
            className={styles.chevron}
            size={16}
            strokeWidth={1.8}
          />

        </button>


        {/* LOGOUT */}
        {onLogout && (
          <button
            type="button"
            className={styles.logoutBtn}
            onClick={onLogout}
          >
            Log out
          </button>
        )}

      </div>

    </header>
  );
}

export default DashboardTopNav;