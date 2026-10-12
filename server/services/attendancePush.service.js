const webpush = require('web-push');
const pool = require('../db');
const { getBatchScheduleForDate } = require('../controllers/teacherControllers/immersionSchedule.controller');

const SYSTEM_TIMEZONE = 'Asia/Manila';
const POLL_INTERVAL_MS = 60 * 1000;
let timer = null;
let running = false;
let missingConfigLogged = false;

function dateInTimezone(timezone, date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function minuteInTimezone(timezone, date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return (Number(values.hour) % 24) * 60 + Number(values.minute);
}

function timeToMinutes(value) {
  const match = String(value || '').match(/^(\d{1,2}):(\d{2})/);
  return match ? Number(match[1]) * 60 + Number(match[2]) : null;
}

function isWindowOpen(now, open, close) {
  if (open === null || close === null) return false;
  return open < close
    ? now >= open && now < close
    : now >= open || now < close;
}

function getVapidConfig() {
  const { VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY } = process.env;
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) return null;
  return {
    publicKey: VAPID_PUBLIC_KEY,
    privateKey: VAPID_PRIVATE_KEY,
    subject: process.env.VAPID_SUBJECT || 'mailto:admin@example.com',
  };
}

async function sendReminderForStudent(student, reminderType, reminderDate) {
  const claim = await pool.query(
    `INSERT INTO attendance_push_reminders (user_id, teacher_batch_id, reminder_date, reminder_type)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (user_id, teacher_batch_id, reminder_date, reminder_type) DO NOTHING
     RETURNING id`,
    [student.user_id, student.teacher_batch_id, reminderDate, reminderType],
  );
  if (!claim.rows.length) return;

  const subscriptions = await pool.query(
    'SELECT id, endpoint, subscription FROM attendance_push_subscriptions WHERE user_id = $1',
    [student.user_id],
  );
  if (!subscriptions.rows.length) {
    await pool.query('DELETE FROM attendance_push_reminders WHERE id = $1', [claim.rows[0].id]);
    return;
  }

  const label = reminderType === 'time_in' ? 'Time In' : 'Time Out';
  const payload = JSON.stringify({
    title: `${label} is open`,
    body: `Your ${label} window is open. Tap to visit attendance in the app.`,
    actionLabel: label,
    url: '/dashboard/student/attendance',
  });

  let delivered = false;
  for (const item of subscriptions.rows) {
    try {
      // Sequential sends keep a large batch from opening a burst of push requests.
      // eslint-disable-next-line no-await-in-loop
      await webpush.sendNotification(item.subscription, payload);
      delivered = true;
    } catch (err) {
      if (err.statusCode === 404 || err.statusCode === 410) {
        // Endpoint has been unsubscribed or expired by the browser's push service.
        // eslint-disable-next-line no-await-in-loop
        await pool.query('DELETE FROM attendance_push_subscriptions WHERE id = $1', [item.id]);
      } else {
        console.error(`Attendance push failed for user ${student.user_id}:`, err.message);
      }
    }
  }

  if (!delivered) {
    await pool.query('DELETE FROM attendance_push_reminders WHERE id = $1', [claim.rows[0].id]);
  }
}

async function processAttendanceReminders(now = new Date()) {
  const vapid = getVapidConfig();
  if (!vapid) {
    if (!missingConfigLogged) {
      console.warn('Attendance push reminders disabled: configure VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY.');
      missingConfigLogged = true;
    }
    return;
  }
  missingConfigLogged = false;
  webpush.setVapidDetails(vapid.subject, vapid.publicKey, vapid.privateKey);

  const reminderDate = dateInTimezone(SYSTEM_TIMEZONE, now);
  const result = await pool.query(
    `SELECT DISTINCT u.id AS user_id, tbs.teacher_batch_id,
            ac.timezone, ac.time_in_open, ac.time_in_close,
            ac.time_out_open, ac.time_out_close,
            sa.check_in_time, sa.check_out_time
     FROM attendance_push_subscriptions aps
     JOIN users u ON u.id = aps.user_id AND u.role = 'student' AND u.status = 'approved'
     JOIN students s ON s.user_id = u.id
     JOIN teacher_batch_students tbs
       ON tbs.student_id = s.id OR tbs.student_id = s.user_id
     JOIN teacher_batches tb ON tb.id = tbs.teacher_batch_id
     JOIN attendance_config ac ON ac.teacher_batch_id = tb.id
     LEFT JOIN student_attendance sa
       ON sa.student_id = s.id AND sa.teacher_batch_id = tb.id AND sa.date = $1::date`,
    [reminderDate],
  );

  const validSchedules = new Map();
  for (const student of result.rows) {
    const batchId = String(student.teacher_batch_id);
    if (!validSchedules.has(batchId)) {
      // Match the attendance endpoint's date, holiday, and blocked-day checks.
      // eslint-disable-next-line no-await-in-loop
      validSchedules.set(batchId, await getBatchScheduleForDate(student.teacher_batch_id, reminderDate));
    }
    if (!validSchedules.get(batchId)) continue;

    const timezone = student.timezone || SYSTEM_TIMEZONE;
    const currentMinute = minuteInTimezone(timezone, now);
    const timeInOpen = timeToMinutes(student.time_in_open);
    const timeInClose = timeToMinutes(student.time_in_close);
    const timeOutOpen = timeToMinutes(student.time_out_open);
    const timeOutClose = timeToMinutes(student.time_out_close);

    if (!student.check_in_time && isWindowOpen(currentMinute, timeInOpen, timeInClose)) {
      // eslint-disable-next-line no-await-in-loop
      await sendReminderForStudent(student, 'time_in', reminderDate);
    } else if (
      student.check_in_time
      && !student.check_out_time
      && isWindowOpen(currentMinute, timeOutOpen, timeOutClose)
    ) {
      // eslint-disable-next-line no-await-in-loop
      await sendReminderForStudent(student, 'time_out', reminderDate);
    }
  }
}

function startAttendancePushReminders() {
  if (timer) return;
  const run = async () => {
    if (running) return;
    running = true;
    try {
      await processAttendanceReminders();
    } catch (err) {
      console.error('Attendance push reminder job failed:', err);
    } finally {
      running = false;
    }
  };
  void run();
  timer = setInterval(run, POLL_INTERVAL_MS);
}

module.exports = {
  processAttendanceReminders,
  startAttendancePushReminders,
  dateInTimezone,
  minuteInTimezone,
  timeToMinutes,
  isWindowOpen,
};
