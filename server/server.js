require('dotenv').config();

const http = require('http');
const app = require('./app');
const pool = require('./db');
const { initializeSocket } = require('./sockets');
const { startAttendancePushReminders } = require('./services/attendancePush.service');

const PORT = process.env.PORT || 5000;

const server = http.createServer(app);

server.listen(PORT, '0.0.0.0', async () => {
  console.log(`Server running on port ${PORT}`);

  initializeSocket(server);
  startAttendancePushReminders();

  try {
    const result = await pool.query('SELECT NOW() as current_time');
    console.log('Database connected:', result.rows[0].current_time);
  } catch (err) {
    console.error('Database connection failed:', err.message);
  }
});