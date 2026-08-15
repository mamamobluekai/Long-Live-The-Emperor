const pool = require('../db');
const { getIO } = require('../sockets');

async function ensureChatTables() {
  const ddl = `
    CREATE TABLE IF NOT EXISTS batch_group_messages (
      id SERIAL PRIMARY KEY,
      teacher_batch_id INTEGER NOT NULL REFERENCES teacher_batches(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      content TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS batch_group_message_replies (
      id SERIAL PRIMARY KEY,
      parent_message_id INTEGER NOT NULL REFERENCES batch_group_messages(id) ON DELETE CASCADE,
      teacher_batch_id INTEGER NOT NULL REFERENCES teacher_batches(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      content TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_batch_group_messages_batch
      ON batch_group_messages(teacher_batch_id, created_at);

    CREATE INDEX IF NOT EXISTS idx_batch_group_message_replies_parent
      ON batch_group_message_replies(parent_message_id, created_at);
  `;
  await pool.query(ddl);

  const migrations = [
    {
      check: `SELECT 1 FROM information_schema.columns WHERE table_name = 'batch_group_messages' AND column_name = 'parent_message_id'`,
      sql: `ALTER TABLE batch_group_messages ADD COLUMN parent_message_id INTEGER REFERENCES batch_group_messages(id) ON DELETE CASCADE`,
    },
    {
      check: `SELECT 1 FROM information_schema.columns WHERE table_name = 'batch_group_messages' AND column_name = 'is_deleted'`,
      sql: `ALTER TABLE batch_group_messages ADD COLUMN is_deleted BOOLEAN NOT NULL DEFAULT false`,
    },
    {
      check: `SELECT 1 FROM information_schema.columns WHERE table_name = 'batch_group_messages' AND column_name = 'deleted_by_user_ids'`,
      sql: `ALTER TABLE batch_group_messages ADD COLUMN deleted_by_user_ids INTEGER[] DEFAULT '{}'`,
    },
    {
      check: `SELECT 1 FROM information_schema.columns WHERE table_name = 'batch_group_messages' AND column_name = 'reactions'`,
      sql: `ALTER TABLE batch_group_messages ADD COLUMN reactions JSONB DEFAULT '{}'`,
    },
    {
      check: `SELECT 1 FROM information_schema.columns WHERE table_name = 'batch_group_message_replies' AND column_name = 'is_deleted'`,
      sql: `ALTER TABLE batch_group_message_replies ADD COLUMN is_deleted BOOLEAN NOT NULL DEFAULT false`,
    },
    {
      check: `SELECT 1 FROM information_schema.columns WHERE table_name = 'batch_group_message_replies' AND column_name = 'deleted_by_user_ids'`,
      sql: `ALTER TABLE batch_group_message_replies ADD COLUMN deleted_by_user_ids INTEGER[] DEFAULT '{}'`,
    },
    {
      check: `SELECT 1 FROM information_schema.columns WHERE table_name = 'batch_group_message_replies' AND column_name = 'reactions'`,
      sql: `ALTER TABLE batch_group_message_replies ADD COLUMN reactions JSONB DEFAULT '{}'`,
    },
  ];

  for (const m of migrations) {
    const exists = await pool.query(m.check);
    if (exists.rows.length === 0) {
      await pool.query(m.sql);
    }
  }
}

async function getAccessibleBatches(req, res) {
  await ensureChatTables();
  try {
    const userId = req.user.id;
    const role = String(req.user.role || '').toLowerCase();

    let batches = [];
    if (role === 'teacher') {
      const result = await pool.query(
        `SELECT tb.id, tb.batch_label, tb.coordinator_id, tb.teacher_id, tb.supervisor_id,
                c.first_name AS coordinator_first_name, c.last_name AS coordinator_last_name,
                t.first_name AS teacher_first_name, t.last_name AS teacher_last_name,
                sv.first_name AS supervisor_first_name, sv.last_name AS supervisor_last_name
         FROM teacher_batches tb
         JOIN teachers t ON t.id = tb.teacher_id
         JOIN coordinators c ON c.id = tb.coordinator_id
         LEFT JOIN supervisors sv ON sv.user_id = tb.supervisor_id
         WHERE t.user_id = $1
         ORDER BY tb.created_at DESC`,
        [userId]
      );
      batches = result.rows.map((r) => ({
        id: r.id,
        batch_label: r.batch_label,
        coordinator: `${r.coordinator_first_name || ''} ${r.coordinator_last_name || ''}`.trim() || 'Coordinator',
        teacher: `${r.teacher_first_name || ''} ${r.teacher_last_name || ''}`.trim() || 'Teacher',
        supervisor: r.supervisor_first_name
          ? `${r.supervisor_first_name || ''} ${r.supervisor_last_name || ''}`.trim()
          : null,
      }));
    } else if (role === 'student') {
      const result = await pool.query(
        `SELECT tb.id, tb.batch_label, tb.coordinator_id, tb.teacher_id, tb.supervisor_id,
                c.first_name AS coordinator_first_name, c.last_name AS coordinator_last_name,
                t.first_name AS teacher_first_name, t.last_name AS teacher_last_name,
                sv.first_name AS supervisor_first_name, sv.last_name AS supervisor_last_name
         FROM teacher_batch_students tbs
         JOIN teacher_batches tb ON tb.id = tbs.teacher_batch_id
         JOIN students s ON s.id = tbs.student_id OR s.user_id = tbs.student_id
         JOIN users su ON su.id = s.user_id
         JOIN coordinators c ON c.id = tb.coordinator_id
         JOIN teachers t ON t.id = tb.teacher_id
         LEFT JOIN supervisors sv ON sv.user_id = tb.supervisor_id
         WHERE su.id = $1
         ORDER BY tb.created_at DESC`,
        [userId]
      );
      batches = result.rows.map((r) => ({
        id: r.id,
        batch_label: r.batch_label,
        coordinator: `${r.coordinator_first_name || ''} ${r.coordinator_last_name || ''}`.trim() || 'Coordinator',
        teacher: `${r.teacher_first_name || ''} ${r.teacher_last_name || ''}`.trim() || 'Teacher',
        supervisor: r.supervisor_first_name
          ? `${r.supervisor_first_name || ''} ${r.supervisor_last_name || ''}`.trim()
          : null,
      }));
    } else if (role === 'coordinator') {
      const result = await pool.query(
        `SELECT tb.id, tb.batch_label, tb.coordinator_id, tb.teacher_id, tb.supervisor_id,
                c.first_name AS coordinator_first_name, c.last_name AS coordinator_last_name,
                t.first_name AS teacher_first_name, t.last_name AS teacher_last_name,
                sv.first_name AS supervisor_first_name, sv.last_name AS supervisor_last_name
         FROM teacher_batches tb
         JOIN coordinators c ON c.id = tb.coordinator_id
         JOIN teachers t ON t.id = tb.teacher_id
         LEFT JOIN supervisors sv ON sv.user_id = tb.supervisor_id
         WHERE c.user_id = $1
         ORDER BY tb.created_at DESC`,
        [userId]
      );
      batches = result.rows.map((r) => ({
        id: r.id,
        batch_label: r.batch_label,
        coordinator: `${r.coordinator_first_name || ''} ${r.coordinator_last_name || ''}`.trim() || 'Coordinator',
        teacher: `${r.teacher_first_name || ''} ${r.teacher_last_name || ''}`.trim() || 'Teacher',
        supervisor: r.supervisor_first_name
          ? `${r.supervisor_first_name || ''} ${r.supervisor_last_name || ''}`.trim()
          : null,
      }));
    } else if (role === 'supervisor') {
      const result = await pool.query(
        `SELECT tb.id, tb.batch_label, tb.coordinator_id, tb.teacher_id, tb.supervisor_id,
                c.first_name AS coordinator_first_name, c.last_name AS coordinator_last_name,
                t.first_name AS teacher_first_name, t.last_name AS teacher_last_name,
                sv.first_name AS supervisor_first_name, sv.last_name AS supervisor_last_name
         FROM teacher_batches tb
         JOIN coordinators c ON c.id = tb.coordinator_id
         JOIN teachers t ON t.id = tb.teacher_id
         JOIN supervisors sv ON sv.user_id = tb.supervisor_id
         WHERE sv.user_id = $1
         ORDER BY tb.created_at DESC`,
        [userId]
      );
      batches = result.rows.map((r) => ({
        id: r.id,
        batch_label: r.batch_label,
        coordinator: `${r.coordinator_first_name || ''} ${r.coordinator_last_name || ''}`.trim() || 'Coordinator',
        teacher: `${r.teacher_first_name || ''} ${r.teacher_last_name || ''}`.trim() || 'Teacher',
        supervisor: `${r.supervisor_first_name || ''} ${r.supervisor_last_name || ''}`.trim() || 'Supervisor',
      }));
    }

    res.json({ batches });
  } catch (err) {
    console.error('getAccessibleBatches error:', err);
    res.status(500).json({ error: 'Server error fetching batches.' });
  }
}

async function ensureBatchAccess(batchId, userId, role) {
  if (role === 'teacher') {
    const check = await pool.query(
      `SELECT tb.id FROM teacher_batches tb
       JOIN teachers t ON t.id = tb.teacher_id
       WHERE tb.id = $1 AND t.user_id = $2`,
      [batchId, userId]
    );
    return check.rows.length > 0;
    } else if (role === 'student') {
      const check = await pool.query(
        `SELECT tb.id FROM teacher_batches tb
         JOIN teacher_batch_students tbs ON tbs.teacher_batch_id = tb.id
         JOIN students s ON s.id = tbs.student_id OR s.user_id = tbs.student_id
         JOIN users su ON su.id = s.user_id
         WHERE tb.id = $1 AND su.id = $2`,
        [batchId, userId]
      );
      return check.rows.length > 0;
  } else if (role === 'coordinator') {
    const check = await pool.query(
      `SELECT tb.id FROM teacher_batches tb
       JOIN coordinators c ON c.id = tb.coordinator_id
       WHERE tb.id = $1 AND c.user_id = $2`,
      [batchId, userId]
    );
    return check.rows.length > 0;
  } else if (role === 'supervisor') {
    const check = await pool.query(
      `SELECT tb.id FROM teacher_batches tb
       JOIN supervisors sv ON sv.user_id = tb.supervisor_id
       WHERE tb.id = $1 AND sv.user_id = $2`,
      [batchId, userId]
    );
    return check.rows.length > 0;
  }
  return false;
}

async function getBatchMessages(req, res) {
  await ensureChatTables();
  try {
    const { batchId } = req.params;
    const userId = req.user.id;
    const role = String(req.user.role || '').toLowerCase();

    const hasAccess = await ensureBatchAccess(batchId, userId, role);
    if (!hasAccess) {
      return res.status(403).json({ error: 'Access denied to this batch chat.' });
    }

    const messages = await pool.query(
      `SELECT m.id, m.teacher_batch_id, m.user_id, m.content, m.parent_message_id,
              m.is_deleted, m.deleted_by_user_ids, m.reactions, m.created_at,
              COALESCE(s.first_name, t.first_name, a.first_name, sup.first_name, c.first_name, '') AS first_name,
              COALESCE(s.last_name, t.last_name, a.last_name, sup.last_name, c.last_name, '') AS last_name,
              u.role AS user_role
       FROM batch_group_messages m
       JOIN users u ON u.id = m.user_id
       LEFT JOIN students s ON u.id = s.user_id AND u.role = 'student'
       LEFT JOIN teachers t ON u.id = t.user_id AND u.role = 'teacher'
       LEFT JOIN admins a ON u.id = a.user_id AND u.role = 'admin'
       LEFT JOIN supervisors sup ON u.id = sup.user_id AND u.role = 'supervisor'
       LEFT JOIN coordinators c ON u.id = c.user_id AND u.role = 'coordinator'
       WHERE m.teacher_batch_id = $1 AND m.parent_message_id IS NULL
       ORDER BY m.created_at ASC
       LIMIT 200`,
      [batchId]
    );

    const replyResult = await pool.query(
      `SELECT r.id, r.parent_message_id, r.teacher_batch_id, r.user_id, r.content,
              r.is_deleted, r.deleted_by_user_ids, r.reactions, r.created_at,
              COALESCE(s.first_name, t.first_name, a.first_name, sup.first_name, c.first_name, '') AS first_name,
              COALESCE(s.last_name, t.last_name, a.last_name, sup.last_name, c.last_name, '') AS last_name,
              u.role AS user_role
       FROM batch_group_message_replies r
       JOIN users u ON u.id = r.user_id
       LEFT JOIN students s ON u.id = s.user_id AND u.role = 'student'
       LEFT JOIN teachers t ON u.id = t.user_id AND u.role = 'teacher'
       LEFT JOIN admins a ON u.id = a.user_id AND u.role = 'admin'
       LEFT JOIN supervisors sup ON u.id = sup.user_id AND u.role = 'supervisor'
       LEFT JOIN coordinators c ON u.id = c.user_id AND u.role = 'coordinator'
       WHERE r.teacher_batch_id = $1
       ORDER BY r.created_at ASC`,
      [batchId]
    );

    const repliesByParent = new Map();
    for (const r of replyResult.rows) {
      if (!repliesByParent.has(r.parent_message_id)) {
        repliesByParent.set(r.parent_message_id, []);
      }
      repliesByParent.get(r.parent_message_id).push(r);
    }

    const enriched = messages.rows.map((m) => ({
      ...m,
      replies: repliesByParent.get(m.id) || [],
    }));

    res.json({ messages: enriched });
  } catch (err) {
    console.error('getBatchMessages error:', err);
    res.status(500).json({ error: 'Server error fetching messages.' });
  }
}

async function createBatchMessage(req, res) {
  await ensureChatTables();
  try {
    const { batchId } = req.params;
    const { content, parentMessageId } = req.body;

    if (!content || !content.trim()) {
      return res.status(400).json({ error: 'Message content is required.' });
    }

    const userId = req.user.id;
    const role = String(req.user.role || '').toLowerCase();

    const hasAccess = await ensureBatchAccess(batchId, userId, role);
    if (!hasAccess) {
      return res.status(403).json({ error: 'Access denied to this batch chat.' });
    }

    const isReply = Boolean(parentMessageId);

    if (isReply) {
      const parentCheck = await pool.query(
        `SELECT id FROM batch_group_messages WHERE id = $1 AND teacher_batch_id = $2`,
        [parentMessageId, batchId]
      );
      if (parentCheck.rows.length === 0) {
        return res.status(404).json({ error: 'Parent message not found.' });
      }
    }

    const table = isReply ? 'batch_group_message_replies' : 'batch_group_messages';
    const result = await pool.query(
      `INSERT INTO ${table} (teacher_batch_id, user_id, content, parent_message_id)
       VALUES ($1, $2, $3, $4)
       RETURNING id, teacher_batch_id, user_id, content, parent_message_id, is_deleted, deleted_by_user_ids, reactions, created_at`,
      [batchId, userId, content.trim(), isReply ? parentMessageId : null]
    );

    const message = result.rows[0];
    const authorResult = await pool.query(
      `SELECT COALESCE(s.first_name, t.first_name, a.first_name, sup.first_name, c.first_name, '') AS first_name,
              COALESCE(s.last_name, t.last_name, a.last_name, sup.last_name, c.last_name, '') AS last_name,
              u.role AS user_role
       FROM users u
       LEFT JOIN students s ON u.id = s.user_id AND u.role = 'student'
       LEFT JOIN teachers t ON u.id = t.user_id AND u.role = 'teacher'
       LEFT JOIN admins a ON u.id = a.user_id AND u.role = 'admin'
       LEFT JOIN supervisors sup ON u.id = sup.user_id AND u.role = 'supervisor'
       LEFT JOIN coordinators c ON u.id = c.user_id AND u.role = 'coordinator'
       WHERE u.id = $1`,
      [userId]
    );

    const enrichedMessage = {
      ...message,
      first_name: authorResult.rows[0]?.first_name || '',
      last_name: authorResult.rows[0]?.last_name || '',
      user_role: authorResult.rows[0]?.user_role || role,
      replies: [],
    };

    res.status(201).json({ message: enrichedMessage });

    try {
      getIO().to(`chat:batch:${batchId}`).emit('chat:new_message', enrichedMessage);
      if (isReply) {
        getIO().to(`chat:batch:${batchId}`).emit('chat:new_reply', { parentMessageId, reply: enrichedMessage });
      }
    } catch (socketErr) {
      console.error('Socket emit error:', socketErr);
    }
  } catch (err) {
    console.error('createBatchMessage error:', err);
    res.status(500).json({ error: 'Server error sending message.' });
  }
}

async function deleteBatchMessage(req, res) {
  await ensureChatTables();
  try {
    const { batchId, messageId } = req.params;
    const userId = req.user.id;
    const role = String(req.user.role || '').toLowerCase();
    const { deleteForEveryone } = req.body;

    const hasAccess = await ensureBatchAccess(batchId, userId, role);
    if (!hasAccess) {
      return res.status(403).json({ error: 'Access denied to this batch chat.' });
    }

    const msg = await pool.query(
      `SELECT id, user_id, is_deleted, deleted_by_user_ids FROM batch_group_messages WHERE id = $1 AND teacher_batch_id = $2`,
      [messageId, batchId]
    );

    if (msg.rows.length === 0) {
      return res.status(404).json({ error: 'Message not found.' });
    }

    const message = msg.rows[0];

    if (deleteForEveryone) {
      if (message.user_id !== userId) {
        return res.status(403).json({ error: 'Only the author can delete for everyone.' });
      }
      if (message.is_deleted) {
        return res.status(200).json({ message: 'Message already deleted.' });
      }
      await pool.query(
        `UPDATE batch_group_messages SET is_deleted = true, content = '' WHERE id = $1`,
        [messageId]
      );
      const deletePayload = { messageId, is_deleted: true, deleted_for: 'everyone' };
      res.json({ message: 'Message deleted for everyone.', ...deletePayload });
      try {
        getIO().to(`chat:batch:${batchId}`).emit('chat:message_deleted', deletePayload);
      } catch (socketErr) {
        console.error('Socket emit error:', socketErr);
      }
      return;
    } else {
      const current = Array.isArray(message.deleted_by_user_ids) ? message.deleted_by_user_ids : [];
      if (current.includes(userId)) {
        return res.status(200).json({ message: 'Message already hidden for you.' });
      }
      const updated = [...current, userId];
      await pool.query(
        `UPDATE batch_group_messages SET deleted_by_user_ids = $1 WHERE id = $2`,
        [updated, messageId]
      );
      const hidePayload = { messageId, is_deleted: false, deleted_for: 'me', userId };
      res.json({ message: 'Message hidden for you.', ...hidePayload });
      try {
        getIO().to(`chat:batch:${batchId}`).emit('chat:message_hidden', hidePayload);
      } catch (socketErr) {
        console.error('Socket emit error:', socketErr);
      }
      return;
    }
  } catch (err) {
    console.error('deleteBatchMessage error:', err);
    res.status(500).json({ error: 'Server error deleting message.' });
  }
}

async function addReaction(req, res) {
  await ensureChatTables();
  try {
    const { batchId, messageId } = req.params;
    const { emoji } = req.body;
    const userId = req.user.id;
    const role = String(req.user.role || '').toLowerCase();

    if (!emoji || !emoji.trim()) {
      return res.status(400).json({ error: 'Emoji is required.' });
    }

    const hasAccess = await ensureBatchAccess(batchId, userId, role);
    if (!hasAccess) {
      return res.status(403).json({ error: 'Access denied to this batch chat.' });
    }

    const msg = await pool.query(
      `SELECT id, reactions FROM batch_group_messages WHERE id = $1 AND teacher_batch_id = $2`,
      [messageId, batchId]
    );

    if (msg.rows.length === 0) {
      return res.status(404).json({ error: 'Message not found.' });
    }

    const reactions = msg.rows[0].reactions || {};
    const users = Array.isArray(reactions[emoji]) ? reactions[emoji] : [];
    if (!users.includes(userId)) {
      users.push(userId);
    }
    reactions[emoji] = users;

    await pool.query(
      `UPDATE batch_group_messages SET reactions = $1 WHERE id = $2`,
      [reactions, messageId]
    );

    const reactionPayload = { messageId, reactions };
    res.json({ reactions });
    try {
      getIO().to(`chat:batch:${batchId}`).emit('chat:reaction_updated', reactionPayload);
    } catch (socketErr) {
      console.error('Socket emit error:', socketErr);
    }
  } catch (err) {
    console.error('addReaction error:', err);
    res.status(500).json({ error: 'Server error adding reaction.' });
  }
}

async function removeReaction(req, res) {
  await ensureChatTables();
  try {
    const { batchId, messageId } = req.params;
    const { emoji } = req.body;
    const userId = req.user.id;
    const role = String(req.user.role || '').toLowerCase();

    if (!emoji || !emoji.trim()) {
      return res.status(400).json({ error: 'Emoji is required.' });
    }

    const hasAccess = await ensureBatchAccess(batchId, userId, role);
    if (!hasAccess) {
      return res.status(403).json({ error: 'Access denied to this batch chat.' });
    }

    const msg = await pool.query(
      `SELECT id, reactions FROM batch_group_messages WHERE id = $1 AND teacher_batch_id = $2`,
      [messageId, batchId]
    );

    if (msg.rows.length === 0) {
      return res.status(404).json({ error: 'Message not found.' });
    }

    const reactions = msg.rows[0].reactions || {};
    const users = Array.isArray(reactions[emoji]) ? reactions[emoji] : [];
    const updated = users.filter((id) => id !== userId);
    if (updated.length > 0) {
      reactions[emoji] = updated;
    } else {
      delete reactions[emoji];
    }

    await pool.query(
      `UPDATE batch_group_messages SET reactions = $1 WHERE id = $2`,
      [reactions, messageId]
    );

    const reactionPayload = { messageId, reactions };
    res.json({ reactions });
    try {
      getIO().to(`chat:batch:${batchId}`).emit('chat:reaction_updated', reactionPayload);
    } catch (socketErr) {
      console.error('Socket emit error:', socketErr);
    }
  } catch (err) {
    console.error('removeReaction error:', err);
    res.status(500).json({ error: 'Server error removing reaction.' });
  }
}

module.exports = {
  ensureChatTables,
  getAccessibleBatches,
  getBatchMessages,
  createBatchMessage,
  deleteBatchMessage,
  addReaction,
  removeReaction,
};
