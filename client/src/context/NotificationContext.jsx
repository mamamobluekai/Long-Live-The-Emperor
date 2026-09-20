import { useEffect, useMemo, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import {
  getNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  deleteAllNotifications,
} from '../api/notificationApi';
import { useAuth } from './AuthContext';
import { NotificationContext } from './notificationContext';

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || 'http://localhost:5000';

export function NotificationProvider({ children }) {
  const { user, token } = useAuth();
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const socketRef = useRef(null);

  useEffect(() => {
    if (!user || !token) {
      setNotifications([]);
      setUnreadCount(0);
      return undefined;
    }

    let mounted = true;
    const load = async () => {
      try {
        setLoading(true);
        const data = await getNotifications();
        if (mounted) {
          setNotifications(data.notifications || []);
          setUnreadCount(Number(data.unreadCount) || 0);
        }
      } catch (err) {
        console.error('Failed to load notifications:', err.message);
      } finally {
        if (mounted) setLoading(false);
      }
    };

    load();
    const refreshId = window.setInterval(load, 60000);
    const socket = io(SOCKET_URL, { auth: { token } });
    socketRef.current = socket;
    socket.on('notification:new', (notification) => {
      if (!mounted) return;
      setNotifications((current) => [
        notification,
        ...current.filter((item) => item.id !== notification.id),
      ].slice(0, 100));
      setUnreadCount((count) => count + (notification.is_read ? 0 : 1));
    });

    return () => {
      mounted = false;
      window.clearInterval(refreshId);
      socket.disconnect();
      socketRef.current = null;
    };
  }, [user, token]);

  const markRead = async (id) => {
    await markNotificationRead(id);
    setNotifications((current) => current.map((item) => (
      item.id === id ? { ...item, is_read: true, read_at: new Date().toISOString() } : item
    )));
    setUnreadCount((count) => Math.max(0, count - 1));
  };

  const markAllRead = async () => {
    await markAllNotificationsRead();
    setNotifications((current) => current.map((item) => ({ ...item, is_read: true })));
    setUnreadCount(0);
  };

  const deleteAll = async () => {
    await deleteAllNotifications();
    setNotifications([]);
    setUnreadCount(0);
  };

  const value = useMemo(() => ({
    notifications,
    unreadCount,
    loading,
    markRead,
    markAllRead,
    deleteAll,
  }), [notifications, unreadCount, loading]);

  return <NotificationContext.Provider value={value}>{children}</NotificationContext.Provider>;
}

