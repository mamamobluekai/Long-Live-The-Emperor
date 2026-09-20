// Supervisor-facing views for assigned batches, students, and attendance.
const pool = require('../../db');
const { createNotification } = require('../../services/notification.service');

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

function buildImmersionDays(startDate, durationValue = 10) {
  const [year, month, day] = String(startDate).slice(0, 10).split('-').map(Number);
  const current = new Date(year, month - 1, day);
  const days = [];
  while (days.length < Number(durationValue)) {
    if (current.getDay() !== 0 && current.getDay() !== 6) {
      days.push({ number: days.length + 1, date: `${current.getFullYear()}-${String(current.getMonth() + 1).padStart(2, '0')}-${String(current.getDate()).padStart(2, '0')}` });
    }
    current.setDate(current.getDate() + 1);
  }
  return days;
}

async function getSupervisorBatches(supervisorUserId) {
  const deployment = await pool.query(
    `SELECT dr.id AS request_id, dr.batch_label, dr.strand,
            c.first_name AS coordinator_first_name, c.last_name AS coordinator_last_name,
            'deployment' AS source
     FROM deployment_requests dr JOIN coordinators c ON c.user_id = dr.coordinator_id
     WHERE dr.supervisor_id = $1 AND dr.direction = 'coordinator_to_supervisor' AND dr.status = 'approved'
     ORDER BY dr.created_at DESC`, [supervisorUserId]
  );
  const teacher = await pool.query(
    `SELECT tb.id AS request_id, tb.batch_label, NULL AS strand,
            c.first_name AS coordinator_first_name, c.last_name AS coordinator_last_name,
            'teacher' AS source
     FROM teacher_batches tb JOIN coordinators c ON c.id = tb.coordinator_id
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
    ? await pool.query('SELECT start_date, duration_type, duration_value FROM work_immersion_schedules WHERE teacher_batch_id = $1 ORDER BY start_date ASC LIMIT 1', [requestId])
    : await pool.query(`SELECT wis.start_date, wis.duration_type, wis.duration_value FROM work_immersion_schedules wis
        JOIN teacher_batches tb ON tb.id = wis.teacher_batch_id JOIN teacher_batch_students tbs ON tbs.teacher_batch_id = tb.id
        JOIN students s ON s.id = tbs.student_id OR s.user_id = tbs.student_id
        WHERE tb.supervisor_id = $1 AND s.user_id = ANY($2::int[]) ORDER BY wis.start_date ASC LIMIT 1`, [supervisorUserId, userIds]);
  let schedule = result.rows[0];
  if (!schedule) {
    const first = await pool.query(`SELECT MIN(sa.date) AS first_date FROM student_attendance sa JOIN students s ON s.id = sa.student_id WHERE s.user_id = ANY($1::int[])`, [userIds]);
    schedule = { start_date: first.rows[0]?.first_date || new Date().toISOString().slice(0, 10), duration_type: 'days', duration_value: 10 };
  }
  const duration = schedule.duration_type === 'hours' ? Math.ceil(Number(schedule.duration_value) / 8) : Number(schedule.duration_value);
  return buildImmersionDays(schedule.start_date, duration);
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
    const studentsResult = await pool.query(`SELECT s.id AS student_id, s.first_name, s.last_name, s.student_number, s.grade_level, s.track_strand, s.photo_url, u.email
      FROM students s JOIN users u ON u.id = s.user_id WHERE s.user_id = ANY($1::int[]) ORDER BY s.last_name, s.first_name`, [userIds]);
    const students = studentsResult.rows.map((student) => ({
      ...student,
      days: Object.fromEntries(immersionDays.map((day) => {
        const row = records.get(`${student.student_id}:${day.date}`);
        return [String(day.number), row ? { record_id: row.id, date: day.date, status: row.status, check_in_time: row.check_in_time, check_out_time: row.check_out_time, appeal_time_in_id: row.appeal_time_in_id, appeal_time_out_id: row.appeal_time_out_id } : { date: day.date, status: 'absent', check_in_time: null, check_out_time: null }];
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
  getBatchAttendance,
  createReportConcern,
  getReportsConcerns,
  getTeacherReportsConcerns,
  confirmReportConcern,
};
