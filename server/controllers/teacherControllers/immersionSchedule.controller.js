// Work Immersion Schedules: duration, date calculation, and batch grouping.
const pool = require('../../db/');

async function ensureImmersionScheduleTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS work_immersion_schedules (
      id SERIAL PRIMARY KEY,
      teacher_batch_id INTEGER NOT NULL REFERENCES teacher_batches(id) ON DELETE CASCADE,
      supervisor_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      duration_type VARCHAR(20) NOT NULL DEFAULT 'days' CHECK (duration_type IN ('hours', 'days')),
      duration_value INTEGER NOT NULL DEFAULT 80,
      start_date DATE NOT NULL DEFAULT CURRENT_DATE,
      end_date DATE,
      created_by INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE (teacher_batch_id, supervisor_id)
    );

    CREATE INDEX IF NOT EXISTS idx_work_immersion_schedules_batch ON work_immersion_schedules(teacher_batch_id);
    CREATE INDEX IF NOT EXISTS idx_work_immersion_schedules_supervisor ON work_immersion_schedules(supervisor_id);
  `);

  await pool.query(`ALTER TABLE work_immersion_schedules ADD COLUMN IF NOT EXISTS end_date DATE;`);
}

function addWeekdays(startDate, weekdaysToAdd) {
  const date = new Date(startDate);
  let added = 0;
  while (added < weekdaysToAdd) {
    date.setDate(date.getDate() + 1);
    const day = date.getDay();
    if (day !== 0 && day !== 6) {
      added++;
    }
  }
  return date.toISOString().slice(0, 10);
}

function isWeekday(dateStr) {
  const d = new Date(dateStr);
  const day = d.getDay();
  return day !== 0 && day !== 6;
}

function isDateInSchedule(startDate, durationType, durationValue, targetDate) {
  if (!startDate || !durationType || !durationValue) return false;
  const start = new Date(startDate);
  const target = new Date(targetDate);
  if (target < start) return false;
  if (!isWeekday(targetDate)) return false;
  const totalDays = durationType === 'hours' ? Math.ceil(Number(durationValue) / 8) : Number(durationValue);
  const endDate = addWeekdays(startDate, totalDays);
  return targetDate <= endDate;
}

async function getBatchScheduleForDate(teacherBatchId, targetDate) {
  const result = await pool.query(
    `SELECT wis.* FROM work_immersion_schedules wis WHERE wis.teacher_batch_id = $1`,
    [teacherBatchId]
  );
  for (const row of result.rows) {
    if (isDateInSchedule(row.start_date, row.duration_type, row.duration_value, targetDate)) {
      return row;
    }
  }
  return null;
}

async function assertTeacherOwnsBatch(teacherUserId, batchId) {
  const teacherRow = await pool.query('SELECT id FROM teachers WHERE user_id = $1', [teacherUserId]);
  const teacherId = teacherRow.rows[0]?.id;
  if (!teacherId) return { error: 'Teacher profile not found.', status: 400 };
  const own = await pool.query('SELECT id FROM teacher_batches WHERE id = $1 AND teacher_id = $2', [batchId, teacherId]);
  if (own.rows.length === 0) return { error: 'Access denied.', status: 403 };
  return { teacherId };
}

// GET /api/attendance/teacher/batch/:batchId/schedules
const getBatchSchedules = async (req, res) => {
  try {
    await ensureImmersionScheduleTable();
    const { batchId } = req.params;
    const own = await assertTeacherOwnsBatch(req.user.id, batchId);
    if (own.error) return res.status(own.status).json({ error: own.error });

    const schedulesResult = await pool.query(
      `SELECT wis.*, u.email AS supervisor_email,
              sv.first_name AS supervisor_first_name, sv.last_name AS supervisor_last_name
       FROM work_immersion_schedules wis
       LEFT JOIN users u ON u.id = wis.supervisor_id
       LEFT JOIN supervisors sv ON sv.user_id = wis.supervisor_id
       WHERE wis.teacher_batch_id = $1
       ORDER BY wis.supervisor_id NULLS FIRST, wis.id ASC`,
      [batchId]
    );

    const studentsResult = await pool.query(
      `SELECT s.id AS student_id, s.user_id, s.first_name, s.last_name, s.student_number, s.grade_level, s.track_strand, u.email,
              tb.supervisor_id
       FROM teacher_batch_students tbs
       JOIN students s ON s.id = tbs.student_id
       JOIN users u ON u.id = s.user_id
       JOIN teacher_batches tb ON tb.id = tbs.teacher_batch_id
       WHERE tbs.teacher_batch_id = $1
       ORDER BY s.last_name ASC, s.first_name ASC`,
      [batchId]
    );

    const supervisorsMap = new Map();
    for (const s of studentsResult.rows) {
      const supId = s.supervisor_id || 'batch';
      if (!supervisorsMap.has(supId)) {
        supervisorsMap.set(supId, {
          supervisor_id: s.supervisor_id,
          students: [],
        });
      }
      supervisorsMap.get(supId).students.push(s);
    }

    const groups = Array.from(supervisorsMap.entries()).map(([supervisor_id, data]) => {
      const schedule = schedulesResult.rows.find(s => String(s.supervisor_id) === String(supervisor_id));
      return {
        supervisor_id: supervisor_id === 'batch' ? null : Number(supervisor_id),
        supervisor_name: schedule ? `${schedule.supervisor_first_name || ''} ${schedule.supervisor_last_name || ''}`.trim() || 'Batch' : 'Batch',
        students: data.students,
        schedule: schedule || null,
      };
    });

    res.json({ groups });
  } catch (err) {
    console.error('getBatchSchedules error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
};

// PUT /api/attendance/teacher/batch/:batchId/schedules
const upsertBatchSchedule = async (req, res) => {
  const client = await pool.connect();
  try {
    await ensureImmersionScheduleTable();
    const { batchId } = req.params;
    const own = await assertTeacherOwnsBatch(req.user.id, batchId);
    if (own.error) return res.status(own.status).json({ error: own.error });

    const { supervisor_id, duration_type, duration_value, start_date } = req.body || {};

    if (!['hours', 'days'].includes(duration_type)) {
      return res.status(400).json({ error: 'duration_type must be hours or days.' });
    }

    const supId = supervisor_id ? Number(supervisor_id) : null;
    const durVal = Number(duration_value);
    if (!durVal || durVal <= 0) {
      return res.status(400).json({ error: 'duration_value must be a positive number.' });
    }

    let effectiveStart = start_date;
    if (!effectiveStart) {
      const row = await client.query('SELECT start_date FROM work_immersion_schedules WHERE teacher_batch_id = $1 LIMIT 1', [batchId]);
      effectiveStart = row.rows[0]?.start_date || new Date().toISOString().slice(0, 10);
    }

    let weekdays = durVal;
    if (duration_type === 'hours') {
      weekdays = Math.ceil(durVal / 8);
    }
    const end_date = addWeekdays(effectiveStart, Math.max(1, weekdays));

    const result = await client.query(
      `INSERT INTO work_immersion_schedules (teacher_batch_id, supervisor_id, duration_type, duration_value, start_date, end_date, created_by, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, CURRENT_TIMESTAMP)
       ON CONFLICT (teacher_batch_id, supervisor_id) DO UPDATE SET
         duration_type = EXCLUDED.duration_type,
         duration_value = EXCLUDED.duration_value,
         start_date = EXCLUDED.start_date,
         end_date = EXCLUDED.end_date,
         created_by = EXCLUDED.created_by,
         updated_at = CURRENT_TIMESTAMP
       RETURNING *`,
      [batchId, supId, duration_type, durVal, effectiveStart, end_date, req.user.id]
    );

    res.json({ schedule: result.rows[0] });
  } catch (err) {
    console.error('upsertBatchSchedule error:', err);
    res.status(500).json({ error: 'Server error.' });
  } finally {
    client.release();
  }
};

// GET /api/attendance/student/schedule
const getMySchedule = async (req, res) => {
  try {
    await ensureImmersionScheduleTable();
    const studentUserId = req.user.id;
    const studentRow = await pool.query('SELECT id FROM students WHERE user_id = $1', [studentUserId]);
    if (!studentRow.rows.length) return res.status(404).json({ error: 'Student profile not found.' });
    const studentId = studentRow.rows[0].id;

    const result = await pool.query(
      `SELECT wis.*, tb.batch_label, u.email AS supervisor_email,
              sv.first_name AS supervisor_first_name, sv.last_name AS supervisor_last_name
       FROM work_immersion_schedules wis
       JOIN teacher_batch_students tbs ON tbs.teacher_batch_id = wis.teacher_batch_id
       JOIN teacher_batches tb ON tb.id = wis.teacher_batch_id
       LEFT JOIN users u ON u.id = wis.supervisor_id
       LEFT JOIN supervisors sv ON sv.user_id = wis.supervisor_id
       WHERE tbs.student_id = $1
       ORDER BY wis.start_date DESC, wis.id DESC`,
      [studentId]
    );

    const schedules = result.rows.map((row) => {
      const dates = [];
      const current = new Date(row.start_date);
      const totalDays = row.duration_type === 'hours' ? Math.ceil(Number(row.duration_value) / 8) : Number(row.duration_value);
      let added = 0;
      while (added < totalDays) {
        const day = current.getDay();
        if (day !== 0 && day !== 6) {
          dates.push(new Date(current).toISOString().slice(0, 10));
          added++;
        }
        current.setDate(current.getDate() + 1);
      }
      return {
        ...row,
        attendance_dates: dates.join(','),
      };
    });

    res.json({ schedules });
  } catch (err) {
    console.error('getMySchedule error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
};

module.exports = {
  addWeekdays,
  isDateInSchedule,
  getBatchScheduleForDate,
  getBatchSchedules,
  upsertBatchSchedule,
  getMySchedule,
};
