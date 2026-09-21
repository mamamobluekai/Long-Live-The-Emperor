// Shared authorization for teacher-batch scoped endpoints.
//
// A teacher batch can be accessed by THREE different roles now:
//   - the TEACHER the batch is assigned to (may handle several batches)
//   - the SUPERVISOR linked to the batch (owns attendance scheduling)
//   - the COORDINATOR who created the batch
//
// Centralising the check keeps attendance scheduling, records, and reports
// consistent across every controller that touches a batch.
const pool = require('../db/');

/**
 * Resolve the caller's relationship to a teacher batch.
 *
 * @param {{ id:number, role:string }} user  req.user from verifyToken
 * @param {number|string} batchId
 * @returns {Promise<{ batch:object|null, isTeacher:boolean, isSupervisor:boolean, isCoordinator:boolean, teacherId:(number|null) }>}
 */
async function resolveBatchAccess(user, batchId) {
  const batchRes = await pool.query(
    `SELECT id, teacher_id, coordinator_id, supervisor_id, batch_label, max_students
     FROM teacher_batches WHERE id = $1`,
    [batchId]
  );
  const batch = batchRes.rows[0] || null;
  const result = {
    batch,
    isTeacher: false,
    isSupervisor: false,
    isCoordinator: false,
    teacherId: null,
  };
  if (!batch || !user) return result;

  // Supervisor: teacher_batches.supervisor_id references users(id).
  if (batch.supervisor_id && Number(batch.supervisor_id) === Number(user.id)) {
    result.isSupervisor = true;
  }

  // Coordinator: teacher_batches.coordinator_id references coordinators.id,
  // so we must map the coordinator's user id -> coordinator profile id.
  if (!result.isSupervisor) {
    const coordRes = await pool.query('SELECT id FROM coordinators WHERE user_id = $1', [user.id]);
    const coordinatorId = coordRes.rows[0]?.id;
    if (coordinatorId && Number(batch.coordinator_id) === Number(coordinatorId)) {
      result.isCoordinator = true;
    }
  }

  // Teacher: teacher_batches.teacher_id references teachers.id.
  if (!result.isSupervisor && !result.isCoordinator) {
    const teacherRes = await pool.query('SELECT id FROM teachers WHERE user_id = $1', [user.id]);
    const teacherId = teacherRes.rows[0]?.id;
    if (teacherId && Number(batch.teacher_id) === Number(teacherId)) {
      result.isTeacher = true;
      result.teacherId = teacherId;
    }
  }

  return result;
}

/**
 * Assert the caller may access the batch. Returns { ok, denied } where denied
 * is a ready-to-send { status, error } when access is refused.
 */
async function assertBatchAccess(user, batchId) {
  const access = await resolveBatchAccess(user, batchId);
  if (!access.batch) {
    return { ok: false, denied: { status: 404, error: 'Batch not found.' }, access };
  }
  if (!access.isTeacher && !access.isSupervisor && !access.isCoordinator) {
    return { ok: false, denied: { status: 403, error: 'Access denied.' }, access };
  }
  return { ok: true, denied: null, access };
}

module.exports = { resolveBatchAccess, assertBatchAccess };