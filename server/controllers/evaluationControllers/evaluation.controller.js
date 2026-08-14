const pool = require('../../db');

async function ensureEvaluationTables() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS evaluation_criteria (
      id SERIAL PRIMARY KEY,
      category_name VARCHAR(255) NOT NULL,
      indicators JSONB NOT NULL DEFAULT '[]'::jsonb,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS student_evaluations (
      id SERIAL PRIMARY KEY,
      student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
      evaluator_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      batch_id INTEGER,
      category_scores JSONB NOT NULL DEFAULT '{}'::jsonb,
      overall_score NUMERIC(4,2),
      overall_percentage NUMERIC(5,2),
      comments TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_student_evaluations_student ON student_evaluations(student_id);
    CREATE INDEX IF NOT EXISTS idx_student_evaluations_evaluator ON student_evaluations(evaluator_id);
    CREATE INDEX IF NOT EXISTS idx_student_evaluations_batch ON student_evaluations(batch_id);

    ALTER TABLE student_evaluations ADD COLUMN IF NOT EXISTS overall_percentage NUMERIC(5,2);
  `);

  await pool.query(`
    DELETE FROM evaluation_criteria a
    USING evaluation_criteria b
    WHERE a.id > b.id
      AND a.category_name = b.category_name;
  `);

  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_evaluation_criteria_category_name
      ON evaluation_criteria(category_name);
  `);

  await pool.query(`
    INSERT INTO evaluation_criteria (id, category_name, indicators, sort_order) VALUES
      (1, 'Teamwork', '["Works cooperatively with team members","Contributes to team goals","Shares information and resources","Respects team members'' ideas and opinions","Resolves conflicts constructively"]', 1),
      (2, 'Communication', '["Expresses ideas clearly","Listens actively to others","Follows instructions accurately","Asks for clarification when needed"]', 2),
      (3, 'Attendance and Punctuality', '["Arrives on time for work","Attends all scheduled activities","Notifies supervisor of absences promptly"]', 3),
      (4, 'Productivity/Resilience', '["Completes tasks within deadlines","Maintains quality of work under pressure","Adapts to changing priorities","Bounces back from setbacks","Manages time effectively","Handles multiple tasks efficiently"]', 4),
      (5, 'Initiative/Proactivity', '["Seeks out additional responsibilities","Identifies areas for improvement","Takes initiative without being asked","Offers innovative solutions","Demonstrates self-direction","Volunteers for challenging tasks"]', 5),
      (6, 'Judgemental/Decision Making', '["Makes sound decisions","Considers consequences before acting","Seeks guidance when appropriate"]', 6),
      (7, 'Dependability/Reliability', '["Completes assigned tasks consistently","Follows through on commitments","Can be trusted with confidential information","Takes responsibility for actions"]', 7),
      (8, 'Attitude', '["Demonstrates positive outlook","Shows enthusiasm for work","Accepts constructive feedback","Treats others with respect","Maintains professional demeanor"]', 8),
      (9, 'Professionalism', '["Maintains appropriate appearance","Uses professional language","Adheres to company policies","Demonstrates ethical behavior"]', 9)
    ON CONFLICT (id) DO UPDATE SET
      category_name = EXCLUDED.category_name,
      indicators = EXCLUDED.indicators,
      sort_order = EXCLUDED.sort_order,
      updated_at = CURRENT_TIMESTAMP;
  `);
}

async function getCriteria(req, res) {
  try {
    await ensureEvaluationTables();
    const result = await pool.query(
      `SELECT id, category_name, indicators, sort_order
       FROM evaluation_criteria
       ORDER BY sort_order ASC, id ASC`
    );
    const criteria = result.rows.map((row) => ({
      id: row.id,
      category_name: row.category_name,
      indicators: Array.isArray(row.indicators) ? row.indicators : [],
      sort_order: row.sort_order,
    }));
    res.json({ criteria });
  } catch (err) {
    console.error('getCriteria error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
}

async function saveCriteria(req, res) {
  const client = await pool.connect();
  try {
    await ensureEvaluationTables();
    const { criteria } = req.body || {};
    if (!Array.isArray(criteria) || criteria.length === 0) {
      return res.status(400).json({ error: 'Invalid criteria payload.' });
    }

    await client.query('BEGIN');

    for (const c of criteria) {
      if (!c.category_name || !Array.isArray(c.indicators)) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'Each criteria item must include category_name and indicators.' });
      }
      await client.query(
        `INSERT INTO evaluation_criteria (id, category_name, indicators, sort_order, updated_at)
         VALUES ($1, $2, $3::jsonb, $4, CURRENT_TIMESTAMP)
         ON CONFLICT (id) DO UPDATE SET
           category_name = EXCLUDED.category_name,
           indicators = EXCLUDED.indicators,
           sort_order = EXCLUDED.sort_order,
           updated_at = CURRENT_TIMESTAMP`,
        [c.id, c.category_name, JSON.stringify(c.indicators), c.sort_order || 0]
      );
    }

    await client.query('COMMIT');
    res.json({ message: 'Criteria saved.' });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('saveCriteria error:', err);
    res.status(500).json({ error: 'Server error.' });
  } finally {
    client.release();
  }
}

function computeScores(criteria, categoryScores) {
  const ratingValues = { 1: 1, 2: 2, 3: 3, 4: 4, 5: 5, 'N/A': 0 };
  let totalWeighted = 0;
  let totalCounted = 0;

  const scores = criteria.map((cat) => {
    const catData = categoryScores[String(cat.id)] || {};
    const indicators = cat.indicators || [];
    const ratings = catData.indicators || [];
    let sum = 0;
    let naCount = 0;

    for (let i = 0; i < indicators.length; i++) {
      const r = ratings[i];
      if (r === 'N/A') naCount++;
      else sum += Number(ratingValues[r] || 0);
    }

    const counted = indicators.length - naCount;
    const categoryScore = counted > 0 ? sum / counted : 0;

    if (counted > 0) {
      totalWeighted += sum;
      totalCounted += counted;
    }

    return {
      category_id: cat.id,
      category_name: cat.category_name,
      ratings,
      category_score: counted > 0 ? Math.round(categoryScore * 100) / 100 : 0,
      category_percentage: counted > 0 ? Math.round((categoryScore / 5) * 10000) / 100 : 0,
      counted,
    };
  });

  const overallScore = totalCounted > 0 ? Math.round((totalWeighted / totalCounted) * 100) / 100 : 0;
  const overallPercentage = totalCounted > 0 ? Math.round((overallScore / 5) * 10000) / 100 : 0;

  return { category_scores: scores, overall_score: overallScore, overall_percentage: overallPercentage };
}

async function submitEvaluation(req, res) {
  const client = await pool.connect();
  try {
    await ensureEvaluationTables();
    const { studentId, batchId, categoryScores, comments } = req.body || {};
    if (!studentId || !categoryScores) {
      return res.status(400).json({ error: 'studentId and categoryScores are required.' });
    }

    const criteriaResult = await client.query(
      'SELECT id, category_name, indicators FROM evaluation_criteria ORDER BY sort_order ASC, id ASC'
    );
    const criteria = criteriaResult.rows;

    const { category_scores, overall_score, overall_percentage } = computeScores(criteria, categoryScores);

    const existing = await client.query(
      'SELECT id FROM student_evaluations WHERE student_id = $1 AND evaluator_id = $2 LIMIT 1',
      [studentId, req.user.id]
    );

    let result;
    if (existing.rows.length) {
      result = await client.query(
        `UPDATE student_evaluations
         SET batch_id = $1, category_scores = $2::jsonb, overall_score = $3, overall_percentage = $4, comments = $5, updated_at = CURRENT_TIMESTAMP
         WHERE id = $6
         RETURNING *`,
        [batchId || null, JSON.stringify(category_scores), overall_score, overall_percentage, comments || null, existing.rows[0].id]
      );
    } else {
      result = await client.query(
        `INSERT INTO student_evaluations (student_id, evaluator_id, batch_id, category_scores, overall_score, overall_percentage, comments)
         VALUES ($1, $2, $3, $4::jsonb, $5, $6, $7)
         RETURNING *`,
        [studentId, req.user.id, batchId || null, JSON.stringify(category_scores), overall_score, overall_percentage, comments || null]
      );
    }

    res.status(existing.rows.length ? 200 : 201).json({ evaluation: result.rows[0] });
  } catch (err) {
    console.error('submitEvaluation error:', err);
    res.status(500).json({ error: 'Server error.' });
  } finally {
    client.release();
  }
}

async function getStudentEvaluation(req, res) {
  try {
    await ensureEvaluationTables();
    const { studentId } = req.params;
    const result = await pool.query(
      `SELECT se.*, u.email AS evaluator_email,
              s.first_name, s.last_name, s.student_number, s.grade_level, s.track_strand
       FROM student_evaluations se
       JOIN users u ON u.id = se.evaluator_id
       JOIN students s ON s.id = se.student_id
       WHERE se.student_id = $1
       ORDER BY se.created_at DESC
       LIMIT 1`,
      [studentId]
    );
    if (!result.rows.length) {
      return res.json({ evaluation: null });
    }
    res.json({ evaluation: result.rows[0] });
  } catch (err) {
    console.error('getStudentEvaluation error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
}

async function listBatchEvaluations(req, res) {
  try {
    await ensureEvaluationTables();
    const { batchId } = req.params;
    const result = await pool.query(
      `SELECT se.*, s.first_name, s.last_name, s.student_number, s.grade_level, s.track_strand, u.email
       FROM student_evaluations se
       JOIN students s ON s.id = se.student_id
       JOIN users u ON u.id = s.user_id
       WHERE se.batch_id = $1
       ORDER BY s.last_name ASC, s.first_name ASC`,
      [batchId]
    );
    res.json({ evaluations: result.rows });
  } catch (err) {
    console.error('listBatchEvaluations error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
}

async function listMyStudents(req, res) {
  try {
    await ensureEvaluationTables();
    const supervisorUserId = req.user.id;

    const batchesResult = await pool.query(
      `SELECT dr.id AS request_id, dr.batch_label, 'deployment' AS source
       FROM deployment_requests dr
       WHERE dr.supervisor_id = $1 AND dr.status = 'approved'
       UNION ALL
       SELECT tb.id AS request_id, tb.batch_label, 'teacher' AS source
       FROM teacher_batches tb
       WHERE tb.supervisor_id = $1`,
      [supervisorUserId]
    );

    const enriched = [];
    for (const b of batchesResult.rows) {
      let students;
      if (b.source === 'teacher') {
        const r = await pool.query(
          `SELECT s.id AS student_id, s.user_id, s.first_name, s.last_name, s.student_number, s.grade_level, s.track_strand, u.email
           FROM teacher_batch_students tbs
           JOIN teacher_batches tb ON tb.id = tbs.teacher_batch_id
           JOIN users u ON u.id = tbs.student_id
           JOIN students s ON s.user_id = u.id
           WHERE tbs.teacher_batch_id = $1
           ORDER BY s.last_name, s.first_name`,
          [b.request_id]
        );
        students = r.rows;
      } else {
        const r = await pool.query(
          `SELECT s.id AS student_id, s.user_id, s.first_name, s.last_name, s.student_number, s.grade_level, s.track_strand, u.email
           FROM deployment_request_students drs
           JOIN deployment_requests dr ON dr.id = drs.deployment_request_id
           JOIN users u ON u.id = drs.student_id
           JOIN students s ON s.user_id = u.id
           WHERE drs.deployment_request_id = $1 AND dr.supervisor_id = $2
           ORDER BY s.last_name, s.first_name`,
          [b.request_id, supervisorUserId]
        );
        students = r.rows;
      }

      for (const s of students) {
        const evResult = await pool.query(
          'SELECT id, overall_score, overall_percentage, created_at FROM student_evaluations WHERE student_id = $1 AND evaluator_id = $2 LIMIT 1',
          [s.student_id, supervisorUserId]
        );
        enriched.push({
          ...s,
          batch_id: b.request_id,
          batch_label: b.batch_label,
          evaluation: evResult.rows[0] || null,
        });
      }
    }

    enriched.sort((a, b) => `${a.last_name} ${a.first_name}`.localeCompare(`${b.last_name} ${b.first_name}`));
    res.json({ students: enriched });
  } catch (err) {
    console.error('listMyStudents error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
}

async function getMyEvaluation(req, res) {
  try {
    await ensureEvaluationTables();
    const studentUserId = req.user.id;

    const studentResult = await pool.query(
      'SELECT id FROM students WHERE user_id = $1 LIMIT 1',
      [studentUserId]
    );
    if (!studentResult.rows.length) {
      return res.status(404).json({ error: 'Student profile not found.' });
    }
    const studentId = studentResult.rows[0].id;

    const result = await pool.query(
      `SELECT se.*, u.email AS evaluator_email,
              s.first_name, s.last_name, s.student_number, s.grade_level, s.track_strand
       FROM student_evaluations se
       JOIN users u ON u.id = se.evaluator_id
       JOIN students s ON s.id = se.student_id
       WHERE se.student_id = $1
       ORDER BY se.created_at DESC
       LIMIT 1`,
      [studentId]
    );
    if (!result.rows.length) {
      return res.json({ evaluation: null });
    }
    res.json({ evaluation: result.rows[0] });
  } catch (err) {
    console.error('getMyEvaluation error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
}

async function getTeacherBatchEvaluations(req, res) {
  try {
    await ensureEvaluationTables();
    const teacherUserId = req.user.id;

    const teacherResult = await pool.query(
      'SELECT id FROM teachers WHERE user_id = $1 LIMIT 1',
      [teacherUserId]
    );
    if (!teacherResult.rows.length) {
      return res.status(404).json({ error: 'Teacher profile not found.' });
    }
    const teacherId = teacherResult.rows[0].id;

    const batchesResult = await pool.query(
      `SELECT tb.id AS batch_id, tb.batch_label, tb.supervisor_id,
              sv.first_name AS supervisor_first_name, sv.last_name AS supervisor_last_name
       FROM teacher_batches tb
       JOIN supervisors sv ON sv.user_id = tb.supervisor_id
       WHERE tb.teacher_id = $1
       ORDER BY tb.batch_label ASC`,
      [teacherId]
    );

    const grouped = [];
    for (const batch of batchesResult.rows) {
      const studentsResult = await pool.query(
        `SELECT s.id AS student_id, s.user_id, s.first_name, s.last_name, s.student_number, s.grade_level, s.track_strand, u.email
         FROM teacher_batch_students tbs
         JOIN users u ON u.id = tbs.student_id
         JOIN students s ON s.user_id = u.id
         WHERE tbs.teacher_batch_id = $1
         ORDER BY s.last_name ASC, s.first_name ASC`,
        [batch.batch_id]
      );

      const students = await Promise.all(
        studentsResult.rows.map(async (s) => {
          const evResult = await pool.query(
            `SELECT se.id, se.overall_score, se.overall_percentage, se.created_at, se.comments,
                    u.email AS evaluator_email
             FROM student_evaluations se
             JOIN users u ON u.id = se.evaluator_id
             WHERE se.student_id = $1 AND (se.batch_id = $2 OR se.batch_id IS NULL)
             ORDER BY se.created_at DESC
             LIMIT 1`,
            [s.student_id, batch.batch_id]
          );
          return {
            ...s,
            evaluation: evResult.rows[0] || null,
          };
        })
      );

      grouped.push({
        batch_id: batch.batch_id,
        batch_label: batch.batch_label,
        supervisor_id: batch.supervisor_id,
        supervisor_name: `${batch.supervisor_first_name || ''} ${batch.supervisor_last_name || ''}`.trim() || 'Supervisor',
        students,
      });
    }

    res.json({ groups: grouped });
  } catch (err) {
    console.error('getTeacherBatchEvaluations error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
}

module.exports = {
  getCriteria,
  saveCriteria,
  submitEvaluation,
  getStudentEvaluation,
  getMyEvaluation,
  listBatchEvaluations,
  listMyStudents,
  getTeacherBatchEvaluations,
};
