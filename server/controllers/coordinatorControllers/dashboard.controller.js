const pool = require('../../db/');

const getCoordinatorDashboard = async (req, res) => {
  try {
    const coordinatorRow = await pool.query(
      'SELECT id FROM coordinators WHERE user_id = $1',
      [req.user.id]
    );
    const coordinatorId = coordinatorRow.rows[0]?.id;

    if (!coordinatorId) {
      return res.status(400).json({ error: 'Coordinator profile not found.' });
    }

    const [approvals, requirements, batches, deploymentRequests, recentRequests] = await Promise.all([
      pool.query(`
        SELECT COUNT(*)::int AS count
        FROM users
        WHERE role = 'student' AND status = 'pending'
      `),
      pool.query(`
        SELECT
          COUNT(*) FILTER (WHERE LOWER(status) IN ('pending', 'pending review'))::int AS pending_review,
          COUNT(*) FILTER (WHERE LOWER(status) = 'under review')::int AS under_review,
          COUNT(*) FILTER (WHERE LOWER(status) = 'approved')::int AS approved,
          COUNT(*) FILTER (WHERE LOWER(status) = 'rejected')::int AS rejected,
          COUNT(*) FILTER (WHERE LOWER(status) = 'needs revision')::int AS needs_revision,
          COUNT(*) FILTER (WHERE progress = 100)::int AS completed
        FROM student_requirement_submissions
      `),
      pool.query(`
        SELECT
          COUNT(DISTINCT tb.id)::int AS total,
          COUNT(tbs.student_id)::int AS assigned_students,
          COALESCE(SUM(tb.max_students), 0)::int AS capacity,
          COUNT(*) FILTER (WHERE tb.supervisor_id IS NULL)::int AS without_supervisor
        FROM teacher_batches tb
        LEFT JOIN teacher_batch_students tbs ON tbs.teacher_batch_id = tb.id
        WHERE tb.coordinator_id = $1
      `, [coordinatorId]),
      pool.query(`
        SELECT
          COUNT(*) FILTER (WHERE LOWER(status) = 'pending')::int AS pending,
          COUNT(*) FILTER (WHERE LOWER(status) = 'approved')::int AS approved,
          COUNT(*) FILTER (WHERE LOWER(status) = 'rejected')::int AS rejected,
          COUNT(*) FILTER (WHERE LOWER(status) = 'fulfilled')::int AS fulfilled
        FROM deployment_requests
        WHERE coordinator_id = $1
      `, [req.user.id]),
      pool.query(`
        SELECT
          dr.id,
          dr.batch_label,
          dr.num_students,
          dr.status,
          dr.direction,
          dr.created_at,
          sv.first_name AS supervisor_first_name,
          sv.last_name AS supervisor_last_name,
          sv.company_name AS supervisor_company
        FROM deployment_requests dr
        JOIN users su ON su.id = dr.supervisor_id
        JOIN supervisors sv ON sv.user_id = su.id
        WHERE dr.coordinator_id = $1
        ORDER BY dr.created_at DESC
        LIMIT 5
      `, [req.user.id]),
    ]);

    const requirementStats = requirements.rows[0] || {};
    const batchStats = batches.rows[0] || {};
    const requestStats = deploymentRequests.rows[0] || {};

    res.json({
      approvals: { pending: approvals.rows[0]?.count || 0 },
      requirements: {
        pendingReview: requirementStats.pending_review || 0,
        underReview: requirementStats.under_review || 0,
        approved: requirementStats.approved || 0,
        rejected: requirementStats.rejected || 0,
        needsRevision: requirementStats.needs_revision || 0,
        completed: requirementStats.completed || 0,
      },
      batches: {
        total: batchStats.total || 0,
        assignedStudents: batchStats.assigned_students || 0,
        capacity: batchStats.capacity || 0,
        availableSlots: Math.max((batchStats.capacity || 0) - (batchStats.assigned_students || 0), 0),
        withoutSupervisor: batchStats.without_supervisor || 0,
      },
      deploymentRequests: {
        pending: requestStats.pending || 0,
        approved: requestStats.approved || 0,
        rejected: requestStats.rejected || 0,
        fulfilled: requestStats.fulfilled || 0,
      },
      recentRequests: recentRequests.rows,
    });
  } catch (err) {
    console.error('getCoordinatorDashboard error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
};

module.exports = { getCoordinatorDashboard };