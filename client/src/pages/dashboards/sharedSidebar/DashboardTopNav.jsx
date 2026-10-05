import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  LogOut,
  Menu,
  Settings,
  UserRound,
} from 'lucide-react';
import styles from './DashboardTopNav.module.css';
import LogoutConfirmDialog from './LogoutConfirmDialog';
import NotificationBell from '../../../components/common/NotificationBell';
import GroupChatButton from '../../../components/common/GroupChatButton';

function DashboardTopNav({
  user,
  // NOTE: the `title` prop each dashboard passes ("Coordinator Dashboard",
  // "Teacher Dashboard", ...) is intentionally NOT destructured and NOT
  // rendered — the page title was removed from the topbar by request. It
  // stays in each caller's props with no effect.
  onLogout,
  onMenuClick,
  hideProfileOnMobile = false,
}) {
  const navigate = useNavigate();
  const location = useLocation();
  const profileRef = useRef(null);
  const [profileOpen, setProfileOpen] = useState(false);
  const [logoutOpen, setLogoutOpen] = useState(false);

  const displayName =
    user?.first_name || user?.last_name
      ? `${user?.first_name || ''} ${user?.last_name || ''}`.trim()
      : user?.email || 'User';

  const role =
    user?.role
      ? user.role.charAt(0).toUpperCase() + user.role.slice(1)
      : '';

  const profilePath = `/dashboard/${user?.role?.toLowerCase()}/profile`;

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

        {/* PAGE TITLE — removed by request. The `title` prop each dashboard
            still passes is intentionally not rendered, so the topbar no longer
            shows "Coordinator Dashboard" / "Teacher Dashboard" / etc. The logo
            and system name live in the sidebar branding block. */}

      </div>


      {/* =====================================
          RIGHT
      ===================================== */}
      <div className={styles.right}>

         {/* NOTIFICATIONS */}
         <NotificationBell />

         {/* GROUP CHAT */}
         <div className={hideProfileOnMobile ? styles.hideOnMobile : undefined}>
           <GroupChatButton user={user} />
         </div>
        <div className={styles.verticalDivider} />


        {/* PROFILE */}
        <div
          className={`${styles.profileWrap} ${hideProfileOnMobile ? styles.hideOnMobile : ''}`}
          ref={profileRef}
        >
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
                <button
                  type="button"
                  role="menuitem"
                  className={styles.menuLogout}
                  onClick={() => {
                    setProfileOpen(false);
                    setLogoutOpen(true);
                  }}
                >
                  <LogOut size={16} /> Log out
                </button>
              )}
            </div>
          )}
        </div>

</div>

      {onLogout && (
        <LogoutConfirmDialog
          isOpen={logoutOpen}
          onClose={() => setLogoutOpen(false)}
        />
      )}

    </header>
  );
}

export default DashboardTopNav;