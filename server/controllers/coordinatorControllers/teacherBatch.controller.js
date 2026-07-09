const pool = require('../../db/');

const createTeacherBatch = async (req, res) => {
  const client = await pool.connect();
  try {
    const coordinatorUserId = req.user.id;

    const coordinatorRow = await client.query(
      "SELECT id FROM coordinators WHERE user_id = $1",
      [coordinatorUserId]
    );
    const coordinatorId = coordinatorRow.rows[0]?.id;
    if (!coordinatorId) {
      return res.status(400).json({ error: 'Coordinator profile not found.' });
    }

    const { teacher_id, batch_label, max_students } = req.body;

    if (!teacher_id || !batch_label || !max_students) {
      return res.status(400).json({ error: 'teacher_id, batch_label, and max_students are required.' });
    }

    const max = Number(max_students);
    if (!Number.isInteger(max) || max <= 0) {
      return res.status(400).json({ error: 'max_students must be a positive integer.' });
    }

    const teacherRow = await client.query(
      "SELECT id FROM teachers WHERE user_id = $1",
      [teacher_id]
    );
    const teachersId = teacherRow.rows[0]?.id;
    if (!teachersId) {
      return res.status(400).json({ error: 'Invalid teacher_id.' });
    }

    const existingTeacherBatch = await client.query(
      "SELECT id FROM teacher_batches WHERE teacher_id = $1 LIMIT 1",
      [teachersId]
    );
    if (existingTeacherBatch.rows.length > 0) {
      return res.status(409).json({ error: 'Teacher is already assigned to a batch.' });
    }

    const result = await client.query(
      "INSERT INTO teacher_batches (coordinator_id, teacher_id, batch_label, max_students) VALUES ($1, $2, $3, $4) RETURNING id, coordinator_id, teacher_id, batch_label, max_students, created_at, updated_at",
      [coordinatorId, teachersId, batch_label, max]
    );

    res.status(201).json({ batch: result.rows[0] });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'Batch already exists for this teacher.' });
    }
    console.error('createTeacherBatch error:', err);
    res.status(500).json({ error: 'Server error.' });
  } finally {
    client.release();
  }
};

const updateTeacherBatch = async (req, res) => {
  const client = await pool.connect();
  try {
    const coordinatorUserId = req.user.id;

    const coordinatorRow = await client.query(
      "SELECT id FROM coordinators WHERE user_id = $1",
      [coordinatorUserId]
    );
    const coordinatorId = coordinatorRow.rows[0]?.id;
    if (!coordinatorId) {
      return res.status(400).json({ error: 'Coordinator profile not found.' });
    }
    const { batchId } = req.params;
    const { max_students, batch_label } = req.body;

    if (!max_students && !batch_label) {
      return res.status(400).json({ error: 'max_students or batch_label is required.' });
    }

    const fields = [];
    const values = [];
    let idx = 1;

    if (max_students) {
      const max = Number(max_students);
      if (!Number.isInteger(max) || max <= 0) {
        return res.status(400).json({ error: 'max_students must be a positive integer.' });
      }
      fields.push(`max_students = $${idx++}`);
      values.push(max);
    }

    if (batch_label) {
      fields.push(`batch_label = $${idx++}`);
      values.push(batch_label);
    }

    const sql = `
      UPDATE teacher_batches
      SET ${fields.join(', ')}, updated_at = CURRENT_TIMESTAMP
      WHERE id = $${idx++}
        AND coordinator_id = $${idx}
      RETURNING id, coordinator_id, teacher_id, batch_label, max_students, created_at, updated_at
    `;

    values.push(batchId);
    values.push(coordinatorId);

    const result = await client.query(sql, values);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Batch not found or insufficient permissions.' });
    }

    res.json({ batch: result.rows[0] });
  } catch (err) {
    console.error('updateTeacherBatch error:', err);
    res.status(500).json({ error: 'Server error.' });
  } finally {
    client.release();
  }
};

const deleteTeacherBatch = async (req, res) => {
  const client = await pool.connect();
  try {
    const coordinatorUserId = req.user.id;

    const coordinatorRow = await client.query(
      "SELECT id FROM coordinators WHERE user_id = $1",
      [coordinatorUserId]
    );
    const coordinatorId = coordinatorRow.rows[0]?.id;
    if (!coordinatorId) {
      return res.status(400).json({ error: 'Coordinator profile not found.' });
    }
    const { batchId } = req.params;

    const batchCheck = await client.query(
      `SELECT id FROM teacher_batches WHERE id = $1 AND coordinator_id = $2`,
      [batchId, coordinatorId]
    );

    if (batchCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Batch not found or insufficient permissions.' });
    }

    await client.query('BEGIN');
    await client.query(`DELETE FROM teacher_batch_students WHERE teacher_batch_id = $1`, [batchId]);
    await client.query(`DELETE FROM teacher_batches WHERE id = $1`, [batchId]);
    await client.query('COMMIT');

    res.json({ message: 'Batch deleted successfully.' });
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch (_) {}
    console.error('deleteTeacherBatch error:', err);
    res.status(500).json({ error: 'Server error.' });
  } finally {
    client.release();
  }
};

const assignApprovedStudentsToBatch = async (req, res) => {
  const client = await pool.connect();
  try {
    const coordinatorUserId = req.user.id;

    const coordinatorRow = await pool.query(
      "SELECT id FROM coordinators WHERE user_id = $1",
      [coordinatorUserId]
    );
    const coordinatorId = coordinatorRow.rows[0]?.id;
    if (!coordinatorId) {
      return res.status(400).json({ error: 'Coordinator profile not found.' });
    }
    const { batchId } = req.params;
    const { student_ids } = req.body;

    if (!Array.isArray(student_ids)) {
      return res.status(400).json({ error: 'student_ids must be an array.' });
    }

    const batchCheck = await client.query(
      `SELECT id, coordinator_id, teacher_id, max_students
       FROM teacher_batches
       WHERE id = $1`,
      [batchId]
    );

    if (batchCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Batch not found.' });
    }
    if (batchCheck.rows[0].coordinator_id !== coordinatorId) {
      return res.status(403).json({ error: 'Access denied.' });
    }

    const max = Number(batchCheck.rows[0].max_students);
    const uniqueStudentIds = Array.from(new Set(student_ids.map((x) => Number(x)).filter((n) => Number.isFinite(n))));

    if (uniqueStudentIds.length > max) {
      return res.status(400).json({ error: `Exceeds max capacity. Max: ${max}, Selected: ${uniqueStudentIds.length}` });
    }

    // Only students whose requirements have been explicitly approved by a coordinator can be assigned.
    const studentsCheck = await client.query(
      `SELECT u.id
       FROM users u
       JOIN student_requirement_submissions srs ON srs.user_id = u.id
       WHERE u.role = 'student'
         AND srs.status = 'Approved'
         AND u.id = ANY($1::int[])`,
       [uniqueStudentIds]
     );

    const completedFoundIds = studentsCheck.rows.map((r) => r.id);
    const missingCount = uniqueStudentIds.length - completedFoundIds.length;
    if (missingCount > 0) {
      return res.status(400).json({ error: 'One or more students have not completed requirements or were not found.' });
    }

    // Conflict rule: a student cannot be assigned to another teacher/batch (any teacher batch other than this one)
    // Allow re-assigning within the same batchId.
    const conflictCheck = await client.query(
      `SELECT DISTINCT tbs.student_id
       FROM teacher_batch_students tbs
       JOIN teacher_batches tb ON tb.id = tbs.teacher_batch_id
       WHERE tb.coordinator_id = $1
         AND tbs.student_id = ANY($2::int[])
         AND tbs.teacher_batch_id <> $3`,
      [coordinatorId, uniqueStudentIds, batchId]
    );

    const conflictedIds = conflictCheck.rows.map((r) => r.student_id);
    if (conflictedIds.length > 0) {
      return res.status(409).json({
        error: 'One or more students are already assigned to another teacher batch.',
        conflicts: conflictedIds,
      });
    }

    await client.query('BEGIN');

    await client.query(
      `DELETE FROM teacher_batch_students WHERE teacher_batch_id = $1`,
      [batchId]
    );

    if (uniqueStudentIds.length > 0) {
      const placeholders = uniqueStudentIds.map((_, i) => `($1, $${i + 2}, NOW())`).join(',');
      const params = [batchId, ...uniqueStudentIds];
      await client.query(
        `INSERT INTO teacher_batch_students (teacher_batch_id, student_id, assigned_at)
         VALUES ${placeholders}`,
        params
      );
    }

    await client.query('COMMIT');

    res.json({ message: 'Students assigned successfully.' });
  } catch (err) {
    try {
      await client.query('ROLLBACK');
    } catch (_) {}
    console.error('assignApprovedStudentsToBatch error:', err);
    res.status(500).json({ error: 'Server error.' });
  } finally {
    client.release();
  }
};

const getRequirementCompletedStudentsForCoordinator = async (req, res) => {
  try {
    const result = await pool.query(
       `SELECT
         u.id,
         s.id AS student_id,
         s.first_name,
         s.last_name,
         u.email,
         s.grade_level,
         s.track_strand AS strand,
         u.phone,
         u.status AS account_status,
         srs.status AS requirements_status,
         srs.progress,
         srs.submitted_at
        FROM users u
        JOIN students s ON s.user_id = u.id
        JOIN student_requirement_submissions srs ON srs.user_id = u.id
        WHERE u.role = 'student'
          AND srs.status = 'Approved'
        ORDER BY srs.updated_at DESC, s.last_name ASC`
    );

    res.json({ students: result.rows });
  } catch (err) {
    console.error('getRequirementCompletedStudentsForCoordinator error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
};

const getMyTeacherBatches = async (req, res) => {
  try {
    const teacherUserId = req.user.id;

    const teacherRow = await pool.query(
      "SELECT id FROM teachers WHERE user_id = $1",
      [teacherUserId]
    );
    const teacherId = teacherRow.rows[0]?.id;
    if (!teacherId) {
      return res.status(400).json({ error: 'Teacher profile not found.' });
    }

    const result = await pool.query(
      `SELECT id, teacher_id, batch_label, max_students, created_at, updated_at
       FROM teacher_batches
       WHERE teacher_id = $1
       ORDER BY created_at DESC`,
      [teacherId]
    );

    res.json({ batches: result.rows });
  } catch (err) {
    console.error('getMyTeacherBatches error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
};

const getTeacherBatchStudents = async (req, res) => {
  try {
    const { batchId } = req.params;

    if (req.user.role === 'teacher') {
      const teacherRow = await pool.query(
        "SELECT id FROM teachers WHERE user_id = $1",
        [req.user.id]
      );
      const teacherId = teacherRow.rows[0]?.id;
      if (!teacherId) {
        return res.status(400).json({ error: 'Teacher profile not found.' });
      }
      const ownership = await pool.query(
        "SELECT id FROM teacher_batches WHERE id = $1 AND teacher_id = $2",
        [batchId, teacherId]
      );
      if (ownership.rows.length === 0) {
        return res.status(403).json({ error: 'Access denied.' });
      }
    }

    if (req.user.role === 'coordinator') {
      const coordinatorRow = await pool.query(
        "SELECT id FROM coordinators WHERE user_id = $1",
        [req.user.id]
      );
      const coordinatorId = coordinatorRow.rows[0]?.id;
      if (!coordinatorId) {
        return res.status(400).json({ error: 'Coordinator profile not found.' });
      }
      const ownership = await pool.query(
        "SELECT id FROM teacher_batches WHERE id = $1 AND coordinator_id = $2",
        [batchId, coordinatorId]
      );
      if (ownership.rows.length === 0) {
        return res.status(403).json({ error: 'Access denied.' });
      }
    }

    const result = await pool.query(
      `SELECT
         u.id,
         s.id AS student_id,
         s.first_name,
         s.last_name,
         s.email,
         s.grade_level,
         s.track_strand AS strand,
         u.phone,
         u.status,
         tbs.assigned_at
       FROM teacher_batch_students tbs
       JOIN users u ON u.id = tbs.student_id
       JOIN students s ON s.user_id = u.id
       WHERE tbs.teacher_batch_id = $1
       ORDER BY tbs.assigned_at DESC`,
      [batchId]
    );

    res.json({ students: result.rows });
  } catch (err) {
    console.error('getTeacherBatchStudents error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
};

const getTeachersListForCoordinator = async (req, res) => {
  try {
    const { status } = req.query;
    const result = await pool.query(
      `SELECT u.id, u.email, u.status, u.created_at,
              t.first_name, t.last_name, t.employee_id, t.department
       FROM users u
       JOIN teachers t ON t.user_id = u.id
       WHERE u.role = 'teacher'
         AND ($1::text IS NULL OR u.status = $1)
       ORDER BY u.created_at DESC`,
      [status || null]
    );

    res.json({ teachers: result.rows });
  } catch (err) {
    console.error('getTeachersListForCoordinator error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
};

const getCoordinatorBatchesWithAssignedStudents = async (req, res) => {
  try {
    const coordinatorUserId = req.user.id;

    const coordinatorRow = await pool.query(
      "SELECT id FROM coordinators WHERE user_id = $1",
      [coordinatorUserId]
    );
    const coordinatorId = coordinatorRow.rows[0]?.id;
    if (!coordinatorId) {
      return res.status(400).json({ error: 'Coordinator profile not found.' });
    }

    const rows = await pool.query(
      `SELECT
         tb.id AS batch_id,
         tb.batch_label,
         tb.max_students,
         tb.teacher_id,
         t.first_name,
         t.last_name,
         t.employee_id,
         tb.created_at,
         tb.updated_at,
         tbs.student_id,
         tbs.assigned_at,
         tbs.student_id AS student_number,
         st.first_name AS student_first_name,
         st.last_name AS student_last_name,
         st.email AS student_email,
         st.track_strand AS student_strand
       FROM teacher_batches tb
       JOIN teachers t ON t.id = tb.teacher_id
       LEFT JOIN teacher_batch_students tbs ON tbs.teacher_batch_id = tb.id
       LEFT JOIN users su ON su.id = tbs.student_id
       LEFT JOIN students st ON st.user_id = su.id
       WHERE tb.coordinator_id = $1
       ORDER BY tb.created_at DESC, tbs.assigned_at DESC`,
       [coordinatorId]
     );

    const batchesMap = new Map();

    for (const r of rows.rows || []) {
      if (!batchesMap.has(r.batch_id)) {
        batchesMap.set(r.batch_id, {
          id: r.batch_id,
          batch_label: r.batch_label,
          max_students: r.max_students,
          teacher: {
            id: r.teacher_id,
            first_name: r.first_name,
            last_name: r.last_name,
            employee_id: r.employee_id,
          },
          students: [],
          created_at: r.created_at,
          updated_at: r.updated_at,
        });
      }

      if (r.student_id) {
        batchesMap.get(r.batch_id).students.push({
          id: r.student_id,
          student_id: r.student_number,
          first_name: r.student_first_name,
          last_name: r.student_last_name,
          email: r.student_email,
          strand: r.student_strand,
          assigned_at: r.assigned_at,
        });
      }
    }

    res.json({ batches: Array.from(batchesMap.values()) });
  } catch (err) {
    console.error('getCoordinatorBatchesWithAssignedStudents error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
};

module.exports = {
  createTeacherBatch,
  updateTeacherBatch,
  deleteTeacherBatch,
  assignApprovedStudentsToBatch,
  getMyTeacherBatches,
  getTeacherBatchStudents,
  getTeachersListForCoordinator,
  getCoordinatorBatchesWithAssignedStudents,
  getRequirementCompletedStudentsForCoordinator,
};