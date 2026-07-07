const express = require("express")
const cors = require("cors")
const helmet = require("helmet")
const cookieParser = require('cookie-parser');
const path = require('path');
const corsOptions = require('./config/corsOption');
const adminRoutes = require('./routes/admin.routes');
const userRoutes = require('./routes/user.routes');
const coordinatorRoutes = require('./routes/coordinator.routes');
const studentRoutes = require('./routes/student.routes');

const app = express();

app.use(helmet());
app.use(cors(corsOptions));
app.use(express.json({ limit: '10kb' }));
app.use(cookieParser());
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));


app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.use('/api/admin', adminRoutes);
app.use('/api/users', userRoutes);
app.use('/api/coordinator', coordinatorRoutes);
app.use('/api/student', studentRoutes);

app.use((req, res) => {
  res.status(404).json({ error: 'Route not found.' });
});

module.exports = app;