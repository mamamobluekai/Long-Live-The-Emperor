// Work Immersion Schedules: duration, date calculation, and batch grouping.
// Schedules are managed by the SUPERVISOR (alongside attendance windows), and
// may also be viewed/edited by the assigned teacher and batch coordinator.
const pool = require('../../db/');
const { assertBatchAccess } = require('../../utils/batchAccess');
const { buildImmersionDateList: buildImmersionDayList, loadExcludedDates } = require('../../utils/immersionDays');

function parseLocalDate(dateStr) {
  if (dateStr instanceof Date) {
    if (isNaN(dateStr.getTime())) return dateStr;
    return new Date(dateStr.getUTCFullYear(), dateStr.getUTCMonth(), dateStr.getUTCDate());
  }
  const [y, m, d] = String(dateStr).split('-').map(Number);
  return new Date(y, m - 1, d);
}

function toLocalDateString(date) {
  if (!date) return '';
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

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

  // Collapse pre-existing duplicate batch-level schedules (supervisor_id IS NULL).
  // PostgreSQL unique constraints ignore NULL, so earlier upserts could create
  // multiple rows per (teacher_batch_id, NULL). Keep the newest and remove the rest.
  await pool.query(`
    DELETE FROM work_immersion_schedules
    WHERE supervisor_id IS NULL
      AND id NOT IN (
        SELECT MAX(id) FROM work_immersion_schedules
        WHERE supervisor_id IS NULL
        GROUP BY teacher_batch_id
      )
  `);
}

// The authoritative "is this a valid immersion day" test, used to gate student
// check-in/out. Builds the real day list so weekends, Philippine holidays and
// supervisor-blocked dates are all excluded. `blocked` is passed in to avoid a
// query per call.
function isDateInSchedule(startDate, durationType, durationValue, targetDate, blocked) {
  if (!startDate || !durationType || !durationValue) return false;
  const target = toLocalDateString(parseLocalDate(targetDate));
  const dates = buildImmersionDayList(startDate, durationType, durationValue, {
    blockedDates: blocked || new Set(),
  });
  return dates.includes(target);
}

async function getBatchScheduleForDate(teacherBatchId, targetDate) {
  const result = await pool.query(
    `SELECT wis.* FROM work_immersion_schedules wis WHERE wis.teacher_batch_id = $1`,
    [teacherBatchId]
  );
  const { blocked } = await loadExcludedDates(teacherBatchId, null);
  for (const row of result.rows) {
    if (isDateInSchedule(row.start_date, row.duration_type, row.duration_value, targetDate, blocked)) {
      return row;
    }
  }
  return null;
}

async function assertTeacherOwnsBatch(user, batchId) {
  const gate = await assertBatchAccess(user, batchId);
  if (!gate.ok) return { error: gate.denied.error, status: gate.denied.status };
  return { teacherId: gate.access.teacherId, access: gate.access };
}

// GET /api/attendance/teacher/batch/:batchId/schedules
const getBatchSchedules = async (req, res) => {
  try {
    await ensureImmersionScheduleTable();
    const { batchId } = req.params;
    const own = await assertTeacherOwnsBatch(req.user, batchId);
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

    // Attach the authoritative immersion dates to each group's schedule. The
    // client used to recompute these in the browser as "the next 10 weekdays",
    // which ignored Philippine holidays and supervisor-blocked dates and so
    // showed days that were never going to count.
    const scheduleById = new Map();
    for (const row of schedulesResult.rows) {
      const { blocked } = await loadExcludedDates(batchId, row.supervisor_id);
      scheduleById.set(String(row.supervisor_id), {
        ...row,
        attendance_dates: buildImmersionDayList(row.start_date, row.duration_type, row.duration_value, {
          blockedDates: blocked,
        }),
      });
    }

    const groups = Array.from(supervisorsMap.entries()).map(([supervisor_id, data]) => {
      const schedule = scheduleById.get(String(data.supervisor_id)) || null;
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
    const own = await assertTeacherOwnsBatch(req.user, batchId);
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
      effectiveStart = row.rows[0]?.start_date || toLocalDateString(new Date());
    }

    let weekdays = durVal;
    if (duration_type === 'hours') {
      weekdays = Math.ceil(durVal / 8);
    }

    // end_date must come from the real day list. Counting weekends only would
    // push it earlier than the last immersion day whenever a holiday or a
    // blocked date falls inside the range.
    const { blocked: blockedForEnd } = await loadExcludedDates(batchId, supId);
    const endList = buildImmersionDayList(effectiveStart, 'days', Math.max(1, weekdays), {
      blockedDates: blockedForEnd,
    });
    const end_date = endList[endList.length - 1] || toLocalDateString(parseLocalDate(effectiveStart));

    // Keep the existing schedule's dates so documentation tied to dates that no
    // longer belong to the schedule can be reset when the teacher edits dates.
    const previous = await client.query(
      `SELECT start_date, duration_type, duration_value
       FROM work_immersion_schedules
       WHERE teacher_batch_id = $1 AND supervisor_id IS NOT DISTINCT FROM $2
       LIMIT 1`,
      [batchId, supId]
    );
    // Same day generation as every other view, so blocked dates and Philippine
    // holidays are excluded here too. Getting this wrong would let a student
    // check in on a blocked day and then report it as a completed immersion day.
    const { blocked } = await loadExcludedDates(batchId, supId);
    const expandDates = (row) => {
      if (!row) return new Set();
      return new Set(
        buildImmersionDayList(row.start_date, row.duration_type, row.duration_value, { blockedDates: blocked })
      );
    };
    const previousDates = expandDates(previous.rows[0]);
    const nextDates = expandDates({
      start_date: effectiveStart,
      duration_type,
      duration_value: durVal,
    });
    const removedDates = [...previousDates].filter((d) => !nextDates.has(d));

    // PostgreSQL unique constraints treat NULL as distinct, so ON CONFLICT
    // (teacher_batch_id, supervisor_id) does NOT match an existing row when
    // supervisor_id is NULL (the batch-level schedule). Use an explicit
    // upsert that finds the existing batch-level row by NULL supervisor so
    // updates replace it instead of creating duplicate rows.
    let result;
    if (supId) {
      result = await client.query(
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
    } else {
      result = await client.query(
        `UPDATE work_immersion_schedules
          SET duration_type = $1, duration_value = $2, start_date = $3, end_date = $4,
              supervisor_id = NULL, created_by = $5, updated_at = CURRENT_TIMESTAMP
         WHERE teacher_batch_id = $6 AND supervisor_id IS NULL
         RETURNING *`,
        [duration_type, durVal, effectiveStart, end_date, req.user.id, batchId]
      );
      if (!result.rowCount) {
        result = await client.query(
          `INSERT INTO work_immersion_schedules (teacher_batch_id, supervisor_id, duration_type, duration_value, start_date, end_date, created_by, updated_at)
           VALUES ($1, NULL, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP)
           RETURNING *`,
          [batchId, duration_type, durVal, effectiveStart, end_date, req.user.id]
        );
      }
    }

    if (removedDates.length > 0) {
      // Documentation is bound to a specific immersion date, so a schedule edit
      // that drops a date must clear the uploaded documentation for that date.
      await client.query(
        `DELETE FROM student_daily_documentation
         WHERE teacher_batch_id = $1 AND date = ANY($2::date[])`,
        [batchId, removedDates]
      );
    }

    res.json({ schedule: result.rows[0], resetDates: removedDates });
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

    const schedules = [];
    for (const row of result.rows) {
      const { blocked } = await loadExcludedDates(row.teacher_batch_id, row.supervisor_id ?? null);
      const dates = buildImmersionDayList(row.start_date, row.duration_type, row.duration_value, {
        blockedDates: blocked,
      });
      schedules.push({ ...row, attendance_dates: dates.join(',') });
    }

    res.json({ schedules });
  } catch (err) {
    console.error('getMySchedule error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
};

module.exports = {
  isDateInSchedule,
  getBatchScheduleForDate,
  getBatchSchedules,
  upsertBatchSchedule,
  getMySchedule,
};
