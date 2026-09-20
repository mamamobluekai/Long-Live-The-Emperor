const pool = require('../../db');

function scheduleDates(startDate, durationType, durationValue) {
  const [year, month, day] = String(startDate).slice(0, 10).split('-').map(Number);
  const current = new Date(year, month - 1, day);
  const totalDays = durationType === 'hours' ? Math.ceil(Number(durationValue) / 8) : Number(durationValue);
  const dates = [];

  while (dates.length < totalDays) {
    if (current.getDay() !== 0 && current.getDay() !== 6) {
      dates.push(`${current.getFullYear()}-${String(current.getMonth() + 1).padStart(2, '0')}-${String(current.getDate()).padStart(2, '0')}`);
    }
    current.setDate(current.getDate() + 1);
  }
  return dates;
}

const getSupervisorDashboard = async (req, res) => {
  try {
    const supervisorId = req.user.id;

    const batchesResult = await pool.query(
      `WITH supervisor_batches AS (
        SELECT dr.id AS request_id, dr.batch_label, dr.strand,
               c.first_name AS coordinator_first_name,
               c.last_name AS coordinator_last_name,
               'deployment' AS source
        FROM deployment_requests dr
        JOIN coordinators c ON c.user_id = dr.coordinator_id
        WHERE dr.supervisor_id = $1
          AND dr.direction = 'coordinator_to_supervisor'
          AND dr.status = 'approved'
        UNION ALL
        SELECT tb.id AS request_id, tb.batch_label, NULL AS strand,
               c.first_name AS coordinator_first_name,
               c.last_name AS coordinator_last_name,
               'teacher' AS source
        FROM teacher_batches tb
        JOIN coordinators c ON c.id = tb.coordinator_id
        WHERE tb.supervisor_id = $1
      ), assigned AS (
        SELECT sb.request_id, sb.source, s.id AS student_id
        FROM supervisor_batches sb
        JOIN deployment_request_students drs
          ON sb.source = 'deployment' AND drs.deployment_request_id = sb.request_id
        JOIN students s ON s.user_id = drs.student_id
        UNION ALL
        SELECT sb.request_id, sb.source, s.id AS student_id
        FROM supervisor_batches sb
        JOIN teacher_batch_students tbs
          ON sb.source = 'teacher' AND tbs.teacher_batch_id = sb.request_id
        JOIN students s ON s.id = tbs.student_id OR s.user_id = tbs.student_id
      )
      SELECT sb.*,
             COUNT(DISTINCT a.student_id)::int AS student_count
      FROM supervisor_batches sb
      LEFT JOIN assigned a ON a.request_id = sb.request_id AND a.source = sb.source
      GROUP BY sb.request_id, sb.batch_label, sb.strand,
               sb.coordinator_first_name, sb.coordinator_last_name, sb.source
      ORDER BY sb.request_id DESC`,
      [supervisorId]
    );

    const [scheduleResult, assignedResult] = await Promise.all([
      pool.query(
        `SELECT tb.id AS request_id, 'teacher' AS source,
                wis.start_date, wis.duration_type, wis.duration_value
         FROM teacher_batches tb
         JOIN work_immersion_schedules wis ON wis.teacher_batch_id = tb.id
         WHERE tb.supervisor_id = $1
         ORDER BY wis.start_date ASC`,
        [supervisorId]
      ),
      pool.query(
        `WITH assigned AS (
          SELECT dr.id AS request_id, 'deployment' AS source, s.id AS student_id
          FROM deployment_requests dr
          JOIN deployment_request_students drs ON drs.deployment_request_id = dr.id
          JOIN students s ON s.user_id = drs.student_id
          WHERE dr.supervisor_id = $1 AND dr.direction = 'coordinator_to_supervisor' AND dr.status = 'approved'
          UNION
          SELECT tb.id AS request_id, 'teacher' AS source, s.id AS student_id
          FROM teacher_batches tb
          JOIN teacher_batch_students tbs ON tbs.teacher_batch_id = tb.id
          JOIN students s ON s.id = tbs.student_id OR s.user_id = tbs.student_id
          WHERE tb.supervisor_id = $1
        )
        SELECT * FROM assigned ORDER BY source, request_id, student_id`,
        [supervisorId]
      ),
    ]);

    const scheduleByBatch = new Map();
    for (const schedule of scheduleResult.rows) {
      const dates = scheduleDates(schedule.start_date, schedule.duration_type, schedule.duration_value);
      scheduleByBatch.set(`${schedule.source}:${schedule.request_id}`, dates);
    }

    const scheduledDates = [...new Set(scheduleResult.rows.flatMap((schedule) =>
      scheduleDates(schedule.start_date, schedule.duration_type, schedule.duration_value)
    ))].sort();
    const assignedRows = assignedResult.rows;
    let attendanceRows = [];

    if (assignedRows.length && scheduledDates.length) {
      const studentIds = [...new Set(assignedRows.map((row) => row.student_id))];
      const attendanceResult = await pool.query(
        `SELECT student_id, date, status, check_in_time, check_out_time,
                appeal_time_in_id, appeal_time_out_id
         FROM student_attendance
         WHERE student_id = ANY($1::int[])
           AND date = ANY($2::date[])`,
        [studentIds, scheduledDates]
      );
      const attendanceByStudentDate = new Map(attendanceResult.rows.map((row) => [
        `${row.student_id}:${row.date}`,
        row,
      ]));

      attendanceRows = assignedRows.flatMap((assigned) => {
        const dates = scheduleByBatch.get(`${assigned.source}:${assigned.request_id}`) || scheduledDates;
        return dates.map((date) => ({
          request_id: assigned.request_id,
          source: assigned.source,
          student_id: assigned.student_id,
          date,
          ...(attendanceByStudentDate.get(`${assigned.student_id}:${date}`) || { status: 'absent' }),
        }));
      });
    }

    const assignedStudentIds = `(
      SELECT DISTINCT s.id
      FROM deployment_requests dr
      JOIN deployment_request_students drs ON drs.deployment_request_id = dr.id
      JOIN students s ON s.user_id = drs.student_id
      WHERE dr.supervisor_id = $1
        AND dr.direction = 'coordinator_to_supervisor'
        AND dr.status = 'approved'
      UNION
      SELECT DISTINCT s.id
      FROM teacher_batches tb
      JOIN teacher_batch_students tbs ON tbs.teacher_batch_id = tb.id
      JOIN students s ON s.id = tbs.student_id OR s.user_id = tbs.student_id
      WHERE tb.supervisor_id = $1
    )`;

    const [evaluationResult, certificationResult, requestsResult] = await Promise.all([
      pool.query(
        `SELECT COUNT(*)::int AS evaluated,
                COALESCE(AVG(se.overall_percentage), 0)::numeric(5,2) AS average_score
         FROM student_evaluations se
         WHERE se.evaluator_id = $1
           AND se.student_id IN ${assignedStudentIds}`,
        [supervisorId]
      ),
      pool.query(
        `SELECT
           COUNT(*)::int AS total_students,
           COUNT(*) FILTER (WHERE srs.status = 'Approved')::int AS approved_requirements,
           COUNT(*) FILTER (WHERE COALESCE(doc.total, 0) > 0 AND doc.total = doc.verified)::int AS verified_documents,
           COUNT(*) FILTER (WHERE COALESCE(att.days, 0) >= 10)::int AS complete_attendance,
           COUNT(*) FILTER (
             WHERE srs.status = 'Approved'
               AND COALESCE(doc.total, 0) > 0
               AND doc.total = doc.verified
               AND COALESCE(att.days, 0) >= 10
           )::int AS eligible
         FROM students s
         JOIN student_requirement_submissions srs ON srs.student_id = s.id
         LEFT JOIN LATERAL (
           SELECT COUNT(*)::int AS total,
                  COUNT(*) FILTER (WHERE status = 'Verified')::int AS verified
           FROM student_documents sd WHERE sd.student_id = s.id
         ) doc ON true
         LEFT JOIN LATERAL (
           SELECT COUNT(DISTINCT date)::int AS days
           FROM student_attendance sa
           WHERE sa.student_id = s.id
             AND sa.check_in_time IS NOT NULL
             AND sa.check_out_time IS NOT NULL
         ) att ON true
         WHERE s.id IN ${assignedStudentIds}`,
        [supervisorId]
      ),
      pool.query(
        `SELECT status, COUNT(*)::int AS count
         FROM deployment_requests
         WHERE supervisor_id = $1
         GROUP BY status`,
        [supervisorId]
      ),
    ]);

    const evaluated = evaluationResult.rows[0]?.evaluated || 0;
    const totalStudents = batchesResult.rows.reduce((sum, batch) => sum + Number(batch.student_count || 0), 0);
    const requestCounts = Object.fromEntries(requestsResult.rows.map((row) => [String(row.status).toLowerCase(), row.count]));
    const certificateStats = certificationResult.rows[0] || {};

    res.json({
      batches: batchesResult.rows,
      attendanceRecords: attendanceRows,
      attendanceScheduleDates: scheduledDates,
      overview: {
        batches: batchesResult.rows.length,
        students: totalStudents,
      },
      evaluations: {
        totalStudents,
        evaluated,
        pending: Math.max(totalStudents - evaluated, 0),
        averageScore: Number(evaluationResult.rows[0]?.average_score || 0),
      },
      certifications: {
        eligible: certificateStats.eligible || 0,
        approvedRequirements: certificateStats.approved_requirements || 0,
        verifiedDocuments: certificateStats.verified_documents || 0,
        completeAttendance: certificateStats.complete_attendance || 0,
      },
      deploymentRequests: {
        pending: requestCounts.pending || 0,
        approved: requestCounts.approved || 0,
        rejected: requestCounts.rejected || 0,
        fulfilled: requestCounts.fulfilled || 0,
      },
    });
  } catch (err) {
    console.error('getSupervisorDashboard error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
};

module.exports = { getSupervisorDashboard };