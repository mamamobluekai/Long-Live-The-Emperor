const pool = require('../db');
const { getIO } = require('../sockets');

let schemaReady;

async function ensureNotificationSchema() {
  if (!schemaReady) {
    schemaReady = pool.query(`
      CREATE TABLE IF NOT EXISTS notifications (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        title VARCHAR(255) NOT NULL,
        message TEXT NOT NULL,
        type VARCHAR(50) NOT NULL DEFAULT 'info',
        is_read BOOLEAN NOT NULL DEFAULT false,
        action_url TEXT,
        related_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
      ALTER TABLE notifications ADD COLUMN IF NOT EXISTS category VARCHAR(50) NOT NULL DEFAULT 'general';
      ALTER TABLE notifications ADD COLUMN IF NOT EXISTS priority VARCHAR(20) NOT NULL DEFAULT 'normal';
      ALTER TABLE notifications ADD COLUMN IF NOT EXISTS entity_type VARCHAR(50);
      ALTER TABLE notifications ADD COLUMN IF NOT EXISTS entity_id INTEGER;
      ALTER TABLE notifications ADD COLUMN IF NOT EXISTS event_key VARCHAR(255);
      ALTER TABLE notifications ADD COLUMN IF NOT EXISTS read_at TIMESTAMP;
      CREATE INDEX IF NOT EXISTS idx_notifications_user_unread
        ON notifications(user_id, is_read, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_notifications_user_created
        ON notifications(user_id, created_at DESC);
      CREATE UNIQUE INDEX IF NOT EXISTS idx_notifications_user_event
        ON notifications(user_id, event_key)
        WHERE event_key IS NOT NULL;
    `).catch((err) => {
      schemaReady = null;
      throw err;
    });
  }
  await schemaReady;
}

async function emitToUser(userId, notification) {
  try {
    getIO().to(`user:${userId}`).emit('notification:new', notification);
  } catch (err) {
    // Notification persistence must not break the action that created it.
    console.error('Notification socket emit failed:', err.message);
  }
}

async function createNotification({
  userId,
  title,
  message,
  type = 'info',
  category = 'general',
  priority = 'normal',
  actionUrl = '',
  relatedUserId = null,
  entityType = null,
  entityId = null,
  eventKey = null,
}) {
  if (!userId) return null;
  await ensureNotificationSchema();

  const result = await pool.query(
    `INSERT INTO notifications
      (user_id, title, message, type, category, priority, action_url,
       related_user_id, entity_type, entity_id, event_key)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
     ON CONFLICT (user_id, event_key) WHERE event_key IS NOT NULL DO NOTHING
     RETURNING id, user_id, title, message, type, category, priority,
               is_read, action_url, related_user_id, entity_type, entity_id,
               event_key, created_at`,
    [userId, title, message, type, category, priority, actionUrl, relatedUserId, entityType, entityId, eventKey]
  );

  const notification = result.rows[0] || null;
  if (notification) await emitToUser(userId, notification);
  return notification;
}

async function notifyUsers(userIds, payload) {
  const uniqueIds = [...new Set((userIds || []).filter(Boolean).map(Number))];
  return Promise.all(uniqueIds.map((userId) => createNotification({ ...payload, userId })));
}

async function getBatchTeacherUserId(batchId) {
  const result = await pool.query(
    `SELECT t.user_id
     FROM teacher_batches tb
     JOIN teachers t ON t.id = tb.teacher_id
     WHERE tb.id = $1`,
    [batchId]
  );
  return result.rows[0]?.user_id || null;
}

async function getStudentUserId(studentId) {
  const result = await pool.query('SELECT user_id FROM students WHERE id = $1', [studentId]);
  return result.rows[0]?.user_id || null;
}

async function getBatchStudentUserIds(batchId) {
  const result = await pool.query(
    `SELECT s.user_id
     FROM teacher_batch_students tbs
     JOIN students s ON s.id = tbs.student_id OR s.user_id = tbs.student_id
     WHERE tbs.teacher_batch_id = $1`,
    [batchId]
  );
  return result.rows.map((row) => row.user_id).filter(Boolean);
}

async function getNotifications(userId, limit = 100) {
  await ensureNotificationSchema();
  const result = await pool.query(
    `SELECT id, title, message, type, category, priority, is_read,
            action_url, related_user_id, entity_type, entity_id, event_key,
            created_at, read_at
     FROM notifications
     WHERE user_id = $1
     ORDER BY created_at DESC
     LIMIT $2`,
    [userId, Math.min(Math.max(Number(limit) || 100, 1), 100)]
  );
  return result.rows;
}

async function getUnreadCount(userId) {
  await ensureNotificationSchema();
  const result = await pool.query(
    'SELECT COUNT(*)::int AS total FROM notifications WHERE user_id = $1 AND is_read = false',
    [userId]
  );
  return Number(result.rows[0]?.total) || 0;
}

async function markNotificationRead(userId, notificationId) {
  await ensureNotificationSchema();
  const result = await pool.query(
    `UPDATE notifications
     SET is_read = true, read_at = COALESCE(read_at, CURRENT_TIMESTAMP)
     WHERE id = $1 AND user_id = $2
     RETURNING id`,
    [notificationId, userId]
  );
  return result.rows.length > 0;
}

async function markAllNotificationsRead(userId) {
  await ensureNotificationSchema();
  await pool.query(
    `UPDATE notifications
     SET is_read = true, read_at = COALESCE(read_at, CURRENT_TIMESTAMP)
     WHERE user_id = $1 AND is_read = false`,
    [userId]
  );
}

module.exports = {
  ensureNotificationSchema,
  createNotification,
  notifyUsers,
  getBatchTeacherUserId,
  getStudentUserId,
  getBatchStudentUserIds,
  getNotifications,
  getUnreadCount,
  markNotificationRead,
  markAllNotificationsRead,
};
