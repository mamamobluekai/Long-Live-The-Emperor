import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  ChevronDown,
  LogOut,
  Menu,
  Settings,
  UserRound,
} from 'lucide-react';
import styles from './DashboardTopNav.module.css';
import NotificationBell from '../../../components/common/NotificationBell';

function DashboardTopNav({
  user,
  onLogout,
  onMenuClick,
}) {
  const navigate = useNavigate();
  const location = useLocation();
  const profileRef = useRef(null);
  const [profileOpen, setProfileOpen] = useState(false);

  const displayName =
    user?.first_name || user?.last_name
      ? `${user?.first_name || ''} ${user?.last_name || ''}`.trim()
      : user?.email || 'User';

  const role =
    user?.role
      ? user.role.charAt(0).toUpperCase() + user.role.slice(1)
      : '';

  const profilePath = `/dashboard/${user?.role?.toLowerCase()}/profile`;
  const dashboardPath = `/dashboard/${user?.role?.toLowerCase()}`;

  useEffect(() => {
    setProfileOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    function handlePointerDown(event) {
      if (profileRef.current && !profileRef.current.contains(event.target)) {
        setProfileOpen(false);
      }
    }

    function handleKeyDown(event) {
      if (event.key === 'Escape') setProfileOpen(false);
    }

    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

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
          onClick={() => navigate(dashboardPath)}
          aria-label={`Go to ${role || 'dashboard'} dashboard`}
        >
          <div className={styles.brandLogo}>
            <img
                src="/logo.png"
                alt="Work Immersion Monitoring System"
              />
          </div>

          <div className={styles.brandText}>
            <span className={styles.brandName}>e-MMERSION</span>
          </div>
        </button>

        

      </div>


      {/* =====================================
          RIGHT
      ===================================== */}
      <div className={styles.right}>

        {/* NOTIFICATIONS */}
        <NotificationBell />


        <div className={styles.verticalDivider} />


        {/* PROFILE */}
        <div className={styles.profileWrap} ref={profileRef}>
          <button
            type="button"
            onClick={() => setProfileOpen((value) => !value)}
            className={styles.profileBtn}
            aria-haspopup="menu"
            aria-expanded={profileOpen}
            aria-label={`Open ${displayName} account menu`}
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

            <ChevronDown className={styles.chevron} size={16} strokeWidth={1.8} />
          </button>

          {profileOpen && (
            <div className={styles.profileMenu} role="menu" aria-label="Account menu">
              <div className={styles.profileMenuHeader}>
                <strong>{displayName}</strong>
                <span>{user?.email || role}</span>
              </div>
              <button type="button" role="menuitem" onClick={() => navigate(profilePath)}>
                <UserRound size={16} /> View profile
              </button>
              <button type="button" role="menuitem" onClick={() => navigate(profilePath)}>
                <Settings size={16} /> Profile settings
              </button>
              {onLogout && (
                <button type="button" role="menuitem" className={styles.menuLogout} onClick={onLogout}>
                  <LogOut size={16} /> Log out
                </button>
              )}
            </div>
          )}
        </div>


      </div>

    </header>
  );
}

export default DashboardTopNav;