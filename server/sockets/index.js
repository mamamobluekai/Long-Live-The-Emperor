const { Server } = require('socket.io');
const { verifyAccessToken } = require('../utils/generateToken');
const pool = require('../db');

let io;

async function canAccessBatch(batchId, userId, role) {
  if (!batchId) return false;

  if (role === 'student') {
    const result = await pool.query(
      `SELECT 1 FROM teacher_batch_students tbs
       JOIN students s ON s.id = tbs.student_id
       WHERE tbs.teacher_batch_id = $1 AND s.user_id = $2
       LIMIT 1`,
      [batchId, userId]
    );
    return result.rows.length > 0;
  }

  if (role === 'teacher') {
    const result = await pool.query(
      `SELECT 1 FROM teacher_batches tb
       JOIN teachers t ON t.id = tb.teacher_id
       WHERE tb.id = $1 AND t.user_id = $2 LIMIT 1`,
      [batchId, userId]
    );
    return result.rows.length > 0;
  }

  if (role === 'coordinator') {
    const result = await pool.query(
      `SELECT 1 FROM teacher_batches tb
       JOIN coordinators c ON c.id = tb.coordinator_id
       WHERE tb.id = $1 AND c.user_id = $2 LIMIT 1`,
      [batchId, userId]
    );
    return result.rows.length > 0;
  }

  if (role === 'supervisor') {
    const result = await pool.query(
      `SELECT 1 FROM teacher_batches tb
       JOIN supervisors sv ON sv.user_id = tb.supervisor_id
       WHERE tb.id = $1 AND sv.user_id = $2 LIMIT 1`,
      [batchId, userId]
    );
    return result.rows.length > 0;
  }

  return false;
}

function initializeSocket(server) {
  io = new Server(server, {
    cors: {
      origin: process.env.CLIENT_URL || 'http://localhost:5173',
      methods: ['GET', 'POST'],
    },
  });

  io.use((socket, next) => {
    try {
      const token = socket.handshake.auth?.token;
      const user = token ? verifyAccessToken(token) : null;
      if (!user?.id) return next(new Error('Unauthorized'));
      socket.data.user = user;
      return next();
    } catch (err) {
      return next(new Error('Unauthorized'));
    }
  });

  io.on('connection', (socket) => {
    const user = socket.data.user;
    socket.join(`user:${user.id}`);

    const hasAccess = async (teacherBatchId) => {
      if (!teacherBatchId) return false;
      try {
        return await canAccessBatch(teacherBatchId, user.id, user.role);
      } catch (err) {
        console.error('Socket batch access check failed:', err);
        return false;
      }
    };

    socket.on('student:join_batch', async (teacherBatchId) => {
      if (await hasAccess(teacherBatchId)) {
        socket.join(`batch:${teacherBatchId}`);
        console.log(`Socket ${socket.id} joined batch:${teacherBatchId}`);
      } else {
        socket.emit('student:error', { error: 'Access denied.' });
      }
    });

    socket.on('chat:join_batch', async (teacherBatchId) => {
      if (await hasAccess(teacherBatchId)) {
        socket.join(`chat:batch:${teacherBatchId}`);
        console.log(`Socket ${socket.id} joined chat batch:${teacherBatchId}`);
      } else {
        socket.emit('chat:error', { error: 'Access denied.' });
      }
    });

    socket.on('chat:leave_batch', async (teacherBatchId) => {
      if (await hasAccess(teacherBatchId)) {
        socket.leave(`chat:batch:${teacherBatchId}`);
        console.log(`Socket ${socket.id} left chat batch:${teacherBatchId}`);
      }
    });

    socket.on('disconnect', () => {
      console.log(`Socket ${socket.id} disconnected`);
    });
  });

  console.log('Socket.IO server initialized');
}

function getIO() {
  if (!io) {
    throw new Error('Socket.IO not initialized. Call initializeSocket first.');
  }
  return io;
}

module.exports = { initializeSocket, getIO };
