const { Server } = require('socket.io');

let io;

function initializeSocket(server) {
  io = new Server(server, {
    cors: {
      origin: process.env.CLIENT_URL || 'http://localhost:5173',
      methods: ['GET', 'POST'],
    },
  });

  io.on('connection', (socket) => {
    socket.on('student:join_batch', (teacherBatchId) => {
      if (teacherBatchId) {
        socket.join(`batch:${teacherBatchId}`);
        console.log(`Socket ${socket.id} joined batch:${teacherBatchId}`);
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
