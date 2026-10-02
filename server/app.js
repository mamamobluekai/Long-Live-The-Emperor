const express = require("express")
const cors = require("cors")
const cookieParser = require('cookie-parser');
const path = require('path');
const corsOptions = require('./config/corsOption');
const securityHeaders = require('./middleware/securityHeaders');
const requestGuard = require('./middleware/requestGuard');
const { globalLimiter } = require('./middleware/rateLimiters');
const { csrfProtection, issueCsrfToken } = require('./middleware/csrfProtection');
const adminRoutes = require('./routes/admin.routes');
const userRoutes = require('./routes/user.routes');
const coordinatorRoutes = require('./routes/coordinator.routes');
const studentRoutes = require('./routes/student.routes');
const fileRoutes = require('./routes/fileRoutes');
const trackingRoutes = require('./routes/tracking.routes');
const attendanceRoutes = require('./routes/attendance.routes');
const supervisorRoutes = require('./routes/supervisor.routes');
const certificateRoutes = require('./routes/certificate.routes');
const feedRoutes = require('./routes/feed.routes');
const chatRoutes = require('./routes/chat.routes');
const evaluationRoutes = require('./routes/evaluation.routes');
const documentationRoutes = require('./routes/documentationRoutes');
const notificationRoutes = require('./routes/notification.routes');
const appealRoutes = require('./routes/appeal.routes');
const { maintenanceGuard, readMaintenance } = require('./middleware/maintenance');

const app = express();

// When deployed behind a reverse proxy (nginx / Render / Heroku) the real client
// IP arrives in X-Forwarded-For. Enabling `trust proxy` lets express-rate-limit
// key on the true client instead of the proxy. Left off locally because with no
// proxy a client could otherwise spoof the header.
if (process.env.NODE_ENV === 'production') {
  app.set('trust proxy', 1);
}
// Do not advertise the framework.
app.disable('x-powered-by');

// Security response headers incl. a strict Content-Security-Policy (#5 XSS,
// clickjacking). Replaces the default `helmet()` call so the CSP is explicit.
app.use(securityHeaders);
app.use(cors(corsOptions));
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: false, limit: '10kb' }));
app.use(cookieParser());

// Issue a CSRF token cookie before any state-changing route can be reached.
app.use(issueCsrfToken);
// Verify the double-submit token on mutations (#6 CSRF).
app.use(csrfProtection);

// Block obvious injection payloads early (#1 SQLi, #5 XSS, path traversal).
app.use(requestGuard);

// Global flood ceiling for the whole API (#4 DDoS / API flooding).
app.use('/api', globalLimiter);

app.use('/uploads', express.static(path.join(__dirname, 'uploads'), {
  // Uploaded files are user-controlled; never let the browser sniff a type it
  // could execute, and force a download for anything non-image.
  setHeaders(res, filePath) {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    if (!/\.(png|jpe?g|gif|webp)$/i.test(filePath)) {
      res.setHeader('Content-Disposition', 'attachment');
    }
  },
}));


app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Unauthenticated so the login screen can read the flag and show the reason.
app.get('/api/maintenance/status', async (req, res) => {
  const status = await readMaintenance();
  res.json({ maintenance: status });
});

// Runs before the routers so maintenance mode applies to every route. Admins
// and unauthenticated callers pass through untouched.
app.use(maintenanceGuard);

app.use('/api/admin', adminRoutes);
app.use('/api/users', userRoutes);
app.use('/api/coordinator', coordinatorRoutes);
app.use('/api/student', studentRoutes);
app.use('/api/files', fileRoutes);
app.use('/api/tracking', trackingRoutes);
app.use('/api/attendance', attendanceRoutes);
app.use('/api/supervisor', supervisorRoutes);
app.use('/api/certificate', certificateRoutes);
app.use('/api/supervisor/certificate', certificateRoutes);
app.use('/api/feed', feedRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/evaluation', evaluationRoutes);
app.use('/api/documentation', documentationRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/appeals', appealRoutes);

app.use((req, res) => {
  res.status(404).json({ error: 'Route not found.' });
});

module.exports = app;