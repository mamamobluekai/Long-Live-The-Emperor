const pool = require('../db');

async function ensureDocumentationTables() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS student_daily_documentation (
      id SERIAL PRIMARY KEY,
      student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
      teacher_batch_id INTEGER NOT NULL REFERENCES teacher_batches(id) ON DELETE CASCADE,
      date DATE NOT NULL,
      day_number INTEGER NOT NULL CHECK (day_number BETWEEN 1 AND 10),
      file_id INTEGER REFERENCES files(id) ON DELETE SET NULL,
      reasoning TEXT,
      status VARCHAR(50) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'submitted', 'reviewed', 'graded')),
      teacher_score INTEGER CHECK (teacher_score BETWEEN 0 AND 100),
      teacher_feedback TEXT,
      graded_by INTEGER REFERENCES users(id),
      graded_at TIMESTAMP,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE (student_id, teacher_batch_id, date)
    );

    CREATE TABLE IF NOT EXISTS documentation_criteria (
      id SERIAL PRIMARY KEY,
      criterion_name VARCHAR(255) NOT NULL,
      points INTEGER NOT NULL CHECK (points BETWEEN 0 AND 100),
      description TEXT,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_daily_doc_student_batch ON student_daily_documentation(student_id, teacher_batch_id);
    CREATE INDEX IF NOT EXISTS idx_daily_doc_batch_date ON student_daily_documentation(teacher_batch_id, date);
    CREATE INDEX IF NOT EXISTS idx_daily_doc_status ON student_daily_documentation(status);
    CREATE INDEX IF NOT EXISTS idx_doc_criteria_sort ON documentation_criteria(sort_order);
  `);

  await pool.query(`
    INSERT INTO documentation_criteria (id, criterion_name, points, description, sort_order) VALUES
      (1, 'Completeness of Daily Entries', 20, 'Student submits documentation for every required immersion day.', 1),
      (2, 'Accuracy of Information', 15, 'Activities, dates, times, and experiences are truthful and correctly recorded.', 2),
      (3, 'Description of Activities', 20, 'Clearly explains what the student actually did during the day.', 3),
      (4, 'Reflection and Learning', 20, 'Explains what the student learned, difficulties encountered, and how the experience improved their skills.', 4),
      (5, 'Relevance to Work Immersion', 10, 'Documentation is related to the assigned workplace, tasks, and learning competencies.', 5),
      (6, 'Organization and Presentation', 5, 'Entries are organized, readable, and properly formatted.', 6),
      (7, 'Professionalism', 5, 'Uses appropriate language and demonstrates professional attitude in documentation.', 7),
      (8, 'Supporting Evidence', 5, 'Includes appropriate evidence when required, such as photos, signatures, task records, or other verification.', 8)
    ON CONFLICT (id) DO UPDATE SET
      criterion_name = EXCLUDED.criterion_name,
      points = EXCLUDED.points,
      description = EXCLUDED.description,
      sort_order = EXCLUDED.sort_order,
      updated_at = CURRENT_TIMESTAMP;
  `);
}

async function getStudentDailyDocs(req, res) {
  try {
    await ensureDocumentationTables();
    const { studentId, batchId, date } = req.query;
    let query = `SELECT sdd.*, s.first_name, s.last_name, s.student_number, s.grade_level, s.track_strand,
                        u.email as student_email,
                        f.original_name, f.cloudinary_url, f.mime_type, f.file_size
                 FROM student_daily_documentation sdd
                 JOIN students s ON s.id = sdd.student_id
                 JOIN users u ON u.id = s.user_id
                 LEFT JOIN files f ON f.id = sdd.file_id
                 WHERE 1=1`;
    const params = [];
    const isStudent = req.user?.role === 'student';

    if (studentId) {
      params.push(studentId);
      query += ` AND sdd.student_id = $${params.length}`;
    } else if (isStudent) {
      const studentResult = await pool.query('SELECT id FROM students WHERE user_id = $1 LIMIT 1', [req.user.id]);
      if (!studentResult.rows.length) return res.status(404).json({ error: 'Student profile not found.' });
      params.push(studentResult.rows[0].id);
      query += ` AND sdd.student_id = $${params.length}`;
    }

    if (batchId) { params.push(batchId); query += ` AND sdd.teacher_batch_id = $${params.length}`; }
    if (date) { params.push(date); query += ` AND sdd.date = $${params.length}`; }
    query += ` ORDER BY sdd.date DESC, sdd.day_number ASC`;
    const result = await pool.query(query, params);
    res.json({ docs: result.rows });
  } catch (err) {
    console.error('getStudentDailyDocs error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
}

async function submitDailyDoc(req, res) {
  try {
    await ensureDocumentationTables();
    const studentUserId = req.user.id;
    const studentResult = await pool.query('SELECT id FROM students WHERE user_id = $1 LIMIT 1', [studentUserId]);
    if (!studentResult.rows.length) return res.status(404).json({ error: 'Student profile not found.' });
    const studentId = studentResult.rows[0].id;

    const { date, reasoning, fileId, batchId, day_number } = req.body || {};
    if (!date) return res.status(400).json({ error: 'Date is required.' });

    let finalBatchId = batchId;
    if (!finalBatchId) {
      const batchResult = await pool.query(
        'SELECT teacher_batch_id FROM teacher_batch_students WHERE student_id = $1 LIMIT 1',
        [studentId]
      );
      if (!batchResult.rows.length) return res.status(404).json({ error: 'Student is not assigned to a batch.' });
      finalBatchId = batchResult.rows[0].teacher_batch_id;
    }

    const batchResult = await pool.query('SELECT id FROM teacher_batches WHERE id = $1 LIMIT 1', [finalBatchId]);
    if (!batchResult.rows.length) return res.status(404).json({ error: 'Batch not found.' });

    const dateObj = new Date(date);
    const dayNumber = parseInt(day_number || '0', 10);
    if (isNaN(dateObj.getTime()) || dayNumber < 1 || dayNumber > 10) {
      return res.status(400).json({ error: 'Invalid date or day number.' });
    }

    const result = await pool.query(
      `INSERT INTO student_daily_documentation (student_id, teacher_batch_id, date, day_number, file_id, reasoning, status)
       VALUES ($1, $2, $3, $4, $5, $6, 'submitted')
       ON CONFLICT (student_id, teacher_batch_id, date) DO UPDATE SET
         file_id = EXCLUDED.file_id,
         reasoning = EXCLUDED.reasoning,
         status = 'submitted',
         updated_at = CURRENT_TIMESTAMP
       RETURNING *`,
      [studentId, finalBatchId, date, dayNumber, fileId || null, reasoning || '']
    );
    res.status(201).json({ doc: result.rows[0] });
  } catch (err) {
    console.error('submitDailyDoc error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
}

async function gradeDailyDoc(req, res) {
  try {
    await ensureDocumentationTables();
    const { docId } = req.params;
    const { teacherScore, teacherFeedback } = req.body || {};
    if (teacherScore === undefined || teacherScore === null) {
      return res.status(400).json({ error: 'Teacher score is required.' });
    }
    const score = parseInt(teacherScore, 10);
    if (isNaN(score) || score < 0 || score > 100) {
      return res.status(400).json({ error: 'Score must be between 0 and 100.' });
    }

    const result = await pool.query(
      `UPDATE student_daily_documentation
       SET teacher_score = $1, teacher_feedback = $2, status = 'graded', graded_by = $3, graded_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
       WHERE id = $4
       RETURNING *`,
      [score, teacherFeedback || '', req.user.id, docId]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Documentation not found.' });
    res.json({ doc: result.rows[0] });
  } catch (err) {
    console.error('gradeDailyDoc error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
}

async function getDocumentationCriteria(req, res) {
  try {
    await ensureDocumentationTables();
    const result = await pool.query(
      `SELECT id, criterion_name, points, description, sort_order
       FROM documentation_criteria
       ORDER BY sort_order ASC, id ASC`
    );
    res.json({ criteria: result.rows });
  } catch (err) {
    console.error('getDocumentationCriteria error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
}

async function saveDocumentationCriteria(req, res) {
  try {
    await ensureDocumentationTables();
    const { criteria } = req.body || {};
    if (!Array.isArray(criteria) || criteria.length === 0) {
      return res.status(400).json({ error: 'Invalid criteria payload.' });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      for (const c of criteria) {
        if (!c.criterion_name || c.points === undefined) {
          await client.query('ROLLBACK');
          return res.status(400).json({ error: 'Each criterion must include criterion_name and points.' });
        }
        await client.query(
          `INSERT INTO documentation_criteria (id, criterion_name, points, description, sort_order, updated_at)
           VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)
           ON CONFLICT (id) DO UPDATE SET
             criterion_name = EXCLUDED.criterion_name,
             points = EXCLUDED.points,
             description = EXCLUDED.description,
             sort_order = EXCLUDED.sort_order,
             updated_at = CURRENT_TIMESTAMP`,
          [c.id, c.criterion_name, parseInt(c.points, 10), c.description || '', c.sort_order || 0]
        );
      }
      await client.query('COMMIT');
      res.json({ message: 'Criteria saved.' });
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    console.error('saveDocumentationCriteria error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
}

async function getBatchDailyDocSummary(req, res) {
  try {
    await ensureDocumentationTables();
    const { batchId } = req.params;
    const result = await pool.query(
      `SELECT s.id as student_id, s.first_name, s.last_name, s.student_number, s.grade_level, s.track_strand, u.email,
              COUNT(sdd.id) as total_docs,
              COUNT(CASE WHEN sdd.status = 'graded' THEN 1 END) as graded_count,
              COUNT(CASE WHEN sdd.status = 'pending' OR sdd.status = 'submitted' THEN 1 END) as pending_count,
              COALESCE(SUM(sdd.teacher_score), 0) as total_score
       FROM teacher_batch_students tbs
       JOIN students s ON s.id = tbs.student_id
       JOIN users u ON u.id = s.user_id
       LEFT JOIN student_daily_documentation sdd ON sdd.student_id = s.id AND sdd.teacher_batch_id = tbs.teacher_batch_id
       WHERE tbs.teacher_batch_id = $1
       GROUP BY s.id, s.first_name, s.last_name, s.student_number, s.grade_level, s.track_strand, u.email
       ORDER BY s.last_name ASC, s.first_name ASC`,
      [batchId]
    );
    res.json({ students: result.rows });
  } catch (err) {
    console.error('getBatchDailyDocSummary error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
}

module.exports = {
  ensureDocumentationTables,
  getStudentDailyDocs,
  submitDailyDoc,
  gradeDailyDoc,
  getDocumentationCriteria,
  saveDocumentationCriteria,
  getBatchDailyDocSummary,
};
