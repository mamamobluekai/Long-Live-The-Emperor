// Supervisor-facing views: students assigned to the supervisor through approved
// coordinator -> supervisor deployment requests, and students in teacher batches
// that are linked to the supervisor.
const pool = require('../../db');

// Approved deployment requests + teacher batches linked to this supervisor.
async function getSupervisorBatches(supervisorUserId) {
  const deployment = await pool.query(
    `SELECT dr.id AS request_id, dr.batch_label, dr.strand,
            c.first_name AS coordinator_first_name, c.last_name AS coordinator_last_name,
            'deployment' AS source
     FROM deployment_requests dr
     JOIN users u ON u.id = dr.coordinator_id
     JOIN coordinators c ON c.user_id = u.id
     WHERE dr.supervisor_id = $1
       AND dr.direction = 'coordinator_to_supervisor'
       AND dr.status = 'approved'
     ORDER BY dr.created_at DESC`,
    [supervisorUserId]
  );

  const teacher = await pool.query(
    `SELECT tb.id AS request_id, tb.batch_label, NULL AS strand,
            c.first_name AS coordinator_first_name, c.last_name AS coordinator_last_name,
            'teacher' AS source
     FROM teacher_batches tb
     JOIN coordinators c ON c.id = tb.coordinator_id
     WHERE tb.supervisor_id = $1
     ORDER BY tb.created_at DESC`,
    [supervisorUserId]
  );

  return [...deployment.rows, ...teacher.rows];
}

// Students for a deployment request batch.
async function getDeploymentStudents(requestId, supervisorUserId) {
  const result = await pool.query(
    `SELECT s.id AS student_id, s.user_id, s.first_name, s.last_name,
            s.student_number, s.grade_level, s.track_strand, s.photo_url, u.email
     FROM deployment_request_students drs
     JOIN deployment_requests dr ON dr.id = drs.deployment_request_id
     JOIN users u ON u.id = drs.student_id
     JOIN students s ON s.user_id = u.id
     WHERE drs.deployment_request_id = $1 AND dr.supervisor_id = $2
     ORDER BY s.last_name, s.first_name`,
    [requestId, supervisorUserId]
  );
  return result.rows;
}

// Students for a teacher batch.
async function getTeacherBatchStudents(requestId, supervisorUserId) {
  const result = await pool.query(
    `SELECT s.id AS student_id, s.user_id, s.first_name, s.last_name,
            s.student_number, s.grade_level, s.track_strand, s.photo_url, u.email
     FROM teacher_batch_students tbs
     JOIN teacher_batches tb ON tb.id = tbs.teacher_batch_id
     JOIN users u ON u.id = tbs.student_id
     JOIN students s ON s.user_id = u.id
     WHERE tbs.teacher_batch_id = $1 AND tb.supervisor_id = $2
     ORDER BY s.last_name, s.first_name`,
    [requestId, supervisorUserId]
  );
  return result.rows;
}

// GET /api/supervisor/batches
const getSupervisorBatchStudents = async (req, res) => {
  try {
    const supervisorUserId = req.user.id;
    const batches = await getSupervisorBatches(supervisorUserId);

    const enriched = [];
    for (const b of batches) {
      const students =
        b.source === 'teacher'
          ? await getTeacherBatchStudents(b.request_id, supervisorUserId)
          : await getDeploymentStudents(b.request_id, supervisorUserId);
      enriched.push({ ...b, students });
    }

    res.json({ batches: enriched });
  } catch (err) {
    console.error('getSupervisorBatchStudents error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
};

// GET /api/supervisor/batches/:requestId/attendance?from=&to=
const getBatchAttendance = async (req, res) => {
  try {
    const supervisorUserId = req.user.id;
    const { requestId } = req.params;

    const batchInfo = await pool.query(
      `SELECT dr.id, dr.batch_label, 'deployment' AS source
         FROM deployment_requests dr
        WHERE dr.id = $1 AND dr.supervisor_id = $2
        UNION ALL
       SELECT tb.id, tb.batch_label, 'teacher' AS source
         FROM teacher_batches tb
        WHERE tb.id = $1 AND tb.supervisor_id = $2
        LIMIT 1`,
      [requestId, supervisorUserId]
    );
    if (!batchInfo.rows.length) {
      return res.status(404).json({ error: 'Batch not found.' });
    }
    const batch = batchInfo.rows[0];

    let userIds;
    if (batch.source === 'teacher') {
      const result = await pool.query(
        `SELECT u.id AS user_id
         FROM teacher_batch_students tbs
         JOIN users u ON u.id = tbs.student_id
         WHERE tbs.teacher_batch_id = $1`,
        [requestId]
      );
      userIds = result.rows.map((r) => r.user_id);
    } else {
      const result = await pool.query(
        `SELECT drs.student_id AS user_id
         FROM deployment_request_students drs
         JOIN deployment_requests dr ON dr.id = drs.deployment_request_id
         WHERE drs.deployment_request_id = $1 AND dr.supervisor_id = $2`,
        [requestId, supervisorUserId]
      );
      userIds = result.rows.map((r) => r.user_id);
    }

    if (userIds.length === 0) {
      return res.json({ batch_label: batch.batch_label, students: [], days: [], summary: { total_students: 0, days: 0 } });
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
      batch_label: batch.batch_label,
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
