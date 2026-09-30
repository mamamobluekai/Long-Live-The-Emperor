// Supervisor-facing views for assigned batches, students, and attendance.
const pool = require('../../db');
const { createNotification } = require('../../services/notification.service');

// node-postgres returns DATE columns as JS Dates anchored to UTC midnight.
// Serializing those directly would let the client land on a neighbouring
// calendar day in another timezone, so we always read the UTC components —
// that is the exact day the database stored.
function formatDateOnly(value) {
  if (value == null) return null;
  if (value instanceof Date) {
    return `${value.getUTCFullYear()}-${String(value.getUTCMonth() + 1).padStart(2, '0')}-${String(value.getUTCDate()).padStart(2, '0')}`;
  }
  return String(value).slice(0, 10);
}

function shapeAppeal(appeal) {
  return { ...appeal, appeal_date: formatDateOnly(appeal.appeal_date) };
}

async function ensureSupervisorReportsTable(client = pool) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS supervisor_reports (
      id SERIAL PRIMARY KEY,
      supervisor_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
      batch_id INTEGER,
      batch_source VARCHAR(30) NOT NULL DEFAULT 'deployment',
      teacher_id INTEGER,
      category VARCHAR(80) NOT NULL,
      priority VARCHAR(20) NOT NULL DEFAULT 'normal',
      message TEXT NOT NULL,
      status VARCHAR(30) NOT NULL DEFAULT 'open',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await client.query('CREATE INDEX IF NOT EXISTS idx_supervisor_reports_supervisor ON supervisor_reports(supervisor_id)');
  await client.query('CREATE INDEX IF NOT EXISTS idx_supervisor_reports_student ON supervisor_reports(student_id)');
}

// Immersion-day generation, holiday and blocked-date skipping, and make-up
// days are all owned by the shared helper. See server/utils/immersionDays.js.
const {
  buildImmersionDays: buildImmersionDaysRaw,
  loadExcludedDates,
  appendMakeupDays,
  durationToDays,
  toDateOnly,
} = require('../../utils/immersionDays');

/**
 * The batch's scheduled immersion days, with Philippine holidays and
 * supervisor-blocked dates skipped. Callers that need per-student make-up days
 * should pass the student's attendance through appendMakeupDays afterwards.
 */
async function buildImmersionDays(startDate, durationValue = 10, opts = {}) {
  const { blocked } = await loadExcludedDates(opts.teacherBatchId ?? null, opts.supervisorId ?? null);
  return buildImmersionDaysRaw(startDate, 'days', durationValue, { blockedDates: blocked });
}

async function getSupervisorBatches(supervisorUserId) {
  const deployment = await pool.query(
    `SELECT dr.id AS request_id, dr.batch_label, dr.strand,
            c.first_name AS coordinator_first_name, c.last_name AS coordinator_last_name,
            c.employee_id AS coordinator_employee_id, c.department AS coordinator_department,
            c.designation AS coordinator_designation, c.school AS coordinator_school,
            cu.email AS coordinator_email, cu.phone AS coordinator_phone,
            NULL::text AS teacher_first_name, NULL::text AS teacher_last_name,
            NULL::text AS teacher_employee_id, NULL::text AS teacher_department,
            NULL::text AS teacher_designation, NULL::text AS teacher_school,
            NULL::text AS teacher_email, NULL::text AS teacher_phone,
            'deployment' AS source
     FROM deployment_requests dr
     JOIN coordinators c ON c.user_id = dr.coordinator_id
     LEFT JOIN users cu ON cu.id = c.user_id
     WHERE dr.supervisor_id = $1 AND dr.direction = 'coordinator_to_supervisor' AND dr.status = 'approved'
     ORDER BY dr.created_at DESC`, [supervisorUserId]
  );
  const teacher = await pool.query(
    `SELECT tb.id AS request_id, tb.batch_label, NULL AS strand,
            c.first_name AS coordinator_first_name, c.last_name AS coordinator_last_name,
            c.employee_id AS coordinator_employee_id, c.department AS coordinator_department,
            c.designation AS coordinator_designation, c.school AS coordinator_school,
            cu.email AS coordinator_email, cu.phone AS coordinator_phone,
            t.first_name AS teacher_first_name, t.last_name AS teacher_last_name,
            t.employee_id AS teacher_employee_id, t.department AS teacher_department,
            t.designation AS teacher_designation, t.school AS teacher_school,
            tu.email AS teacher_email, tu.phone AS teacher_phone,
            'teacher' AS source
     FROM teacher_batches tb
     JOIN coordinators c ON c.id = tb.coordinator_id
     LEFT JOIN users cu ON cu.id = c.user_id
     LEFT JOIN teachers t ON t.id = tb.teacher_id
     LEFT JOIN users tu ON tu.id = t.user_id
     WHERE tb.supervisor_id = $1 ORDER BY tb.created_at DESC`, [supervisorUserId]
  );
  return [...deployment.rows, ...teacher.rows];
}

const studentFields = `s.id AS student_id, s.user_id, s.student_number,
  s.first_name, s.middle_name, s.last_name, s.suffix, s.gender, s.birthdate, s.age,
  s.contact_number, COALESCE(u.phone, s.contact_number) AS phone, u.status AS account_status,
  COALESCE(NULLIF(s.email, ''), u.email) AS email, s.home_address, s.grade_level, s.section,
  s.track_strand, s.track_strand AS strand, s.school, s.preferred_industry, s.preferred_company,
  s.career_goal, s.industry_reason, s.guardian_name, s.guardian_relationship, s.guardian_contact,
  s.guardian_email, s.guardian_address, s.emergency_contact, s.emergency_contact_number,
  s.academic_notes, s.photo_url,
  srs.status AS requirements_status,
  cert.certificate_number, cert.cloudinary_url AS certificate_url`;

async function getDeploymentStudents(requestId, supervisorUserId) {
  const result = await pool.query(
    `SELECT ${studentFields}
     FROM deployment_request_students drs JOIN deployment_requests dr ON dr.id = drs.deployment_request_id
     JOIN users u ON u.id = drs.student_id JOIN students s ON s.user_id = u.id
     JOIN student_requirement_submissions srs ON srs.user_id = u.id
     LEFT JOIN LATERAL (
       SELECT certificate_number, cloudinary_url
       FROM certificates c
       WHERE c.student_id = s.id
       ORDER BY c.created_at DESC
       LIMIT 1
     ) cert ON true
     WHERE drs.deployment_request_id = $1 AND dr.supervisor_id = $2 ORDER BY s.last_name, s.first_name`,
    [requestId, supervisorUserId]
  );
  return result.rows;
}

async function getTeacherBatchStudents(requestId, supervisorUserId) {
  const result = await pool.query(
    `SELECT ${studentFields}
     FROM teacher_batch_students tbs JOIN teacher_batches tb ON tb.id = tbs.teacher_batch_id
     JOIN students s ON s.id = tbs.student_id OR s.user_id = tbs.student_id JOIN users u ON u.id = s.user_id
     JOIN student_requirement_submissions srs ON srs.user_id = u.id
     LEFT JOIN LATERAL (
       SELECT certificate_number, cloudinary_url
       FROM certificates c
       WHERE c.student_id = s.id
       ORDER BY c.created_at DESC
       LIMIT 1
     ) cert ON true
     WHERE tbs.teacher_batch_id = $1 AND tb.supervisor_id = $2 ORDER BY s.last_name, s.first_name`,
    [requestId, supervisorUserId]
  );
  return result.rows;
}

async function getAssignedStudentForReport(supervisorUserId, studentId, batchId, batchSource) {
  if (batchSource === 'teacher') {
    const result = await pool.query(
      `SELECT s.id AS student_id, tb.id AS batch_id, tb.teacher_id, 'teacher' AS batch_source
       FROM teacher_batches tb
       JOIN teacher_batch_students tbs ON tbs.teacher_batch_id = tb.id
       JOIN students s ON s.id = tbs.student_id OR s.user_id = tbs.student_id
       WHERE tb.supervisor_id = $1 AND s.id = $2 AND tb.id = $3
       LIMIT 1`,
      [supervisorUserId, studentId, batchId]
    );
    return result.rows[0] || null;
  }

  const result = await pool.query(
    `SELECT s.id AS student_id, dr.id AS batch_id, NULL::integer AS teacher_id, 'deployment' AS batch_source
     FROM deployment_requests dr
     JOIN deployment_request_students drs ON drs.deployment_request_id = dr.id
     JOIN students s ON s.user_id = drs.student_id
     WHERE dr.supervisor_id = $1 AND s.id = $2 AND dr.id = $3
     LIMIT 1`,
    [supervisorUserId, studentId, batchId]
  );
  return result.rows[0] || null;
}

// Reuses the supervisor's existing schedule resolution so the progress bars
// line up with the same immersion days the attendance report already uses.
async function resolveImmersionDaysForStudent(supervisorUserId, studentProfileId) {
  const userIdRes = await pool.query('SELECT user_id FROM students WHERE id = $1', [studentProfileId]);
  const userId = userIdRes.rows[0]?.user_id;
  if (!userId) return [];

  const tbsRes = await pool.query(
    `SELECT tb.id, tb.batch_label
     FROM teacher_batches tb
     JOIN teacher_batch_students tbs ON tbs.teacher_batch_id = tb.id
     WHERE tb.supervisor_id = $1 AND tbs.student_id = $2
     LIMIT 1`,
    [supervisorUserId, studentProfileId]
  );
  const batch = tbsRes.rows[0];

  let schedule = null;
  if (batch) {
    const schedRes = await pool.query(
      `SELECT start_date, duration_type, duration_value
       FROM work_immersion_schedules
       WHERE teacher_batch_id = $1
       ORDER BY start_date ASC LIMIT 1`,
      [batch.id]
    );
    schedule = schedRes.rows[0];
  }

  if (!schedule) {
    const firstRes = await pool.query(
      `SELECT MIN(sa.date) AS first_date
       FROM student_attendance sa
       JOIN students s ON s.id = sa.student_id
       WHERE s.user_id = $1`,
      [userId]
    );
    schedule = {
      start_date: firstRes.rows[0]?.first_date || new Date().toISOString().slice(0, 10),
      duration_type: 'days',
      duration_value: 10,
    };
  }

  const teacherBatchId = batch?.id || null;

  // The student's OWN day list: the batch schedule, plus one make-up day for
  // every immersion day they did not complete. Holidays and blocked dates are
  // excluded from both halves.
  const scheduled = await buildImmersionDays(
    schedule.start_date,
    durationToDays(schedule.duration_type, schedule.duration_value),
    { teacherBatchId, supervisorId: supervisorUserId }
  );

  let attendanceRows = { rows: [] };
  if (scheduled.length) {
    const dateList = scheduled.map((d) => d.date);
    attendanceRows = await pool.query(
      `SELECT to_char(date, 'YYYY-MM-DD') AS date, check_in_time, check_out_time
         FROM student_attendance
        WHERE student_id = $1 AND date = ANY($2::date[])`,
      [studentProfileId, dateList]
    );
  }
  const attendanceByDate = new Map(attendanceRows.rows.map((r) => [r.date, r]));

  // The Time Out window close decides whether a day counts as completed.
  const cfgRes = teacherBatchId
    ? await pool.query(
        "SELECT to_char(time_out_close, 'HH24:MI') AS time_out_close FROM attendance_config WHERE teacher_batch_id = $1",
        [teacherBatchId]
      )
    : { rows: [] };

  const { blocked } = await loadExcludedDates(teacherBatchId, supervisorUserId);
  return appendMakeupDays({
    scheduledDays: scheduled,
    attendanceByDate,
    timeOutClose: cfgRes.rows[0]?.time_out_close || null,
    blockedDates: blocked,
  }).map((d) => ({ number: d.number, date: d.date, is_makeup: d.is_makeup }));
}

// Per-student progress for the supervisor's "Student Progress" panel.
// Scoped to the calling supervisor, so a supervisor can only ever inspect a
// student assigned to one of THEIR batches (teacher batch or deployment).
const getStudentProgress = async (req, res) => {
  try {
    const supervisorUserId = req.user.id;
    const { studentId } = req.params;
    const studentProfileId = Number(studentId);

    if (!Number.isInteger(studentProfileId)) {
      return res.status(400).json({ error: 'Invalid student id.' });
    }

    const studentRes = await pool.query(
      `SELECT s.id AS student_id, s.user_id, s.student_number, s.first_name, s.middle_name,
              s.last_name, s.grade_level, s.track_strand, s.photo_url, s.section,
              COALESCE(NULLIF(s.email, ''), u.email) AS email,
              srs.status AS requirements_status, srs.progress AS requirements_progress
       FROM students s
       JOIN users u ON u.id = s.user_id
       LEFT JOIN student_requirement_submissions srs ON srs.user_id = u.id
       WHERE s.id = $1`,
      [studentProfileId]
    );
    const student = studentRes.rows[0];
    if (!student) return res.status(404).json({ error: 'Student not found.' });

    // Ownership: teacher-batch membership, or a deployment request for this supervisor.
    const ownerRes = await pool.query(
      `SELECT tb.id AS batch_id, tb.batch_label, 'teacher' AS source
       FROM teacher_batches tb
       JOIN teacher_batch_students tbs ON tbs.teacher_batch_id = tb.id
       WHERE tb.supervisor_id = $1 AND tbs.student_id = $2
       LIMIT 1`,
      [supervisorUserId, studentProfileId]
    );

    let batch = ownerRes.rows[0] || null;
    let teacherBatchId = batch?.batch_id || null;

    if (!batch) {
      const deployRes = await pool.query(
        `SELECT dr.id AS batch_id, dr.batch_label, 'deployment' AS source
         FROM deployment_requests dr
         JOIN deployment_request_students drs ON drs.deployment_request_id = dr.id
         WHERE dr.supervisor_id = $1 AND drs.student_id = $2
         LIMIT 1`,
        [supervisorUserId, student.user_id]
      );
      batch = deployRes.rows[0] || null;
    }

    if (!batch) {
      return res.status(403).json({ error: 'This student is not assigned to you.' });
    }

    // Deployment students are normally ALSO placed into a teacher batch when
    // the coordinator fulfils the request. Daily documentation is keyed by
    // teacher_batch_id, so prefer that when it exists.
    if (batch.source === 'deployment') {
      const tbsRes = await pool.query(
        'SELECT teacher_batch_id FROM teacher_batch_students WHERE student_id = $1 LIMIT 1',
        [studentProfileId]
      );
      teacherBatchId = tbsRes.rows[0]?.teacher_batch_id || null;
    }
    // ---- 1. REQUIREMENTS (each document type + the student's file state) ----
    const reqRes = await pool.query(
      `SELECT dt.id, dt.code, dt.name, dt.section, dt.sort_order,
              sd.id AS document_id, sd.status AS document_status, sd.original_name,
              sd.uploaded_date, sd.verified_date, sd.remarks
       FROM document_types dt
       LEFT JOIN student_documents sd
              ON sd.document_type_id = dt.id AND sd.student_id = $1
       WHERE dt.is_active IS NOT FALSE
       ORDER BY dt.sort_order, dt.id`,
      [studentProfileId]
    );
    const requirements = reqRes.rows.map((row) => ({
      id: row.id,
      code: row.code,
      name: row.name,
      section: row.section,
      uploaded: Boolean(row.document_id),
      // "Completed" = uploaded AND verified by the coordinator.
      completed: row.document_status === 'Verified',
      rejected: row.document_status === 'Rejected',
      status: row.document_id ? row.document_status : 'Not uploaded',
      original_name: row.original_name,
      remarks: row.remarks,
    }));
    const requirementsCompleted = requirements.filter((r) => r.completed).length;

    // ---- 2. ATTENDANCE per immersion day ----
    const immersionDays = await resolveImmersionDaysForStudent(supervisorUserId, studentProfileId);
    const dateList = immersionDays.map((d) => d.date);

    const attRes = dateList.length
      ? await pool.query(
          `SELECT date, status, check_in_time, check_out_time
           FROM student_attendance
           WHERE student_id = $1 AND date = ANY($2::date[])`,
          [studentProfileId, dateList]
        )
      : { rows: [] };
    const attByDate = new Map(attRes.rows.map((r) => [String(r.date).slice(0, 10), r]));

    const attendance = immersionDays.map((day) => {
      const row = attByDate.get(day.date);
      const status = row?.status || 'absent';
      return {
        day_number: day.number,
        date: day.date,
        present: Boolean(row?.check_in_time) || status === 'present',
        status,
        check_in_time: row?.check_in_time || null,
        check_out_time: row?.check_out_time || null,
      };
    });
    const attendancePresent = attendance.filter((a) => a.present).length;

    // ---- 3. DAILY DOCUMENTATION per immersion day ----
    const docRes = teacherBatchId
      ? await pool.query(
          `SELECT date, day_number, status, teacher_score
           FROM student_daily_documentation
           WHERE student_id = $1 AND teacher_batch_id = $2`,
          [studentProfileId, teacherBatchId]
        )
      : { rows: [] };
    const docByDate = new Map(docRes.rows.map((r) => [String(r.date).slice(0, 10), r]));

    const documentation = immersionDays.map((day) => {
      const row = docByDate.get(day.date);
      return {
        day_number: row?.day_number ?? day.number,
        date: day.date,
        submitted: Boolean(row),
        // Graded or reviewed counts as finished documentation work.
        completed: row?.status === 'graded' || row?.status === 'reviewed',
        status: row?.status || 'missing',
        score: row?.teacher_score ?? null,
      };
    });
    const documentationDone = documentation.filter((d) => d.completed).length;

    res.json({
      student: {
        ...student,
        full_name:
          `${student.first_name} ${student.middle_name ? `${student.middle_name} ` : ''}${student.last_name}`.trim(),
      },
      batch: { ...batch, teacher_batch_id: teacherBatchId },
      requirements: {
        items: requirements,
        total: requirements.length,
        completed: requirementsCompleted,
        uploaded: requirements.filter((r) => r.uploaded).length,
        status: student.requirements_status || 'Pending',
        progress: student.requirements_progress ?? 0,
      },
      attendance: {
        days: attendance,
        present: attendancePresent,
        total: attendance.length,
        rate: attendance.length ? Math.round((attendancePresent / attendance.length) * 100) : 0,
      },
      documentation: {
        days: documentation,
        completed: documentationDone,
        total: documentation.length,
        rate: documentation.length ? Math.round((documentationDone / documentation.length) * 100) : 0,
      },
    });
  } catch (err) {
    console.error('getStudentProgress error:', err);
    res.status(500).json({ error: 'Failed to load student progress.' });
  }
};

const getSupervisorBatchStudents = async (req, res) => {
  try {
    const batches = await getSupervisorBatches(req.user.id);
    const enriched = [];
    for (const batch of batches) {
      const students = batch.source === 'teacher'
        ? await getTeacherBatchStudents(batch.request_id, req.user.id)
        : await getDeploymentStudents(batch.request_id, req.user.id);

      const userIds = students.map((s) => s.user_id);
      const docsResult = await pool.query(
        `SELECT student_id, COUNT(*)::int AS total, COUNT(*) FILTER (WHERE status = 'Verified')::int AS verified
         FROM student_documents sd JOIN students s ON s.id = sd.student_id
         WHERE s.user_id = ANY($1::int[])
         GROUP BY student_id`,
        [userIds]
      );
      const docsByStudent = new Map(docsResult.rows.map((row) => [row.student_id, { total: Number(row.total), verified: Number(row.verified) }]));

      const attResult = await pool.query(
        `SELECT student_id, COUNT(DISTINCT date)::int AS days
         FROM student_attendance sa JOIN students s ON s.id = sa.student_id
         WHERE s.user_id = ANY($1::int[])
           AND sa.check_in_time IS NOT NULL AND sa.check_out_time IS NOT NULL
         GROUP BY student_id`,
        [userIds]
      );
      const attByStudent = new Map(attResult.rows.map((row) => [row.student_id, Number(row.days)]));

      // Summary rates for the list graph: requirements, attendance, documentation.
      // The same immersion days the detail modal uses, so the two always agree.
      const dtRes = await pool.query(
        'SELECT COUNT(*)::int AS total FROM document_types WHERE is_active IS NOT FALSE'
      );
      const requirementsTotal = Number(dtRes.rows[0]?.total || 0);

      const docDayRes = await pool.query(
        `SELECT sdd.student_id,
                COUNT(*) FILTER (WHERE sdd.status IN ('graded', 'reviewed'))::int AS done
         FROM student_daily_documentation sdd
         JOIN students s ON s.id = sdd.student_id
         WHERE s.user_id = ANY($1::int[])
         GROUP BY sdd.student_id`,
        [userIds]
      );
      const docDaysByStudent = new Map(docDayRes.rows.map((row) => [row.student_id, Number(row.done)]));

      const summaries = new Map();
      for (const s of students) {
        const days = await resolveImmersionDaysForStudent(req.user.id, s.student_id);
        const totalDays = days.length;
        const present = attByStudent.get(s.student_id) || 0;
        const docsDone = docDaysByStudent.get(s.student_id) || 0;
        const pct = (done) => (totalDays ? Math.round((Math.min(done, totalDays) / totalDays) * 100) : 0);
        summaries.set(s.student_id, {
          requirements_rate: requirementsTotal
            ? Math.round((Math.min(docsByStudent.get(s.student_id)?.verified || 0, requirementsTotal) / requirementsTotal) * 100)
            : 0,
          requirements_total: requirementsTotal,
          attendance_rate: pct(present),
          attendance_total: totalDays,
          documentation_rate: pct(docsDone),
          documentation_total: totalDays,
        });
      }

      const enrichedStudents = students.map((s) => {
        const docs = docsByStudent.get(s.student_id) || { total: 0, verified: 0 };
        const attendanceDays = attByStudent.get(s.student_id) || 0;
        const completed =
          s.requirements_status === 'Approved' && docs.total > 0 && docs.verified === docs.total && attendanceDays >= 10;
        return {
          ...s,
          attendance_days: attendanceDays,
          total_documents: docs.total,
          verified_documents: docs.verified,
          completed,
          ...(summaries.get(s.student_id) || {}),
        };
      });

      enriched.push({ ...batch, students: enrichedStudents });
    }
    res.json({ batches: enriched });
  } catch (err) {
    console.error('getSupervisorBatchStudents error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
};

async function getSchedule(batch, requestId, supervisorUserId, userIds) {
  const result = batch.source === 'teacher'
    ? await pool.query('SELECT teacher_batch_id, supervisor_id, start_date, duration_type, duration_value FROM work_immersion_schedules WHERE teacher_batch_id = $1 ORDER BY start_date ASC LIMIT 1', [requestId])
    : await pool.query(`SELECT wis.teacher_batch_id, wis.supervisor_id, wis.start_date, wis.duration_type, wis.duration_value FROM work_immersion_schedules wis
        JOIN teacher_batches tb ON tb.id = wis.teacher_batch_id JOIN teacher_batch_students tbs ON tbs.teacher_batch_id = tb.id
        JOIN students s ON s.id = tbs.student_id OR s.user_id = tbs.student_id
        WHERE tb.supervisor_id = $1 AND s.user_id = ANY($2::int[]) ORDER BY wis.start_date ASC LIMIT 1`, [supervisorUserId, userIds]);
  let schedule = result.rows[0];
  if (!schedule) {
    const first = await pool.query(`SELECT MIN(sa.date) AS first_date FROM student_attendance sa JOIN students s ON s.id = sa.student_id WHERE s.user_id = ANY($1::int[])`, [userIds]);
    schedule = {
      // With no schedule row, fall back to the batch itself for teacher
      // batches so its blocked dates are still honoured.
      teacher_batch_id: batch.source === 'teacher' ? requestId : null,
      supervisor_id: supervisorUserId,
      start_date: first.rows[0]?.first_date || new Date().toISOString().slice(0, 10),
      duration_type: 'days',
      duration_value: 10,
    };
  }
  const duration = schedule.duration_type === 'hours' ? Math.ceil(Number(schedule.duration_value) / 8) : Number(schedule.duration_value);
  // teacherBatchId/supervisorId MUST be passed: without them the day builder
  // only skips holidays, and the batch's blocked dates would still show here.
  return buildImmersionDays(schedule.start_date, duration, {
    teacherBatchId: schedule.teacher_batch_id,
    supervisorId: schedule.supervisor_id,
  });
}

const getBatchAttendance = async (req, res) => {
  try {
    const supervisorUserId = req.user.id;
    const { requestId } = req.params;
    const batchResult = await pool.query(`SELECT dr.id, dr.batch_label, 'deployment' AS source FROM deployment_requests dr WHERE dr.id = $1 AND dr.supervisor_id = $2
      UNION ALL SELECT tb.id, tb.batch_label, 'teacher' AS source FROM teacher_batches tb WHERE tb.id = $1 AND tb.supervisor_id = $2 LIMIT 1`, [requestId, supervisorUserId]);
    if (!batchResult.rows.length) return res.status(404).json({ error: 'Batch not found.' });
    const batch = batchResult.rows[0];
    const usersResult = batch.source === 'teacher'
      ? await pool.query('SELECT DISTINCT s.user_id FROM teacher_batch_students tbs JOIN students s ON s.id = tbs.student_id OR s.user_id = tbs.student_id WHERE tbs.teacher_batch_id = $1', [requestId])
      : await pool.query('SELECT drs.student_id AS user_id FROM deployment_request_students drs JOIN deployment_requests dr ON dr.id = drs.deployment_request_id WHERE drs.deployment_request_id = $1 AND dr.supervisor_id = $2', [requestId, supervisorUserId]);
    const userIds = usersResult.rows.map((row) => row.user_id);
    if (!userIds.length) return res.json({ batch_label: batch.batch_label, students: [], days: [], dates: [], summary: { total_students: 0, days: 0 } });

    const immersionDays = await getSchedule(batch, requestId, supervisorUserId, userIds);
    const dates = immersionDays.map((day) => day.date);
    const { from, to } = req.query;
    const filters = [];
    const params = [userIds, dates];
    if (from) { params.push(from); filters.push(`AND sa.date >= $${params.length}`); }
    if (to) { params.push(to); filters.push(`AND sa.date <= $${params.length}`); }
    const recordsResult = await pool.query(`SELECT sa.id, sa.student_id, sa.date, sa.status, sa.check_in_time, sa.check_out_time, sa.appeal_time_in_id, sa.appeal_time_out_id
      FROM student_attendance sa JOIN students s ON s.id = sa.student_id
      WHERE s.user_id = ANY($1::int[]) AND sa.date = ANY($2::date[]) ${filters.join(' ')} ORDER BY sa.date ASC`, params);
    const records = new Map(recordsResult.rows.map((row) => [`${row.student_id}:${String(row.date).slice(0, 10)}`, row]));

    // Pull the appeal reasons so the supervisor can read why a student was
    // marked late / missing without opening another page.
    const appealIds = [
      ...new Set(
        recordsResult.rows
          .flatMap((row) => [row.appeal_time_in_id, row.appeal_time_out_id])
          .filter(Boolean)
      ),
    ];
    const appealsById = new Map();
    if (appealIds.length) {
      const appealRes = await pool.query(
        `SELECT id, student_id, attendance_type, appeal_date, excuse, file_url, file_name,
                status, teacher_comment, created_at, reviewed_at
         FROM attendance_appeals WHERE id = ANY($1::int[])`,
        [appealIds]
      );
      for (const appeal of appealRes.rows) appealsById.set(appeal.id, shapeAppeal(appeal));
    }

    // The `appeal_time_in_id` / `appeal_time_out_id` columns on student_attendance
    // are only written when a teacher APPROVES the appeal (see reviewAppeal), and
    // only then. Relying on them alone means a PENDING appeal — the one the
    // supervisor most needs to see — renders no button at all, and a REJECTED
    // appeal is never shown either. So also look appeals up directly by
    // student + date + attendance_type. Attendance appeals only exist for
    // teacher batches (attendance_appeals.teacher_batch_id references
    // teacher_batches), so deployment batches are skipped.
    const directAppeals = new Map();
    if (batch.source === 'teacher' && dates.length > 0) {
      const directRes = await pool.query(
        `SELECT a.id, a.student_id, a.attendance_type, a.appeal_date, a.excuse,
                a.file_url, a.file_name, a.status, a.teacher_comment,
                a.created_at, a.reviewed_at
         FROM attendance_appeals a
         JOIN students s ON s.id = a.student_id
         WHERE s.user_id = ANY($1::int[])
           AND a.appeal_date = ANY($2::date[])
         ORDER BY a.created_at DESC`,
        [userIds, dates]
      );
      for (const appeal of directRes.rows) {
        const key = `${appeal.student_id}:${formatDateOnly(appeal.appeal_date)}:${appeal.attendance_type}`;
        // Newest first, so keep the first hit for a given day/type.
        if (!directAppeals.has(key)) directAppeals.set(key, shapeAppeal(appeal));
      }
    }

    // Prefer the appeal the attendance row explicitly links to; otherwise fall
    // back to the direct lookup so unreviewed appeals still surface.
    const appealFor = (studentId, dateKey, type, linkedId) => {
      const linked = linkedId ? appealsById.get(linkedId) : null;
      if (linked) return linked;
      return directAppeals.get(`${studentId}:${dateKey}:${type}`) || null;
    };

    const studentsResult = await pool.query(`SELECT s.id AS student_id, s.first_name, s.last_name, s.student_number, s.grade_level, s.track_strand, s.photo_url, u.email
      FROM students s JOIN users u ON u.id = s.user_id WHERE s.user_id = ANY($1::int[]) ORDER BY s.last_name, s.first_name`, [userIds]);
    const students = studentsResult.rows.map((student) => ({
      ...student,
      days: Object.fromEntries(immersionDays.map((day) => {
        const row = records.get(`${student.student_id}:${day.date}`);
        const dateKey = String(row ? row.date : day.date).slice(0, 10);
        // No record at all means attendance was never taken for that day, so it
        // must NOT be reported as absent — but the student may still have filed
        // an appeal for it, which is exactly the case that needs surfacing.
        return [String(day.number), row ? { record_id: row.id, date: day.date, status: row.status, recorded: true, check_in_time: row.check_in_time, check_out_time: row.check_out_time, appeal_time_in_id: row.appeal_time_in_id, appeal_time_out_id: row.appeal_time_out_id, appeal_time_in: appealFor(row.student_id, dateKey, 'time_in', row.appeal_time_in_id), appeal_time_out: appealFor(row.student_id, dateKey, 'time_out', row.appeal_time_out_id) } : { date: day.date, status: null, recorded: false, check_in_time: null, check_out_time: null, appeal_time_in_id: null, appeal_time_out_id: null, appeal_time_in: appealFor(student.student_id, dateKey, 'time_in', null), appeal_time_out: appealFor(student.student_id, dateKey, 'time_out', null) }];
      })),
    }));
    res.json({ batch_label: batch.batch_label, students, days: immersionDays.map((day) => day.number), dates, summary: { total_students: students.length, days: immersionDays.length } });
  } catch (err) {
    console.error('getBatchAttendance error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
};

const createReportConcern = async (req, res) => {
  try {
    await ensureSupervisorReportsTable();

    const supervisorUserId = req.user.id;
    const studentId = Number(req.body.student_id);
    const batchId = Number(req.body.batch_id);
    const batchSource = req.body.batch_source === 'teacher' ? 'teacher' : 'deployment';
    const category = String(req.body.category || '').trim();
    const priority = String(req.body.priority || 'normal').trim().toLowerCase();
    const message = String(req.body.message || '').trim();

    if (!studentId || !batchId || !category || !message) {
      return res.status(400).json({ error: 'Student, batch, category, and message are required.' });
    }

    const assignment = await getAssignedStudentForReport(supervisorUserId, studentId, batchId, batchSource);

    if (!assignment) {
      return res.status(404).json({ error: 'Assigned student not found for this supervisor.' });
    }

    const result = await pool.query(
      `INSERT INTO supervisor_reports
        (supervisor_id, student_id, batch_id, batch_source, teacher_id, category, priority, message)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [
        supervisorUserId,
        assignment.student_id,
        assignment.batch_id,
        assignment.batch_source,
        assignment.teacher_id,
        category,
        ['low', 'normal', 'high', 'urgent'].includes(priority) ? priority : 'normal',
        message,
      ]
    );

    res.status(201).json({ message: 'Report submitted.', report: result.rows[0] });

    const report = result.rows[0];

    // Notify the teacher (if assigned) that a supervisor report/concern was created.
    if (report.teacher_id) {
      const teacherUserRow = await pool.query(
        `SELECT user_id FROM teachers WHERE id = $1`,
        [report.teacher_id]
      );
      const teacherUserId = teacherUserRow.rows[0]?.user_id;
      if (teacherUserId) {
        const priorityText = report.priority || 'normal';
        void createNotification({
          userId: teacherUserId,
          title: 'New report or concern from supervisor',
          message: `A ${priorityText} priority ${report.category} report was submitted for a student in your batch.`,
          type: 'report',
          category: 'reports',
          priority: priorityText,
          actionUrl: '/dashboard/teacher/reports-concerns',
          relatedUserId: supervisorUserId,
          entityType: 'supervisor_report',
          entityId: report.id,
          eventKey: `supervisor-report:${report.id}:created`,
        }).catch((err) => console.error('Teacher report-concern notification failed:', err.message));
      }
    }
  } catch (err) {
    console.error('createReportConcern error:', err);
    res.status(500).json({ error: 'Failed to submit report.' });
  }
};

const getReportsConcerns = async (req, res) => {
  try {
    await ensureSupervisorReportsTable();

    const result = await pool.query(
      `SELECT r.*, s.first_name, s.last_name, s.student_number, s.grade_level, s.track_strand,
              COALESCE(tb.batch_label, dr.batch_label, 'Deployment Batch') AS batch_label
       FROM supervisor_reports r
       JOIN students s ON s.id = r.student_id
       LEFT JOIN teacher_batches tb ON r.batch_source = 'teacher' AND tb.id = r.batch_id
       LEFT JOIN deployment_requests dr ON r.batch_source = 'deployment' AND dr.id = r.batch_id
       WHERE r.supervisor_id = $1
       ORDER BY r.created_at DESC`,
      [req.user.id]
    );

    res.json({ reports: result.rows });
  } catch (err) {
    console.error('getReportsConcerns error:', err);
    res.status(500).json({ error: 'Failed to load reports.' });
  }
};

// The supervisor owns the reports they filed, so they can withdraw one.
// Scoped by supervisor_id so nobody can delete someone else's report.
const deleteReportConcern = async (req, res) => {
  try {
    await ensureSupervisorReportsTable();

    const reportId = Number(req.params.id);
    if (!Number.isInteger(reportId)) {
      return res.status(400).json({ error: 'Invalid report id.' });
    }

    const result = await pool.query(
      'DELETE FROM supervisor_reports WHERE id = $1 AND supervisor_id = $2 RETURNING id',
      [reportId, req.user.id]
    );

    if (!result.rows.length) {
      return res.status(404).json({ error: 'Report not found.' });
    }

    res.json({ success: true });
  } catch (err) {
    console.error('deleteReportConcern error:', err);
    res.status(500).json({ error: 'Failed to delete report.' });
  }
};

const getTeacherReportsConcerns = async (req, res) => {
  try {
    await ensureSupervisorReportsTable();

    const teacherUserId = req.user.id;

    const teacherRow = await pool.query(
      "SELECT id FROM teachers WHERE user_id = $1",
      [teacherUserId]
    );
    if (!teacherRow.rows.length) {
      return res.status(400).json({ error: 'Teacher profile not found.' });
    }
    const teacherId = teacherRow.rows[0].id;

    const result = await pool.query(
      `SELECT r.*, s.first_name, s.last_name, s.student_number, s.grade_level, s.track_strand,
              COALESCE(tb.batch_label, dr.batch_label, 'Deployment Batch') AS batch_label,
              tb.id AS teacher_batch_id,
              sup.first_name AS supervisor_first_name, sup.last_name AS supervisor_last_name,
              sup.employee_id AS supervisor_employee_id, sup.company_name AS supervisor_company
       FROM supervisor_reports r
       JOIN students s ON s.id = r.student_id
       LEFT JOIN teacher_batches tb ON r.batch_source = 'teacher' AND tb.id = r.batch_id
       LEFT JOIN deployment_requests dr ON r.batch_source = 'deployment' AND dr.id = r.batch_id
       LEFT JOIN supervisors sup ON sup.user_id = r.supervisor_id
       WHERE r.teacher_id = $1
       ORDER BY r.created_at DESC`,
      [teacherId]
    );

    res.json({ reports: result.rows });
  } catch (err) {
    console.error('getTeacherReportsConcerns error:', err);
    res.status(500).json({ error: 'Failed to load reports.' });
  }
};

const confirmReportConcern = async (req, res) => {
  try {
    await ensureSupervisorReportsTable();

    const teacherUserId = req.user.id;
    const teacherRow = await pool.query(
      "SELECT id FROM teachers WHERE user_id = $1",
      [teacherUserId]
    );
    if (!teacherRow.rows.length) {
      return res.status(400).json({ error: 'Teacher profile not found.' });
    }
    const teacherId = teacherRow.rows[0].id;

    const reportId = Number(req.params.reportId);
    if (!reportId) {
      return res.status(400).json({ error: 'Report ID is required.' });
    }

    const ownership = await pool.query(
      `SELECT id, supervisor_id, teacher_id, category, priority, status
       FROM supervisor_reports
       WHERE id = $1 AND teacher_id = $2`,
      [reportId, teacherId]
    );
    if (!ownership.rows.length) {
      return res.status(404).json({ error: 'Report or concern not found.' });
    }

    const report = ownership.rows[0];
    if (report.status === 'resolved') {
      return res.json({ message: 'Report already confirmed.', report });
    }

    const result = await pool.query(
      `UPDATE supervisor_reports
       SET status = 'resolved', updated_at = CURRENT_TIMESTAMP
       WHERE id = $1
       RETURNING *`,
      [reportId]
    );

    res.json({ message: 'Report confirmed.', report: result.rows[0] });

    // Notify the supervisor that the teacher confirmed the report/concern.
    if (report.supervisor_id) {
      void createNotification({
        userId: report.supervisor_id,
        title: 'Report confirmed by teacher',
        message: `A ${report.priority || 'normal'} priority ${report.category} report was confirmed by the teacher.`,
        type: 'report',
        category: 'reports',
        priority: report.priority || 'normal',
        actionUrl: '/dashboard/supervisor/reports-concerns',
        relatedUserId: teacherUserId,
        entityType: 'supervisor_report',
        entityId: reportId,
        eventKey: `supervisor-report:${reportId}:confirmed`,
      }).catch((err) => console.error('Supervisor confirm notification failed:', err.message));
    }
  } catch (err) {
    console.error('confirmReportConcern error:', err);
    res.status(500).json({ error: 'Failed to confirm report.' });
  }
};

module.exports = {
  getSupervisorBatchStudents,
  getStudentProgress,
  getBatchAttendance,
  createReportConcern,
  getReportsConcerns,
  deleteReportConcern,
  getTeacherReportsConcerns,
  confirmReportConcern,
};
