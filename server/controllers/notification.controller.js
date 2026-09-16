const notificationService = require('../services/notification.service');

async function getNotifications(req, res) {
  try {
    const notifications = await notificationService.getNotifications(req.user.id, req.query.limit);
    const unreadCount = await notificationService.getUnreadCount(req.user.id);
    res.json({ notifications, unreadCount });
  } catch (err) {
    console.error('Get notifications error:', err);
    res.status(500).json({ error: 'Failed to load notifications.' });
  }
}

async function getUnreadCount(req, res) {
  try {
    const unreadCount = await notificationService.getUnreadCount(req.user.id);
    res.json({ unreadCount });
  } catch (err) {
    console.error('Get unread notification count error:', err);
    res.status(500).json({ error: 'Failed to load notification count.' });
  }
}

async function markRead(req, res) {
  try {
    const updated = await notificationService.markNotificationRead(req.user.id, req.params.id);
    if (!updated) return res.status(404).json({ error: 'Notification not found.' });
    res.json({ success: true });
  } catch (err) {
    console.error('Mark notification read error:', err);
    res.status(500).json({ error: 'Failed to mark notification as read.' });
  }
}

async function markAllRead(req, res) {
  try {
    await notificationService.markAllNotificationsRead(req.user.id);
    res.json({ success: true });
  } catch (err) {
    console.error('Mark all notifications read error:', err);
    res.status(500).json({ error: 'Failed to mark notifications as read.' });
  }
}

module.exports = { getNotifications, getUnreadCount, markRead, markAllRead };
