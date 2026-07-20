// Supervisor-facing views: students assigned to the supervisor through approved
// coordinator -> supervisor deployment requests (each request is the supervisor's
// "batch"), and those students' attendance grouped by work-immersion day.
const pool = require('../../db');

// Deployment requests assigned to this supervisor (their batches of students).
async function getSupervisorBatches(supervisorUserId) {
  const result = await pool.query(
    `SELECT dr.id AS request_id, dr.batch_label, dr.strand,
            c.first_name AS coordinator_first_name, c.last_name AS coordinator_last_name
     FROM deployment_requests dr
     JOIN users u ON u.id = dr.coordinator_id
     JOIN coordinators c ON c.user_id = u.id
     WHERE dr.supervisor_id = $1
       AND dr.direction = 'coordinator_to_supervisor'
       AND dr.status = 'approved'
     ORDER BY dr.created_at DESC`,
    [supervisorUserId]
  );
  return result.rows;
}

// Students (user ids) for one of the supervisor's approved deployment requests.
async function getBatchUserIds(requestId, supervisorUserId) {
  const result = await pool.query(
    `SELECT drs.student_id AS user_id
     FROM deployment_request_students drs
     JOIN deployment_requests dr ON dr.id = drs.deployment_request_id
     WHERE dr.id = $1 AND dr.supervisor_id = $2`,
    [requestId, supervisorUserId]
  );
  return result.rows.map((r) => r.user_id);
}

// GET /api/supervisor/batches
const getSupervisorBatchStudents = async (req, res) => {
  try {
    const supervisorUserId = req.user.id;
    const batches = await getSupervisorBatches(supervisorUserId);

    const enriched = [];
    for (const b of batches) {
      const students = await pool.query(
        `SELECT s.id AS student_id, s.user_id, s.first_name, s.last_name,
                s.student_number, s.grade_level, s.track_strand, s.photo_url, u.email
         FROM deployment_request_students drs
         JOIN users u ON u.id = drs.student_id
         JOIN students s ON s.user_id = u.id
         WHERE drs.deployment_request_id = $1
         ORDER BY s.last_name, s.first_name`,
        [b.request_id]
      );
      enriched.push({ ...b, students: students.rows });
    }

    res.json({ batches: enriched });
  } catch (err) {
    console.error('getSupervisorBatchStudents error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
};

// GET /api/supervisor/batches/:requestId/attendance?from=&to=
// Attendance of the batch's students, grouped by day (Day N from each student's
// first recorded attendance date).
const getBatchAttendance = async (req, res) => {
  try {
    const supervisorUserId = req.user.id;
    const { requestId } = req.params;
    const userIds = await getBatchUserIds(requestId, supervisorUserId);
    if (userIds.length === 0) {
      return res.json({ batch_label: null, students: [], days: [], summary: { total_students: 0, days: 0 } });
    }

    const { from, to } = req.query;
    const dateFilter = [];
    const params = [userIds];
    if (from) {
      params.push(from);
      dateFilter.push(`AND sa.date >= $${params.length}`);
    }
    if (to) {
      params.push(to);
      dateFilter.push(`AND sa.date <= $${params.length}`);
    }

    const firstDates = await pool.query(
      `SELECT s.id AS student_id, MIN(sa.date) AS first_date
       FROM students s
       JOIN student_attendance sa ON sa.student_id = s.id
       WHERE s.user_id = ANY($1::int[])
       GROUP BY s.id`,
      [userIds]
    );
    const firstDateMap = new Map(firstDates.rows.map((r) => [r.student_id, r.first_date]));

    const batch = await pool.query(
      `SELECT batch_label FROM deployment_requests WHERE id = $1`,
      [requestId]
    );

    const records = await pool.query(
      `SELECT sa.id, sa.student_id, sa.date, sa.status,
              sa.check_in_time, sa.check_out_time,
              sa.appeal_time_in_id, sa.appeal_time_out_id,
              s.first_name, s.last_name, s.student_number, s.grade_level,
              s.track_strand, s.photo_url, u.email
       FROM student_attendance sa
       JOIN students s ON s.id = sa.student_id
       JOIN users u ON u.id = s.user_id
       WHERE s.user_id = ANY($1::int[])
       ${dateFilter.join(' ')}
       ORDER BY sa.date ASC, s.last_name ASC, s.first_name ASC`,
      params
    );

    const studentsMap = new Map();
    const daysSet = new Set();

    for (const r of records.rows) {
      const firstDate = firstDateMap.get(r.student_id);
      let dayNumber = null;
      if (firstDate) {
        const diff = Math.floor((new Date(r.date) - new Date(firstDate)) / (1000 * 60 * 60 * 24));
        dayNumber = diff + 1;
        daysSet.add(dayNumber);
      }
      if (!studentsMap.has(r.student_id)) {
        studentsMap.set(r.student_id, {
          student_id: r.student_id,
          first_name: r.first_name,
          last_name: r.last_name,
          student_number: r.student_number,
          grade_level: r.grade_level,
          track_strand: r.track_strand,
          photo_url: r.photo_url,
          email: r.email,
          days: {},
        });
      }
      studentsMap.get(r.student_id).days[String(dayNumber)] = {
        record_id: r.id,
        date: r.date,
        status: r.status,
        check_in_time: r.check_in_time,
        check_out_time: r.check_out_time,
        appeal_time_in_id: r.appeal_time_in_id,
        appeal_time_out_id: r.appeal_time_out_id,
      };
    }

    const students = Array.from(studentsMap.values()).sort((a, b) =>
      `${a.last_name} ${a.first_name}`.localeCompare(`${b.last_name} ${b.first_name}`)
    );
    const days = Array.from(daysSet).sort((a, b) => a - b);

    res.json({
      batch_label: batch.rows[0]?.batch_label || null,
      students,
      days,
      summary: { total_students: students.length, days: days.length },
    });
  } catch (err) {
    console.error('getBatchAttendance error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
};

module.exports = {
  getSupervisorBatchStudents,
  getBatchAttendance,
};
