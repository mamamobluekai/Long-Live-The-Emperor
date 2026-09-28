// Attendance scheduling + manual override, resolved in Asia/Manila time.
// Time In window  : 08:00 - 08:30
// Time Out window : 17:00 - 17:30
// The teacher can also force-open (override) attendance for a batch at any time.
const pool = require('../../db/');
const { getBatchScheduleForDate } = require('./immersionSchedule.controller');
const { notifyUsers, getBatchStudentUserIds } = require('../../services/notification.service');
const { assertBatchAccess } = require('../../utils/batchAccess');

const TZ = 'Asia/Manila';

// Returns the current time in the configured timezone as a Date built from
// the Manila wall-clock components (so window math uses local minutes).
function nowInTz(timezone = TZ) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    weekday: 'short',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());

  const map = {};
  for (const p of parts) map[p.type] = p.value;
  // hour '24' edge case in some environments -> normalize to 0
  let hour = parseInt(map.hour, 10) % 24;
  const minute = parseInt(map.minute, 10);
  const second = parseInt(map.second, 10);
  const now = new Date();
  now.setHours(hour, minute, second, 0);
  return { now, hour, minute, second };
}

function toMinutes(t) {
  // t is a JS Date whose getHours/getMinutes reflect the tz components we set
  return t.getHours() * 60 + t.getMinutes();
}

function timeToMinutes(timeStr) {
  const [h, m] = timeStr.split(':').map(Number);
  return h * 60 + m;
}

// Resolve the current attendance phase for a given batch config.
// phase: 'before_in' | 'in_open' | 'in_closed' | 'before_out' | 'out_open' | 'out_closed' | 'done'
async function resolveAttendanceState(teacherBatchId) {
  const res = await pool.query(
    `SELECT ac.* FROM attendance_config ac WHERE ac.teacher_batch_id = $1`,
    [teacherBatchId]
  );

  // No config yet -> create default for this batch.
  if (res.rows.length === 0) {
    const ins = await pool.query(
      `INSERT INTO attendance_config (teacher_batch_id) VALUES ($1)
       RETURNING *`,
      [teacherBatchId]
    );
    return computeState(ins.rows[0]);
  }
  return computeState(res.rows[0]);
}

const MINUTES_PER_DAY = 24 * 60;

// Positive modulo, so a negative offset (a window that wraps past midnight)
// still lands in the 0..1439 range.
function withinDay(v) {
  return ((v % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
}

/**
 * Validate a set of four window times.
 * Returns null when the schedule is coherent, otherwise a human-readable reason.
 *
 * The old resolver compared the four raw times as plain ascending minutes, so a
 * late shift (e.g. Time In 19:30 left with the 08:30 default as its close) made
 * the whole day collapse into the wrong phase and the new hours silently stopped
 * working. Rejecting non-coherent input up front is what stops that.
 */
function validateWindows(cfg) {
  const inOpen = timeToMinutes(String(cfg.time_in_open));
  const inClose = timeToMinutes(String(cfg.time_in_close));
  const outOpen = timeToMinutes(String(cfg.time_out_open));
  const outClose = timeToMinutes(String(cfg.time_out_close));

  if (![inOpen, inClose, outOpen, outClose].every(Number.isFinite)) {
    return 'Attendance windows must be valid 24-hour times.';
  }
  if (inOpen === inClose) {
    return 'Time In Open and Time In Close cannot be the same. Give students a window, e.g. 19:30 to 20:00.';
  }
  if (outOpen === outClose) {
    return 'Time Out Open and Time Out Close cannot be the same. Give students a window, e.g. 23:00 to 23:30.';
  }
  if (inClose > outOpen) {
    return 'The Time In window must close before the Time Out window opens.';
  }
  if (withinDay(outClose - inOpen) < withinDay(inClose - inOpen) + withinDay(outClose - outOpen)) {
    return 'The Time In and Time Out windows overlap.';
  }
  return null;
}

function computeState(cfg) {
  const { hour, minute } = nowInTz(cfg.timezone);
  const nowMin = hour * 60 + minute;

  const inOpen = timeToMinutes(String(cfg.time_in_open));
  const inClose = timeToMinutes(String(cfg.time_in_close));
  const outOpen = timeToMinutes(String(cfg.time_out_open));
  const outClose = timeToMinutes(String(cfg.time_out_close));

  const manualOpen = cfg.manual_open;

  // Measure the day relative to Time In Open instead of comparing raw clock
  // values. Each span is a forward offset that may wrap past midnight, so the
  // resolver no longer depends on the four times happening to be in ascending
  // order, and overnight shifts keep working.
  const durIn = withinDay(inClose - inOpen);
  const gap = withinDay(outOpen - inClose);
  const durOut = withinDay(outClose - outOpen);
  const rel = withinDay(nowMin - inOpen);

  let phase;
  let type = null;
  let open = false;

  if (durIn > 0 && rel < durIn) {
    phase = 'in_open';
    type = 'time_in';
    open = true;
  } else if (rel < durIn + gap) {
    phase = 'in_closed';
  } else if (durOut > 0 && rel < durIn + gap + durOut) {
    phase = 'out_open';
    type = 'time_out';
    open = true;
  } else {
    // Closed, waiting on the next cycle. Keep the original wording split so the
    // student's countdown still says "opens later" vs "closed for today".
    phase = nowMin < inOpen ? 'before_in' : 'out_closed';
  }

  // Manual override always wins and spans both types.
  if (manualOpen) {
    open = true;
    type = type || 'time_in';
  }

  return {
    attendance_open: open,
    manual_open: manualOpen,
    phase,
    active_type: type,
    timezone: cfg.timezone,
    schedule: {
      time_in: { open: cfg.time_in_open, close: cfg.time_in_close },
      time_out: { open: cfg.time_out_open, close: cfg.time_out_close },
    },
    now: { hour, minute },
  };
}

// GET /api/attendance/teacher/batch/:batchId/status
const getBatchAttendanceStatus = async (req, res) => {
  try {
    const { batchId } = req.params;
    const state = await resolveAttendanceState(batchId);
    if (!state) return res.status(404).json({ error: 'Batch not found.' });
    res.json(state);
  } catch (err) {
    console.error('getBatchAttendanceStatus error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
};

// GET /api/attendance/teacher/batch/:batchId/config
const getBatchConfig = async (req, res) => {
  try {
    const { batchId } = req.params;
    const res2 = await pool.query('SELECT * FROM attendance_config WHERE teacher_batch_id = $1', [batchId]);
    if (res2.rows.length === 0) {
      const ins = await pool.query('INSERT INTO attendance_config (teacher_batch_id) VALUES ($1) RETURNING *', [batchId]);
      return res.json(ins.rows[0]);
    }
    res.json(res2.rows[0]);
  } catch (err) {
    console.error('getBatchConfig error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
};

// PUT /api/attendance/teacher/batch/:batchId/config
const updateBatchConfig = async (req, res) => {
  const client = await pool.connect();
  try {
    const { batchId } = req.params;
    // Attendance scheduling is owned by the SUPERVISOR, but the assigned
    // teacher and the batch coordinator may also manage it.
    const gate = await assertBatchAccess(req.user, batchId);
    if (!gate.ok) return res.status(gate.denied.status).json({ error: gate.denied.error });

    const { time_in_open, time_in_close, time_out_open, time_out_close, timezone } = req.body;

    // When every window is supplied, reject a non-coherent schedule up front.
    // Previously these were stored unchecked, and a late shift such as
    // 19:30 -> 23:30 combined with the leftover 08:30/17:00 defaults saved
    // fine but resolved to a permanently closed (or time-out only) day.
    const provided = [time_in_open, time_in_close, time_out_open, time_out_close];
    if (provided.every((v) => v !== undefined && v !== null && v !== '')) {
      const problem = validateWindows({
        time_in_open: String(time_in_open).slice(0, 5),
        time_in_close: String(time_in_close).slice(0, 5),
        time_out_open: String(time_out_open).slice(0, 5),
        time_out_close: String(time_out_close).slice(0, 5),
      });
      if (problem) return res.status(400).json({ error: problem });
    }

    const fields = [];
    const values = [];
    let idx = 2;
    const pushTime = (key, val) => {
      if (val && /^\d{2}:\d{2}(:\d{2})?$/.test(String(val))) {
        fields.push(`${key} = $${idx++}`);
        values.push(String(val).slice(0, 5));
      }
    };
    pushTime('time_in_open', time_in_open);
    pushTime('time_in_close', time_in_close);
    pushTime('time_out_open', time_out_open);
    pushTime('time_out_close', time_out_close);
    if (timezone && typeof timezone === 'string') {
      fields.push(`timezone = $${idx++}`);
      values.push(timezone);
    }

    if (fields.length === 0) {
      const cur = await client.query('SELECT * FROM attendance_config WHERE teacher_batch_id = $1', [batchId]);
      if (cur.rows.length === 0) {
        const ins = await client.query('INSERT INTO attendance_config (teacher_batch_id) VALUES ($1) RETURNING *', [batchId]);
        return res.json(ins.rows[0]);
      }
      return res.json(cur.rows[0]);
    }

    const upsert = await client.query(
      `INSERT INTO attendance_config (teacher_batch_id, ${fields.map((f) => f.split(' = ')[0]).join(', ')})
       VALUES ($1, ${fields.map((_, i) => `$${i + 2}`).join(', ')})
       ON CONFLICT (teacher_batch_id) DO UPDATE SET ${fields.join(', ')}, updated_at = CURRENT_TIMESTAMP
       RETURNING *`,
      [batchId, ...values]
    );
    res.json(upsert.rows[0]);
  } catch (err) {
    console.error('updateBatchConfig error:', err);
    res.status(500).json({ error: 'Server error.' });
  } finally {
    client.release();
  }
};

// POST /api/attendance/teacher/batch/:batchId/open  (manual override ON)
const openBatchAttendance = async (req, res) => {
  try {
    const { batchId } = req.params;
    const gate = await assertBatchAccess(req.user, batchId);
    if (!gate.ok) return res.status(gate.denied.status).json({ error: gate.denied.error });

    // Manual override is intentionally allowed even when a date is not in the
    // immersion schedule, so the teacher can open attendance on demand.
    const r = await pool.query(
      `INSERT INTO attendance_config (teacher_batch_id, manual_open)
       VALUES ($1, TRUE)
       ON CONFLICT (teacher_batch_id) DO UPDATE SET manual_open = TRUE, updated_at = CURRENT_TIMESTAMP
       RETURNING manual_open`,
      [batchId]
    );
    const studentUserIds = await getBatchStudentUserIds(batchId);
    void notifyUsers(studentUserIds, {
      title: 'Attendance is open',
      message: 'Your teacher has opened attendance. You may time in now.',
      type: 'attendance',
      category: 'attendance',
      priority: 'high',
      actionUrl: '/dashboard/student/attendance',
      entityType: 'teacher_batch',
      entityId: Number(batchId),
      eventKey: `attendance-open:${batchId}:${new Date().toISOString().slice(0, 10)}`,
    }).catch((err) => console.error('Attendance-open notification failed:', err.message));
    res.json({ message: 'Attendance opened (manual override).', manual_open: r.rows[0].manual_open });
  } catch (err) {
    console.error('openBatchAttendance error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
};

// POST /api/attendance/teacher/batch/:batchId/close (manual override OFF)
const closeBatchAttendance = async (req, res) => {
  try {
    const { batchId } = req.params;
    const gate = await assertBatchAccess(req.user, batchId);
    if (!gate.ok) return res.status(gate.denied.status).json({ error: gate.denied.error });

    const r = await pool.query(
      `INSERT INTO attendance_config (teacher_batch_id, manual_open)
       VALUES ($1, FALSE)
       ON CONFLICT (teacher_batch_id) DO UPDATE SET manual_open = FALSE, updated_at = CURRENT_TIMESTAMP
       RETURNING manual_open`,
      [batchId]
    );
    const studentUserIds = await getBatchStudentUserIds(batchId);
    void notifyUsers(studentUserIds, {
      title: 'Attendance closed',
      message: 'Your teacher has closed the attendance window.',
      type: 'attendance',
      category: 'attendance',
      actionUrl: '/dashboard/student/attendance',
      entityType: 'teacher_batch',
      entityId: Number(batchId),
      eventKey: `attendance-close:${batchId}:${new Date().toISOString().slice(0, 10)}`,
    }).catch((err) => console.error('Attendance-close notification failed:', err.message));
    res.json({ message: 'Attendance closed (manual override off).', manual_open: r.rows[0].manual_open });
  } catch (err) {
    console.error('closeBatchAttendance error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
};

module.exports = {
  TZ,
  nowInTz,
  validateWindows,
  resolveAttendanceState,
  getBatchAttendanceStatus,
  getBatchConfig,
  updateBatchConfig,
  openBatchAttendance,
  closeBatchAttendance,
};
