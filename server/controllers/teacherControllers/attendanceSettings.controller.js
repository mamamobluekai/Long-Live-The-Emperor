// Attendance scheduling + manual override, resolved in Asia/Manila time.
// Time In window  : 08:00 - 08:30
// Time Out window : 17:00 - 17:30
// The teacher can also force-open (override) attendance for a batch at any time.
const pool = require('../../db/');

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

function computeState(cfg) {
  const { now, hour, minute } = nowInTz(cfg.timezone);
  const nowMin = hour * 60 + minute;

  const inOpen = timeToMinutes(String(cfg.time_in_open));
  const inClose = timeToMinutes(String(cfg.time_in_close));
  const outOpen = timeToMinutes(String(cfg.time_out_open));
  const outClose = timeToMinutes(String(cfg.time_out_close));

  const manualOpen = cfg.manual_open;

  let phase;
  let type = null;
  let open = false;

  if (nowMin < inOpen) {
    phase = 'before_in';
  } else if (nowMin < inClose) {
    phase = 'in_open';
    type = 'time_in';
    open = true;
  } else if (nowMin < outOpen) {
    phase = 'in_closed';
  } else if (nowMin < outClose) {
    phase = 'out_open';
    type = 'time_out';
    open = true;
  } else {
    phase = 'out_closed';
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
    const teacherRow = await client.query('SELECT id FROM teachers WHERE user_id = $1', [req.user.id]);
    const teacherId = teacherRow.rows[0]?.id;
    if (!teacherId) return res.status(400).json({ error: 'Teacher profile not found.' });

    const own = await client.query('SELECT id FROM teacher_batches WHERE id = $1 AND teacher_id = $2', [batchId, teacherId]);
    if (own.rows.length === 0) return res.status(403).json({ error: 'Access denied.' });

    const { time_in_open, time_in_close, time_out_open, time_out_close, timezone } = req.body;

    const fields = [];
    const values = [];
    let idx = 1;
    const pushTime = (key, val) => {
      if (val && /^\d{2}:\d{2}$/.test(val)) {
        fields.push(`${key} = $${idx++}`);
        values.push(val);
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
    const teacherId = (await pool.query('SELECT id FROM teachers WHERE user_id = $1', [req.user.id])).rows[0]?.id;
    if (!teacherId) return res.status(400).json({ error: 'Teacher profile not found.' });
    const own = await pool.query('SELECT id FROM teacher_batches WHERE id = $1 AND teacher_id = $2', [batchId, teacherId]);
    if (own.rows.length === 0) return res.status(403).json({ error: 'Access denied.' });

    const r = await pool.query(
      `INSERT INTO attendance_config (teacher_batch_id, manual_open)
       VALUES ($1, TRUE)
       ON CONFLICT (teacher_batch_id) DO UPDATE SET manual_open = TRUE, updated_at = CURRENT_TIMESTAMP
       RETURNING manual_open`,
      [batchId]
    );
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
    const teacherId = (await pool.query('SELECT id FROM teachers WHERE user_id = $1', [req.user.id])).rows[0]?.id;
    if (!teacherId) return res.status(400).json({ error: 'Teacher profile not found.' });
    const own = await pool.query('SELECT id FROM teacher_batches WHERE id = $1 AND teacher_id = $2', [batchId, teacherId]);
    if (own.rows.length === 0) return res.status(403).json({ error: 'Access denied.' });

    const r = await pool.query(
      `INSERT INTO attendance_config (teacher_batch_id, manual_open)
       VALUES ($1, FALSE)
       ON CONFLICT (teacher_batch_id) DO UPDATE SET manual_open = FALSE, updated_at = CURRENT_TIMESTAMP
       RETURNING manual_open`,
      [batchId]
    );
    res.json({ message: 'Attendance closed (manual override off).', manual_open: r.rows[0].manual_open });
  } catch (err) {
    console.error('closeBatchAttendance error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
};

module.exports = {
  TZ,
  nowInTz,
  resolveAttendanceState,
  getBatchAttendanceStatus,
  getBatchConfig,
  updateBatchConfig,
  openBatchAttendance,
  closeBatchAttendance,
};
