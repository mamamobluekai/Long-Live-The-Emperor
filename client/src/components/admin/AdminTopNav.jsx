import { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, ChevronDown, LogOut, Settings, UserRound } from 'lucide-react';
import { getAdminNotifications, markNotificationsRead } from '../../api/adminApi';
import { isGroupChatNotification } from '../../utils/notificationFilters';
import styles from './AdminTopNav.module.css';

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

export default function AdminTopNav({ user, onLogout }) {
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState([]);
  const [unread, setUnread] = useState(0);
  const [showNotif, setShowNotif] = useState(false);
  const [loading, setLoading] = useState(false);
  const dropdownRef = useRef(null);
  const profileRef = useRef(null);
  const [profileOpen, setProfileOpen] = useState(false);

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

  const displayName = user?.first_name || user?.last_name
    ? `${user?.first_name || ''} ${user?.last_name || ''}`.trim()
    : user?.email;

  return (
    <div className={styles.topnav}>
      <div className={styles.brand}>
        <span className={styles.brandIcon}>⚙️</span>
        <span className={styles.brandName}>Admin Panel</span>
      </div>

      <div className={styles.right}>
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
                {unread > 0 ? (
                  <button type="button" className={styles.markReadLink} onClick={markAllRead}>
                    Mark all read
                  </button>
                ) : null}
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
                      <div className={styles.notifTitle}>{n.title}</div>
                      <div className={styles.notifMsg}>{n.message}</div>
                      <div className={styles.notifTime}>{formatTime(n.created_at)}</div>
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
              {onLogout && <button type="button" role="menuitem" className={styles.menuLogout} onClick={onLogout}><LogOut size={16} /> Log out</button>}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
