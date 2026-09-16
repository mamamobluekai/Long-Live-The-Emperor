import { useState } from 'react';
import { Bell, CheckCheck } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useNotifications } from '../../hooks/useNotifications';
import styles from './NotificationBell.module.css';

function formatTime(value) {
  const date = new Date(value);
  const minutes = Math.floor((Date.now() - date.getTime()) / 60000);
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  if (minutes < 1440) return `${Math.floor(minutes / 60)}h ago`;
  return date.toLocaleDateString();
}

export default function NotificationBell() {
  const navigate = useNavigate();
  const { notifications, unreadCount, loading, markRead, markAllRead } = useNotifications();
  const [open, setOpen] = useState(false);

  const openNotification = async (notification) => {
    if (!notification.is_read) await markRead(notification.id);
    setOpen(false);
    if (notification.action_url) navigate(notification.action_url);
  };

  return (
    <div className={styles.wrapper}>
      <button
        type="button"
        className={styles.button}
        onClick={() => setOpen((value) => !value)}
        aria-label={`Notifications${unreadCount ? `, ${unreadCount} unread` : ''}`}
        aria-expanded={open}
      >
        <Bell size={19} strokeWidth={1.8} />
        {unreadCount > 0 && <span className={styles.badge}>{unreadCount > 99 ? '99+' : unreadCount}</span>}
      </button>

      {open && (
        <div className={styles.panel} role="dialog" aria-label="Notifications">
          <div className={styles.header}>
            <strong>Notifications</strong>
            {unreadCount > 0 && (
              <button type="button" className={styles.readAll} onClick={markAllRead}>
                <CheckCheck size={14} /> Mark all read
              </button>
            )}
          </div>
          <div className={styles.list}>
            {loading && <p className={styles.empty}>Loading...</p>}
            {!loading && notifications.length === 0 && <p className={styles.empty}>No notifications.</p>}
            {!loading && notifications.map((notification) => (
              <button
                type="button"
                key={notification.id}
                className={`${styles.item} ${notification.is_read ? styles.read : styles.unread}`}
                onClick={() => openNotification(notification)}
              >
                <span className={styles.itemTitle}>{notification.title}</span>
                <span className={styles.itemMessage}>{notification.message}</span>
                <span className={styles.itemTime}>{formatTime(notification.created_at)}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
