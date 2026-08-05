import { useEffect, useState } from 'react';
import { getAdminNotifications, markNotificationsRead } from '../../../api/adminApi';
import LoadingSkeleton from '../../../components/admin/LoadingSkeleton';
import styles from './Notifications.module.css';
import { useToast } from '../../../components/admin/ToastContainer';

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

export default function NotificationsPage() {
  const { showToast } = useToast();
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const data = await getAdminNotifications();
      setNotifications(data.notifications || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const markAllRead = async () => {
    try {
      await markNotificationsRead();
      setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
      showToast('All notifications marked as read.', 'success');
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  const unreadCount = notifications.filter((n) => !n.is_read).length;

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h2>Notifications</h2>
        {unreadCount > 0 ? (
          <button type="button" className={styles.markBtn} onClick={markAllRead}>Mark all read</button>
        ) : null}
      </div>

      {error ? <p className={styles.error}>{error}</p> : null}

      {loading ? (
        <LoadingSkeleton rows={6} />
      ) : notifications.length > 0 ? (
        <div className={styles.list}>
          {notifications.map((n) => (
            <div key={n.id} className={`${styles.item} ${n.is_read ? styles.read : styles.unread}`}>
              <div className={styles.itemHeader}>
                <span className={styles.title}>{n.title}</span>
                <span className={styles.type}>{n.type}</span>
                <span className={styles.time}>{formatTime(n.created_at)}</span>
              </div>
              <p className={styles.message}>{n.message}</p>
            </div>
          ))}
        </div>
      ) : (
        <p className={styles.empty}>No notifications.</p>
      )}
    </div>
  );
}
