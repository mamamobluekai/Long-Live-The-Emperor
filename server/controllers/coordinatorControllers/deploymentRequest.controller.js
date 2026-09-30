const pool = require('../../db/');
const { createNotification } = require('../../services/notification.service');

// Written on a supervisor request until the COORDINATOR supplies the real label
// while fulfilling it. The coordinator — not the supervisor — names the batch.
const AWAITING_LABEL = 'Awaiting coordinator';

let schemaReady;

// Mirrors the self-healing `ensure*Schema` pattern already used by
// requirements.controller.js and immersionSchedule.controller.js so the feature
// works even if migration 022 has not been applied yet.
async function ensureDeploymentSchema() {
  if (!schemaReady) {
    schemaReady = pool
      .query(`
        ALTER TABLE deployment_requests
          ADD COLUMN IF NOT EXISTS teacher_batch_id INTEGER
          REFERENCES teacher_batches(id) ON DELETE SET NULL;
        CREATE INDEX IF NOT EXISTS idx_deployment_requests_batch
          ON deployment_requests (teacher_batch_id);
      `)
      .catch((err) => {
        schemaReady = null;
        throw err;
      });
  }
  await schemaReady;
}

// Resolves the caller's coordinators.id (teacher_batches stores that, not the
// users.id that the JWT carries).
async function getCoordinatorProfileId(client, userId) {
  const result = await client.query('SELECT id FROM coordinators WHERE user_id = $1', [userId]);
  return result.rows[0]?.id || null;
}

const getSupervisorsListForCoordinator = async (req, res) => {
  try {
    const { status } = req.query;
    const result = await pool.query(
      `SELECT u.id, u.email, u.status, u.phone, u.created_at,
              s.first_name, s.last_name, s.company_name, s.designation
       FROM users u
       JOIN supervisors s ON s.user_id = u.id
       WHERE u.role = 'supervisor'
         AND ($1::text IS NULL OR u.status = $1)
       ORDER BY u.created_at DESC`,
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
    // The supervisor asks for a number of students. The batch LABEL is the
    // coordinator's job — it is supplied when the request is fulfilled.
    const { coordinator_id, strand, num_students, notes } = req.body;

    if (!coordinator_id || !num_students) {
      return res.status(400).json({ error: 'coordinator_id and num_students are required.' });
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
      [coordinator_id, supervisorId, AWAITING_LABEL, strand || null, num, notes || null]
    );

    const created = result.rows[0];

    void createNotification({
      userId: Number(coordinator_id),
      title: 'New student request',
      message: `A supervisor requested ${num} student${num === 1 ? '' : 's'}${strand ? ` for ${strand}` : ''}. Label the batch and assign students to fulfil it.`,
      type: 'info',
      category: 'deployment',
      actionUrl: '/dashboard/coordinator/deployment',
      relatedUserId: supervisorId,
      entityType: 'deployment_request',
      entityId: created.id,
    });

    res.status(201).json({ deployment_request: created });
  } catch (err) {
    console.error('createSupervisorRequest error:', err);
    res.status(500).json({ error: 'Server error.' });
  } finally {
    client.release();
  }
};

const getCoordinatorsForSupervisor = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT u.id, u.email, u.status,
              c.first_name, c.last_name, c.department, c.designation
       FROM users u
       JOIN coordinators c ON c.user_id = u.id
       WHERE u.role = 'coordinator'
       ORDER BY c.first_name, c.last_name`,
      []
    );
    res.json({ coordinators: result.rows });
  } catch (err) {
    console.error('getCoordinatorsForSupervisor error:', err);
    res.status(500).json({ error: 'Server error.' });
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
    await ensureDeploymentSchema();
    const coordinatorId = req.user.id;
    // Returns BOTH directions: requests the coordinator sent to supervisors, and
    // requests supervisors sent to this coordinator awaiting a batch label.
    const rows = await pool.query(
      `SELECT
          dr.id,
          dr.batch_label,
          dr.teacher_batch_id,
          dr.strand,
          dr.num_students,
          dr.notes,
          dr.direction,
          dr.status,
          dr.responded_at,
          dr.created_at,
          dr.updated_at,
          sv.first_name AS supervisor_first_name,
          sv.last_name AS supervisor_last_name,
          sv.company_name AS supervisor_company,
          c.first_name AS coordinator_first_name,
          c.last_name AS coordinator_last_name,
          COUNT(drs.student_id) AS student_count
       FROM deployment_requests dr
       JOIN users u ON u.id = dr.supervisor_id
       JOIN supervisors sv ON sv.user_id = u.id
       JOIN users cu ON cu.id = dr.coordinator_id
       JOIN coordinators c ON c.user_id = cu.id
       LEFT JOIN deployment_request_students drs ON drs.deployment_request_id = dr.id
       WHERE dr.coordinator_id = $1
       GROUP BY dr.id, sv.first_name, sv.last_name, sv.company_name, c.first_name, c.last_name
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
    await ensureDeploymentSchema();
    const supervisorId = req.user.id;
    const rows = await pool.query(
      `SELECT
          dr.id,
          dr.batch_label,
          dr.teacher_batch_id,
          dr.strand,
          dr.num_students,
          dr.notes,
          dr.direction,
          dr.status,
          dr.responded_at,
          dr.created_at,
          dr.updated_at,
          c.first_name AS coordinator_first_name,
          c.last_name AS coordinator_last_name,
          COUNT(drs.student_id) AS student_count
       FROM deployment_requests dr
       JOIN users u ON u.id = dr.coordinator_id
       JOIN coordinators c ON c.user_id = u.id
       LEFT JOIN deployment_request_students drs ON drs.deployment_request_id = dr.id
       WHERE dr.supervisor_id = $1
       GROUP BY dr.id, c.first_name, c.last_name
       ORDER BY dr.created_at DESC`,
      [supervisorId]
    );

    const requestIds = rows.rows.map((r) => r.id);
    let studentsMap = {};

    if (requestIds.length > 0) {
      const studentsRes = await pool.query(
        `        SELECT
            drs.deployment_request_id,
            u.id,
            s.id AS student_id,
            s.first_name,
            s.last_name,
            s.email,
            s.track_strand AS strand,
            s.grade_level
         FROM deployment_request_students drs
         JOIN users u ON u.id = drs.student_id
         JOIN students s ON s.user_id = u.id
         WHERE drs.deployment_request_id = ANY($1::int[])
         ORDER BY s.last_name, s.first_name`,
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
          s.id AS student_id,
          s.first_name,
          s.last_name,
          s.email,
          s.track_strand AS strand,
          s.grade_level,
          u.phone
       FROM deployment_request_students drs
       JOIN users u ON u.id = drs.student_id
       JOIN students s ON s.user_id = u.id
       WHERE drs.deployment_request_id = $1
       ORDER BY s.last_name, s.first_name`,
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
      `SELECT id, status, coordinator_id, batch_label FROM deployment_requests WHERE id = $1 AND supervisor_id = $2`,
      [requestId, supervisorId]
    );
    if (ownership.rows.length === 0) {
      return res.status(404).json({ message: 'Request not found.' });
    }
    if (ownership.rows[0].status !== 'pending') {
      return res.status(400).json({ message: 'Request already responded to.' });
    }

    const result = await client.query(
      `UPDATE deployment_requests
       SET status = 'approved', responded_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
       WHERE id = $1
       RETURNING id, status, responded_at, coordinator_id, batch_label`,
      [requestId]
    );

    const updated = result.rows[0];

    void createNotification({
      userId: updated.coordinator_id,
      title: 'Deployment approved',
      message: `Your deployment request for "${updated.batch_label}" was approved by the supervisor.`,
      type: 'success',
      category: 'deployment',
      actionUrl: '/dashboard/coordinator/deployment',
      relatedUserId: supervisorId,
      entityType: 'deployment_request',
      entityId: updated.id,
    });

    res.json({ deployment_request: { id: updated.id, status: updated.status, responded_at: updated.responded_at } });
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
      `SELECT id, status, coordinator_id, batch_label FROM deployment_requests WHERE id = $1 AND supervisor_id = $2`,
      [requestId, supervisorId]
    );
    if (ownership.rows.length === 0) {
      return res.status(404).json({ message: 'Request not found.' });
    }
    if (ownership.rows[0].status !== 'pending') {
      return res.status(400).json({ message: 'Request already responded to.' });
    }

    const result = await client.query(
      `UPDATE deployment_requests
       SET status = 'rejected', responded_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
       WHERE id = $1
       RETURNING id, status, responded_at, coordinator_id, batch_label`,
      [requestId]
    );

    const updated = result.rows[0];

    void createNotification({
      userId: updated.coordinator_id,
      title: 'Deployment rejected',
      message: `Your deployment request for "${updated.batch_label}" was rejected by the supervisor.`,
      type: 'error',
      category: 'deployment',
      actionUrl: '/dashboard/coordinator/deployment',
      relatedUserId: supervisorId,
      entityType: 'deployment_request',
      entityId: updated.id,
    });

    res.json({ deployment_request: { id: updated.id, status: updated.status, responded_at: updated.responded_at } });
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

// The coordinator LABELS the batch here, picks the students, and the requesting
// supervisor is attached to the resulting teacher batch exactly the way a
// teacher is. This is the single place a deployment becomes a real batch.
const fulfillSupervisorRequest = async (req, res) => {
  const client = await pool.connect();
  try {
    await ensureDeploymentSchema();
    const coordinatorUserId = req.user.id;
    const { requestId } = req.params;
    const { batch_label, student_ids, teacher_id, max_students } = req.body;

    const coordinatorId = await getCoordinatorProfileId(client, coordinatorUserId);
    if (!coordinatorId) {
      return res.status(400).json({ error: 'Coordinator profile not found.' });
    }

    const requestCheck = await client.query(
      `SELECT id, status, num_students, direction, supervisor_id
       FROM deployment_requests WHERE id = $1 AND coordinator_id = $2`,
      [requestId, coordinatorUserId]
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

    // The coordinator owns the label.
    const label = typeof batch_label === 'string' ? batch_label.trim() : '';
    if (!label) {
      return res.status(400).json({ error: 'batch_label is required — the coordinator labels the batch.' });
    }

    if (!Array.isArray(student_ids) || student_ids.length === 0) {
      return res.status(400).json({ error: 'student_ids array is required.' });
    }

    const uniqueStudentIds = Array.from(new Set(student_ids.map((x) => Number(x)).filter((n) => Number.isFinite(n))));

    if (reqData.num_students && uniqueStudentIds.length !== Number(reqData.num_students)) {
      return res.status(400).json({ error: `Expected ${reqData.num_students} students, got ${uniqueStudentIds.length}.` });
    }

    // students must have completed requirements
    const studentsCheck = await client.query(
      `SELECT u.id, s.id AS student_profile_id
       FROM users u
       JOIN students s ON s.user_id = u.id
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

    const studentProfileIds = studentsCheck.rows.map((r) => r.student_profile_id);

    const alreadyPlaced = await client.query(
      `SELECT DISTINCT tbs.student_id, tb.batch_label
       FROM teacher_batch_students tbs
       JOIN teacher_batches tb ON tb.id = tbs.teacher_batch_id
       WHERE tbs.student_id = ANY($1::int[])
       LIMIT 1`,
      [studentProfileIds]
    );
    if (alreadyPlaced.rows.length > 0) {
      const conflict = alreadyPlaced.rows[0];
      return res.status(409).json({
        error: conflict.batch_label
          ? `One or more students are already assigned to batch "${conflict.batch_label}". A student can only be assigned to one batch.`
          : 'One or more students are already assigned to another batch.',
      });
    }

    // A supervisor supervises ONE batch, same rule as createTeacherBatch.
    const supervisorConflict = await client.query(
      'SELECT id, batch_label FROM teacher_batches WHERE supervisor_id = $1 LIMIT 1',
      [reqData.supervisor_id]
    );
    if (supervisorConflict.rows.length > 0) {
      const conflict = supervisorConflict.rows[0];
      return res.status(409).json({
        error: conflict.batch_label
          ? `This supervisor is already assigned to batch "${conflict.batch_label}". A supervisor can only be assigned to one batch.`
          : 'This supervisor is already assigned to another batch.',
      });
    }

    // Resolve the teacher (the batch needs one, exactly like Teacher Batches).
    const teacherRow = await client.query('SELECT id FROM teachers WHERE user_id = $1', [teacher_id]);
    const teachersId = teacherRow.rows[0]?.id;
    if (!teachersId) {
      return res.status(400).json({ error: 'Invalid teacher_id.' });
    }

    const max = Number(max_students) || uniqueStudentIds.length;
    if (!Number.isInteger(max) || max <= 0) {
      return res.status(400).json({ error: 'max_students must be a positive integer.' });
    }

    await client.query('BEGIN');

    const batchResult = await client.query(
      `INSERT INTO teacher_batches (coordinator_id, teacher_id, batch_label, max_students, supervisor_id)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, batch_label, max_students, supervisor_id, teacher_id`,
      [coordinatorId, teachersId, label, max, reqData.supervisor_id]
    );
    const batch = batchResult.rows[0];

    for (const pid of studentProfileIds) {
      await client.query(
        `INSERT INTO teacher_batch_students (teacher_batch_id, student_id, assigned_at)
         VALUES ($1, $2, NOW()) ON CONFLICT (teacher_batch_id, student_id) DO NOTHING`,
        [batch.id, pid]
      );
    }

    for (const sid of uniqueStudentIds) {
      await client.query(
        `INSERT INTO deployment_request_students (deployment_request_id, student_id) VALUES ($1, $2)
         ON CONFLICT (deployment_request_id, student_id) DO NOTHING`,
        [requestId, sid]
      );
    }

    await client.query(
      `UPDATE deployment_requests
       SET status = 'fulfilled',
           batch_label = $2,
           teacher_batch_id = $3,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $1`,
      [requestId, label, batch.id]
    );

    await client.query('COMMIT');

    // The supervisor learns their request became a labelled batch.
    void createNotification({
      userId: reqData.supervisor_id,
      title: 'Students assigned to your batch',
      message: `Your request has been fulfilled. Batch "${label}" is ready with ${studentProfileIds.length} student${studentProfileIds.length === 1 ? '' : 's'}.`,
      type: 'success',
      category: 'deployment',
      actionUrl: '/dashboard/supervisor/students',
      relatedUserId: coordinatorUserId,
      entityType: 'deployment_request',
      entityId: Number(requestId),
    }).catch(() => {});

    // Each student is told which institution and batch they landed in.
    const supervisorRow = await client.query(
      'SELECT company_name FROM supervisors WHERE user_id = $1',
      [reqData.supervisor_id]
    );
    const company = supervisorRow.rows[0]?.company_name;
    await Promise.all(
      uniqueStudentIds.map((userId) =>
        createNotification({
          userId,
          title: 'You have been assigned to an immersion batch',
          message: `You are now deployed to batch "${label}"${company ? ` at ${company}` : ''}. Check your placement for the schedule.`,
          type: 'success',
          category: 'deployment',
          actionUrl: '/dashboard/student/placement',
          entityType: 'deployment_request',
          entityId: Number(requestId),
        }).catch(() => {})
      )
    );

    res.json({ message: 'Batch labelled, students assigned, and supervisor attached.', batch });
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
  getCoordinatorsForSupervisor,
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