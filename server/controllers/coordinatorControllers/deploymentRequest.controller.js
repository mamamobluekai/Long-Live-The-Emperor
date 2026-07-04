const pool = require('../../db/');

const getSupervisorsListForCoordinator = async (req, res) => {
  try {
    const { status } = req.query;
    const result = await pool.query(
      `SELECT id, email, first_name, last_name, status, company_name, designation, phone, created_at
       FROM users
       WHERE role = 'supervisor'
         AND ($1::text IS NULL OR status = $1)
       ORDER BY created_at DESC`,
      [status || null]
    );
    res.json({ supervisors: result.rows });
  } catch (err) {
    console.error('getSupervisorsListForCoordinator error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
};

const createSupervisorRequest = async (req, res) => {
  const client = await pool.connect();
  try {
    const supervisorId = req.user.id;
    const { coordinator_id, batch_label, strand, num_students, notes } = req.body;

    if (!coordinator_id || !batch_label || !num_students) {
      return res.status(400).json({ error: 'coordinator_id, batch_label, and num_students are required.' });
    }

    const num = Number(num_students);
    if (!Number.isInteger(num) || num <= 0) {
      return res.status(400).json({ error: 'num_students must be a positive integer.' });
    }

    const coordinatorCheck = await client.query(
      `SELECT id FROM users WHERE id = $1 AND role IN ('coordinator', 'admin')`,
      [coordinator_id]
    );
    if (coordinatorCheck.rows.length === 0) {
      return res.status(400).json({ error: 'Invalid coordinator_id.' });
    }

    const result = await client.query(
      `INSERT INTO deployment_requests (coordinator_id, supervisor_id, batch_label, strand, num_students, notes, direction)
       VALUES ($1, $2, $3, $4, $5, $6, 'supervisor_to_coordinator')
       RETURNING id, coordinator_id, supervisor_id, batch_label, strand, num_students, notes, direction, status, created_at`,
      [coordinator_id, supervisorId, batch_label, strand || null, num, notes || null]
    );

    res.status(201).json({ deployment_request: result.rows[0] });
  } catch (err) {
    console.error('createSupervisorRequest error:', err);
    res.status(500).json({ error: 'Server error.' });
  } finally {
    client.release();
  }
};

const createDeploymentRequest = async (req, res) => {
  const client = await pool.connect();
  try {
    const coordinatorId = req.user.id;
    const { supervisor_id, batch_label, strand, notes, student_ids } = req.body;

    if (!supervisor_id || !batch_label || !student_ids || !Array.isArray(student_ids)) {
      return res.status(400).json({ error: 'supervisor_id, batch_label, and student_ids array are required.' });
    }

    const supervisorCheck = await client.query(
      `SELECT id FROM users WHERE id = $1 AND role = 'supervisor'`,
      [supervisor_id]
    );
    if (supervisorCheck.rows.length === 0) {
      return res.status(400).json({ error: 'Invalid supervisor_id.' });
    }

    const uniqueStudentIds = Array.from(new Set(student_ids.map((x) => Number(x)).filter((n) => Number.isFinite(n))));
    if (uniqueStudentIds.length === 0) {
      return res.status(400).json({ error: 'At least one student is required.' });
    }

    const studentsCheck = await client.query(
      `SELECT u.id
       FROM users u
       JOIN student_requirement_submissions srs ON srs.user_id = u.id
       WHERE u.role = 'student'
         AND srs.progress = 100
         AND srs.status NOT IN ('Rejected', 'Needs Revision')
         AND u.id = ANY($1::int[])`,
      [uniqueStudentIds]
    );

    if (studentsCheck.rows.length !== uniqueStudentIds.length) {
      return res.status(400).json({ error: 'One or more students have not completed requirements.' });
    }

    await client.query('BEGIN');

    const result = await client.query(
      `INSERT INTO deployment_requests (coordinator_id, supervisor_id, batch_label, strand, num_students, notes, direction)
       VALUES ($1, $2, $3, $4, $5, $6, 'coordinator_to_supervisor')
       RETURNING id, coordinator_id, supervisor_id, batch_label, strand, num_students, notes, direction, status, created_at`,
      [coordinatorId, supervisor_id, batch_label, strand || null, uniqueStudentIds.length, notes || null]
    );

    const requestId = result.rows[0].id;

    for (const sid of uniqueStudentIds) {
      await client.query(
        `INSERT INTO deployment_request_students (deployment_request_id, student_id) VALUES ($1, $2)`,
        [requestId, sid]
      );
    }

    await client.query('COMMIT');
    res.status(201).json({ deployment_request: result.rows[0] });
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch (_) {}
    console.error('createDeploymentRequest error:', err);
    res.status(500).json({ error: 'Server error.' });
  } finally {
    client.release();
  }
};

const getMyDeploymentRequests = async (req, res) => {
  try {
    const coordinatorId = req.user.id;
    const rows = await pool.query(
      `SELECT
          dr.id,
          dr.batch_label,
          dr.strand,
          dr.num_students,
          dr.notes,
          dr.direction,
          dr.status,
          dr.created_at,
          dr.updated_at,
          u.first_name AS supervisor_first_name,
          u.last_name AS supervisor_last_name,
          u.company_name AS supervisor_company,
          COUNT(drs.student_id) AS student_count
       FROM deployment_requests dr
       JOIN users u ON u.id = dr.supervisor_id
       LEFT JOIN deployment_request_students drs ON drs.deployment_request_id = dr.id
       WHERE dr.coordinator_id = $1
       GROUP BY dr.id, u.first_name, u.last_name, u.company_name
       ORDER BY dr.created_at DESC`,
      [coordinatorId]
    );

    res.json({ deployment_requests: rows.rows });
  } catch (err) {
    console.error('getMyDeploymentRequests error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
};

const getSupervisorDeploymentRequests = async (req, res) => {
  try {
    const supervisorId = req.user.id;
    const rows = await pool.query(
      `SELECT
          dr.id,
          dr.batch_label,
          dr.strand,
          dr.num_students,
          dr.notes,
          dr.direction,
          dr.status,
          dr.created_at,
          dr.updated_at,
          u.first_name AS coordinator_first_name,
          u.last_name AS coordinator_last_name,
          COUNT(drs.student_id) AS student_count
       FROM deployment_requests dr
       JOIN users u ON u.id = dr.coordinator_id
       LEFT JOIN deployment_request_students drs ON drs.deployment_request_id = dr.id
       WHERE dr.supervisor_id = $1
       GROUP BY dr.id, u.first_name, u.last_name
       ORDER BY dr.created_at DESC`,
      [supervisorId]
    );

    const requestIds = rows.rows.map((r) => r.id);
    let studentsMap = {};

    if (requestIds.length > 0) {
      const studentsRes = await pool.query(
        `SELECT
            drs.deployment_request_id,
            u.id,
            u.student_id,
            u.first_name,
            u.last_name,
            u.email,
            u.strand,
            u.grade_level
         FROM deployment_request_students drs
         JOIN users u ON u.id = drs.student_id
         WHERE drs.deployment_request_id = ANY($1::int[])
         ORDER BY u.last_name, u.first_name`,
        [requestIds]
      );

      for (const s of studentsRes.rows) {
        if (!studentsMap[s.deployment_request_id]) studentsMap[s.deployment_request_id] = [];
        studentsMap[s.deployment_request_id].push(s);
      }
    }

    const enriched = rows.rows.map((r) => ({
      ...r,
      students: studentsMap[r.id] || [],
    }));

    res.json({ deployment_requests: enriched });
  } catch (err) {
    console.error('getSupervisorDeploymentRequests error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
};

const getDeploymentRequestStudents = async (req, res) => {
  try {
    const { requestId } = req.params;
    const requesterId = req.user.id;

    const ownership = await pool.query(
      `SELECT id FROM deployment_requests WHERE id = $1 AND (coordinator_id = $2 OR supervisor_id = $2)`,
      [requestId, requesterId]
    );
    if (ownership.rows.length === 0) {
      return res.status(403).json({ error: 'Access denied.' });
    }

    const result = await pool.query(
      `SELECT
          u.id,
          u.student_id,
          u.first_name,
          u.last_name,
          u.email,
          u.strand,
          u.grade_level,
          u.phone
       FROM deployment_request_students drs
       JOIN users u ON u.id = drs.student_id
       WHERE drs.deployment_request_id = $1
       ORDER BY u.last_name, u.first_name`,
      [requestId]
    );

    res.json({ students: result.rows });
  } catch (err) {
    console.error('getDeploymentRequestStudents error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
};

const approveDeploymentRequest = async (req, res) => {
  const client = await pool.connect();
  try {
    const supervisorId = req.user.id;
    const { requestId } = req.params;

    const ownership = await client.query(
      `SELECT id, status FROM deployment_requests WHERE id = $1 AND supervisor_id = $2`,
      [requestId, supervisorId]
    );
    if (ownership.rows.length === 0) {
      return res.status(404).json({ error: 'Request not found.' });
    }
    if (ownership.rows[0].status !== 'pending') {
      return res.status(400).json({ error: 'Request already responded to.' });
    }

    const result = await client.query(
      `UPDATE deployment_requests
       SET status = 'approved', responded_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
       WHERE id = $1
       RETURNING id, status, responded_at`,
      [requestId]
    );

    res.json({ deployment_request: result.rows[0] });
  } catch (err) {
    console.error('approveDeploymentRequest error:', err);
    res.status(500).json({ error: 'Server error.' });
  } finally {
    client.release();
  }
};

const rejectDeploymentRequest = async (req, res) => {
  const client = await pool.connect();
  try {
    const supervisorId = req.user.id;
    const { requestId } = req.params;

    const ownership = await client.query(
      `SELECT id, status FROM deployment_requests WHERE id = $1 AND supervisor_id = $2`,
      [requestId, supervisorId]
    );
    if (ownership.rows.length === 0) {
      return res.status(404).json({ error: 'Request not found.' });
    }
    if (ownership.rows[0].status !== 'pending') {
      return res.status(400).json({ error: 'Request already responded to.' });
    }

    const result = await client.query(
      `UPDATE deployment_requests
       SET status = 'rejected', responded_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
       WHERE id = $1
       RETURNING id, status, responded_at`,
      [requestId]
    );

    res.json({ deployment_request: result.rows[0] });
  } catch (err) {
    console.error('rejectDeploymentRequest error:', err);
    res.status(500).json({ error: 'Server error.' });
  } finally {
    client.release();
  }
};

const deleteDeploymentRequest = async (req, res) => {
  const client = await pool.connect();
  try {
    const coordinatorId = req.user.id;
    const { requestId } = req.params;

    const ownership = await client.query(
      `SELECT id FROM deployment_requests WHERE id = $1 AND coordinator_id = $2`,
      [requestId, coordinatorId]
    );
    if (ownership.rows.length === 0) {
      return res.status(404).json({ error: 'Request not found.' });
    }

    await client.query('BEGIN');
    await client.query(`DELETE FROM deployment_request_students WHERE deployment_request_id = $1`, [requestId]);
    await client.query(`DELETE FROM deployment_requests WHERE id = $1`, [requestId]);
    await client.query('COMMIT');

    res.json({ message: 'Deployment request deleted.' });
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch (_) {}
    console.error('deleteDeploymentRequest error:', err);
    res.status(500).json({ error: 'Server error.' });
  } finally {
    client.release();
  }
};

const fulfillSupervisorRequest = async (req, res) => {
  const client = await pool.connect();
  try {
    const coordinatorId = req.user.id;
    const { requestId } = req.params;
    const { student_ids } = req.body;

    const requestCheck = await client.query(
      `SELECT id, status, num_students, direction FROM deployment_requests WHERE id = $1 AND coordinator_id = $2`,
      [requestId, coordinatorId]
    );
    if (requestCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Request not found.' });
    }
    const reqData = requestCheck.rows[0];
    if (reqData.direction !== 'supervisor_to_coordinator') {
      return res.status(400).json({ error: 'This is not a supervisor request.' });
    }
    if (reqData.status === 'fulfilled') {
      return res.status(400).json({ error: 'Request already fulfilled.' });
    }

    if (!Array.isArray(student_ids) || student_ids.length === 0) {
      return res.status(400).json({ error: 'student_ids array is required.' });
    }

    const uniqueStudentIds = Array.from(new Set(student_ids.map((x) => Number(x)).filter((n) => Number.isFinite(n))));

    if (reqData.num_students && uniqueStudentIds.length !== Number(reqData.num_students)) {
      return res.status(400).json({ error: `Expected ${reqData.num_students} students, got ${uniqueStudentIds.length}.` });
    }

    const studentsCheck = await client.query(
      `SELECT u.id
       FROM users u
       JOIN student_requirement_submissions srs ON srs.user_id = u.id
       WHERE u.role = 'student'
         AND srs.progress = 100
         AND srs.status NOT IN ('Rejected', 'Needs Revision')
         AND u.id = ANY($1::int[])`,
      [uniqueStudentIds]
    );

    if (studentsCheck.rows.length !== uniqueStudentIds.length) {
      return res.status(400).json({ error: 'One or more students have not completed requirements.' });
    }

    await client.query('BEGIN');

    for (const sid of uniqueStudentIds) {
      await client.query(
        `INSERT INTO deployment_request_students (deployment_request_id, student_id) VALUES ($1, $2)
         ON CONFLICT (deployment_request_id, student_id) DO NOTHING`,
        [requestId, sid]
      );
    }

    await client.query(
      `UPDATE deployment_requests
       SET status = 'fulfilled', updated_at = CURRENT_TIMESTAMP
       WHERE id = $1`,
      [requestId]
    );

    await client.query('COMMIT');
    res.json({ message: 'Students assigned and request fulfilled.' });
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch (_) {}
    console.error('fulfillSupervisorRequest error:', err);
    res.status(500).json({ error: 'Server error.' });
  } finally {
    client.release();
  }
};

module.exports = {
  getSupervisorsListForCoordinator,
  createSupervisorRequest,
  createDeploymentRequest,
  getMyDeploymentRequests,
  getSupervisorDeploymentRequests,
  getDeploymentRequestStudents,
  approveDeploymentRequest,
  rejectDeploymentRequest,
  deleteDeploymentRequest,
  fulfillSupervisorRequest,
};