import { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Bell,
  ChevronDown,
  LogOut,
  Menu,
  Settings,
  UserRound,
  CheckCheck,
  Trash2,
  X,
} from 'lucide-react';
import {
  getAdminNotifications,
  markNotificationsRead,
  deleteAdminNotification,
  deleteAllAdminNotifications,
} from '../../api/adminApi';
import { isGroupChatNotification } from '../../utils/notificationFilters';
import styles from './AdminTopNav.module.css';
import LogoutConfirmDialog from '../../pages/dashboards/sharedSidebar/LogoutConfirmDialog';

function formatTime(date) {
  const d = new Date(date);
  const now = new Date();
  const diffMin = Math.floor((now - d) / 60000);
  if (diffMin < 1) return 'Just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `${diffH}h ago`;
  return d.toLocaleDateString();
}

export default function AdminTopNav({ user, onLogout, onMenuClick }) {
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState([]);
  const [unread, setUnread] = useState(0);
  const [showNotif, setShowNotif] = useState(false);
  const [loading, setLoading] = useState(false);
  const dropdownRef = useRef(null);
  const profileRef = useRef(null);
  const [profileOpen, setProfileOpen] = useState(false);
  const [confirmClearAll, setConfirmClearAll] = useState(false);
  const [logoutOpen, setLogoutOpen] = useState(false);

  useEffect(() => {
    if (!user) return;
    const load = async () => {
      setLoading(true);
      try {
        const data = await getAdminNotifications();
        const notes = (data.notifications || []).filter(n => !isGroupChatNotification(n));
        setNotifications(notes);
        setUnread(notes.filter((n) => !n.is_read).length);
      } catch (e) {
        console.error('Failed to load notifications:', e.message);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [user]);

  useEffect(() => {
    const close = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setShowNotif(false);
      }
      if (profileRef.current && !profileRef.current.contains(e.target)) {
        setProfileOpen(false);
      }
    };
    if (showNotif || profileOpen) {
      document.addEventListener('mousedown', close);
      return () => document.removeEventListener('mousedown', close);
    }
  }, [showNotif, profileOpen]);

  useEffect(() => {
    const closeOnEscape = (event) => {
      if (event.key === 'Escape') {
        setShowNotif(false);
        setProfileOpen(false);
      }
    };
    document.addEventListener('keydown', closeOnEscape);
    return () => document.removeEventListener('keydown', closeOnEscape);
  }, []);

  const markAllRead = async () => {
    try {
      await markNotificationsRead();
      setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
      setUnread(0);
    } catch (e) {
      console.error('Failed to mark notifications read:', e.message);
    }
  };

  const handleDelete = async (id) => {
    const previous = notifications;

    // Remove it locally first so the list responds immediately.
    const remaining = notifications.filter((n) => n.id !== id);
    setNotifications(remaining);
    setUnread(remaining.filter((n) => !n.is_read).length);

    try {
      await deleteAdminNotification(id);
    } catch (e) {
      setNotifications(previous);
      setUnread(previous.filter((n) => !n.is_read).length);
      console.error('Failed to delete notification:', e.message);
    }
  };

  const handleDeleteAll = async () => {
    try {
      await deleteAllAdminNotifications();
      setNotifications([]);
      setUnread(0);
      setConfirmClearAll(false);
    } catch (e) {
      setConfirmClearAll(false);
      console.error('Failed to clear notifications:', e.message);
    }
  };

  const openNotification = (notification) => {
    setShowNotif(false);

    if (notification.action_url) {
      navigate(notification.action_url);
    }
  };

  const displayName = user?.first_name || user?.last_name
    ? `${user?.first_name || ''} ${user?.last_name || ''}`.trim()
    : user?.email;

  return (
    <div className={styles.topnav}>
      {/* The gear/"Admin Panel" branding moved to the sidebar branding block, where
        every role's logo and system name now live. The topbar starts at the
        sidebar's right edge and carries only the controls. */}
      <div className={styles.right}>
        {/* Hamburger: only the mobile/tablet drawer needs it, so the CSS hides
            it on desktop where the sidebar is always visible. */}
        <button
          type="button"
          className={styles.menuButton}
          onClick={onMenuClick}
          aria-label="Open navigation menu"
        >
          <Menu size={21} strokeWidth={1.8} />
        </button>

        <div className={styles.notificationWrapper} ref={dropdownRef}>
          <button
            type="button"
            className={styles.notifBtn}
            onClick={() => setShowNotif((v) => !v)}
          >
            <Bell size={19} aria-hidden="true" />
            {unread > 0 ? <span className={styles.badge}>{unread}</span> : null}
          </button>
          {showNotif && (
            <div className={styles.dropdown}>
              <div className={styles.dropdownHeader}>
                <span>Notifications</span>

                <div className={styles.dropdownHeaderActions}>
                  {unread > 0 ? (
                    <button
                      type="button"
                      className={styles.headerAction}
                      onClick={markAllRead}
                      title="Mark all as read"
                    >
                      <CheckCheck size={14} />
                      Mark all read
                    </button>
                  ) : null}

                  {notifications.length > 0 ? (
                    confirmClearAll ? (
                      <button
                        type="button"
                        className={`${styles.headerAction} ${styles.headerActionDanger}`}
                        onClick={handleDeleteAll}
                      >
                        Confirm delete
                      </button>
                    ) : (
                      <button
                        type="button"
                        className={`${styles.headerAction} ${styles.headerActionDanger}`}
                        onClick={() => setConfirmClearAll(true)}
                        title="Delete all notifications"
                      >
                        <Trash2 size={14} />
                        Delete all
                      </button>
                    )
                  ) : null}
                </div>
              </div>

              <div className={styles.dropdownBody}>
                {loading ? (
                  <div className={styles.dropdownItem}>Loading…</div>
                ) : notifications.length > 0 ? (
                  notifications.map((n) => (
                    <div
                      key={n.id}
                      className={`${styles.dropdownItem} ${n.is_read ? styles.read : styles.unread}`}
                    >
                      <button
                        type="button"
                        className={styles.notifMain}
                        onClick={() => openNotification(n)}
                      >
                        <div className={styles.notifTitle}>{n.title}</div>
                        <div className={styles.notifMsg}>{n.message}</div>
                        <div className={styles.notifTime}>
                          {formatTime(n.created_at)}
                        </div>
                      </button>

                      <button
                        type="button"
                        className={styles.notifDelete}
                        onClick={() => handleDelete(n.id)}
                        aria-label={`Delete notification: ${n.title}`}
                        title="Delete notification"
                      >
                        <X size={15} />
                      </button>
                    </div>
                  ))
                ) : (
                  <div className={styles.dropdownItem}>No notifications.</div>
                )}
              </div>
            </div>
          )}
        </div>

        <div className={styles.profileWrap} ref={profileRef}>
          <button
            type="button"
            onClick={() => setProfileOpen((value) => !value)}
            className={styles.profileBtn}
            aria-haspopup="menu"
            aria-expanded={profileOpen}
            aria-label={`Open ${displayName} account menu`}
          >
          {user?.photo_url ? (
            <img src={user.photo_url} alt="Profile" className={styles.avatar} />
          ) : (
            <div className={styles.avatarPlaceholder}>
              {(displayName || 'U').charAt(0).toUpperCase()}
            </div>
          )}
          <div className={styles.user}>
            <span className={styles.userName}>{displayName}</span>
            <span className={styles.userRole}>{user?.role || ''}</span>
          </div>
            <ChevronDown size={16} aria-hidden="true" />
          </button>
          {profileOpen && (
            <div className={styles.profileMenu} role="menu" aria-label="Admin account menu">
              <div className={styles.profileMenuHeader}><strong>{displayName}</strong><span>{user?.email || 'Administrator'}</span></div>
              <button type="button" role="menuitem" onClick={() => navigate('/dashboard/admin/profile')}><UserRound size={16} /> View profile</button>
              <button type="button" role="menuitem" onClick={() => navigate('/dashboard/admin/settings')}><Settings size={16} /> Settings</button>
              {onLogout && <button type="button" role="menuitem" className={styles.menuLogout} onClick={() => { setProfileOpen(false); setLogoutOpen(true); }}><LogOut size={16} /> Log out</button>}
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
    </div>
  );
}
