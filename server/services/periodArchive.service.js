// Period archive service: snapshot a completed immersion period and delete
// its associated data from the live tables. All work is done in a single
// transaction so the live data and archive snapshot stay consistent.
const pool = require('../db');

function safeJSON(value) {
  return value == null ? null : JSON.stringify(value);
}

async function loadPeriod(periodId, client) {
  const db = client || pool;
  const r = await db.query(
    `SELECT id, period_name, academic_year, semester, start_date, end_date, status
     FROM immersion_periods WHERE id = $1`,
    [periodId]
  );
  return r.rows[0] || null;
}

async function loadUsersForPeriod(periodId, role, client) {
  const db = client || pool;
  const r = await db.query(
    `SELECT DISTINCT u.id, u.email, u.role, u.status, u.phone, u.created_at, u.updated_at,
            s.id AS student_pk, s.student_number, s.first_name, s.middle_name, s.last_name,
            s.suffix, s.gender, s.birthdate, s.age, s.contact_number, s.email AS student_email,
            s.home_address, s.grade_level, s.section, s.track_strand, s.school,
            s.preferred_industry, s.preferred_company, s.career_goal, s.industry_reason,
            s.guardian_name, s.guardian_relationship, s.guardian_contact, s.guardian_email,
            s.guardian_address, s.emergency_contact, s.emergency_contact_number,
            s.academic_notes, s.photo_url,
            t.id AS teacher_pk, t.first_name AS t_first_name, t.last_name AS t_last_name,
            t.employee_id AS t_employee_id, t.department AS t_department,
            t.designation AS t_designation, t.school AS t_school,
            sup.id AS supervisor_pk, sup.first_name AS sup_first_name, sup.last_name AS sup_last_name,
            sup.employee_id AS sup_employee_id, sup.company_name, sup.designation AS sup_designation,
            sup.department AS sup_department, sup.company_address,
            c.id AS coordinator_pk, c.first_name AS c_first_name, c.last_name AS c_last_name,
            c.employee_id AS c_employee_id, c.department AS c_department,
            c.designation AS c_designation, c.school AS c_school
     FROM users u
     LEFT JOIN students s ON s.user_id = u.id AND u.role = 'student'
     LEFT JOIN teachers t ON t.user_id = u.id AND u.role = 'teacher'
     LEFT JOIN supervisors sup ON sup.user_id = u.id AND u.role = 'supervisor'
     LEFT JOIN coordinators c ON c.user_id = u.id AND u.role = 'coordinator'
     LEFT JOIN teacher_batches tb
       ON tb.immersion_period_id = $1
      AND (
            (u.role = 'teacher' AND tb.teacher_id = t.id) OR
            (u.role = 'supervisor' AND tb.supervisor_id = sup.id) OR
            (u.role = 'coordinator' AND tb.coordinator_id = c.id)
          )
     LEFT JOIN teacher_batch_students tbs2 ON tbs2.teacher_batch_id = tb.id
     LEFT JOIN students s2 ON s2.id = tbs2.student_id
     WHERE u.role = $2
       AND (
         u.immersion_period_id = $1
         OR (u.role = 'teacher' AND tb.id IS NOT NULL)
         OR (u.role = 'supervisor' AND tb.id IS NOT NULL)
         OR (u.role = 'coordinator' AND tb.id IS NOT NULL)
         OR (u.role = 'student' AND s2.user_id = u.id)
       )`,
    [periodId, role]
  );
  return r.rows;
}

async function loadBatchesForPeriod(periodId, client) {
  const db = client || pool;
  const r = await db.query(
    `SELECT tb.id, tb.batch_label, tb.max_students, tb.created_at,
            t.user_id AS teacher_user_id, t.first_name AS t_first, t.last_name AS t_last,
            sup.user_id AS supervisor_user_id, sup.first_name AS sup_first, sup.last_name AS sup_last,
            c.user_id AS coordinator_user_id, c.first_name AS c_first, c.last_name AS c_last
     FROM teacher_batches tb
     LEFT JOIN teachers t ON t.id = tb.teacher_id
     LEFT JOIN coordinators c ON c.id = tb.coordinator_id
     LEFT JOIN supervisors sup ON sup.id = tb.supervisor_id
     WHERE tb.immersion_period_id = $1`,
    [periodId]
  );
  return r.rows;
}

function profileFor(role, row) {
  if (role === 'student') {
    return {
      student_pk: row.student_pk,
      student_number: row.student_number,
      first_name: row.first_name,
      middle_name: row.middle_name,
      last_name: row.last_name,
      suffix: row.suffix,
      gender: row.gender,
      birthdate: row.birthdate,
      age: row.age,
      contact_number: row.contact_number,
      email: row.student_email,
      home_address: row.home_address,
      grade_level: row.grade_level,
      section: row.section,
      track_strand: row.track_strand,
      school: row.school,
      preferred_industry: row.preferred_industry,
      preferred_company: row.preferred_company,
      career_goal: row.career_goal,
      industry_reason: row.industry_reason,
      guardian_name: row.guardian_name,
      guardian_relationship: row.guardian_relationship,
      guardian_contact: row.guardian_contact,
      guardian_email: row.guardian_email,
      guardian_address: row.guardian_address,
      emergency_contact: row.emergency_contact,
      emergency_contact_number: row.emergency_contact_number,
      academic_notes: row.academic_notes,
      photo_url: row.photo_url,
    };
  }
  if (role === 'teacher') {
    return {
      teacher_pk: row.teacher_pk,
      first_name: row.t_first_name,
      last_name: row.t_last_name,
      employee_id: row.t_employee_id,
      department: row.t_department,
      designation: row.t_designation,
      school: row.t_school,
    };
  }
  if (role === 'supervisor') {
    return {
      supervisor_pk: row.supervisor_pk,
      first_name: row.sup_first_name,
      last_name: row.sup_last_name,
      employee_id: row.sup_employee_id,
      company_name: row.company_name,
      designation: row.sup_designation,
      department: row.sup_department,
      company_address: row.company_address,
    };
  }
  if (role === 'coordinator') {
    return {
      coordinator_pk: row.coordinator_pk,
      first_name: row.c_first_name,
      last_name: row.c_last_name,
      employee_id: row.c_employee_id,
      department: row.c_department,
      designation: row.c_designation,
      school: row.c_school,
    };
  }
  return {};
}

async function archivePeriod(periodId, archivedBy) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const period = await loadPeriod(periodId, client);
    if (!period) {
      throw new Error('Immersion period not found.');
    }

    const existing = await client.query(
      'SELECT id FROM archive_periods WHERE immersion_period_id = $1',
      [periodId]
    );
    if (existing.rows.length) {
      throw new Error('This period has already been archived.');
    }

    const students = await loadUsersForPeriod(periodId, 'student', client);
    const teachers = await loadUsersForPeriod(periodId, 'teacher', client);
    const supervisors = await loadUsersForPeriod(periodId, 'supervisor', client);
    const coordinators = await loadUsersForPeriod(periodId, 'coordinator', client);

    const studentUserIds = students.map((s) => s.id);
    const studentPks = students.map((s) => s.student_pk).filter(Boolean);
    const batches = await loadBatchesForPeriod(periodId, client);
    const batchIds = batches.map((b) => b.id);

    const allUserIds = [
      ...studentUserIds,
      ...teachers.map((t) => t.id),
      ...supervisors.map((s) => s.id),
      ...coordinators.map((c) => c.id),
    ];

    const archiveRes = await client.query(
      `INSERT INTO archive_periods
        (immersion_period_id, period_name, academic_year, semester, start_date, end_date,
         student_count, teacher_count, supervisor_count, coordinator_count, batch_count,
         attendance_record_count, archived_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
       RETURNING id`,
      [
        period.id, period.period_name, period.academic_year, period.semester,
        period.start_date, period.end_date,
        students.length, teachers.length, supervisors.length, coordinators.length,
        batches.length, 0, archivedBy || null,
      ]
    );
    const archiveId = archiveRes.rows[0].id;

    for (const role of ['student', 'teacher', 'supervisor', 'coordinator']) {
      const list = role === 'student' ? students
        : role === 'teacher' ? teachers
        : role === 'supervisor' ? supervisors
        : coordinators;
      for (const row of list) {
        await client.query(
          `INSERT INTO archive_users
            (archive_period_id, original_user_id, email, role, status, phone, profile, created_at, updated_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9)`,
          [
            archiveId, row.id, row.email, row.role, row.status, row.phone,
            safeJSON(profileFor(role, row)), row.created_at, row.updated_at,
          ]
        );
      }
    }

    let attendanceTotal = 0;
    for (const batch of batches) {
      const [attCfg, schedRows, attRows, appealRows, gpsRows, docRows, fileRows, evalRows, certRows, tbsRows] = await Promise.all([
        client.query(
          `SELECT time_in_open, time_in_close, time_out_open, time_out_close, timezone, manual_open
           FROM attendance_config WHERE teacher_batch_id = $1`,
          [batch.id]
        ).then((r) => r.rows[0] || null),
        client.query(
          `SELECT id, supervisor_id, duration_type, duration_value, start_date, end_date, created_at
           FROM work_immersion_schedules WHERE teacher_batch_id = $1`,
          [batch.id]
        ).then((r) => r.rows),
        client.query(
          `SELECT sa.* FROM student_attendance sa
           WHERE sa.teacher_batch_id = $1`,
          [batch.id]
        ).then((r) => r.rows),
        client.query(
          `SELECT a.* FROM attendance_appeals a
           WHERE a.teacher_batch_id = $1`,
          [batch.id]
        ).then((r) => r.rows),
        client.query(
          `SELECT g.* FROM gps_logs g
           WHERE g.teacher_batch_id = $1`,
          [batch.id]
        ).then((r) => r.rows),
        client.query(
          `SELECT d.* FROM student_daily_documentation d
           WHERE d.teacher_batch_id = $1`,
          [batch.id]
        ).then((r) => r.rows),
        client.query(
          `SELECT sd.* FROM student_documents sd
           WHERE sd.student_id = ANY($1::int[])`,
          [studentPks]
        ).then((r) => r.rows),
        client.query(
          `SELECT e.* FROM student_evaluations e
           WHERE e.batch_id = $1 OR e.student_id = ANY($2::int[])`,
          [batch.id, studentPks]
        ).then((r) => r.rows),
        client.query(
          `SELECT c.* FROM certificates c
           WHERE c.student_id = ANY($1::int[])`,
          [studentPks]
        ).then((r) => r.rows),
        client.query(
          `SELECT tbs.*, s.student_number, s.first_name, s.last_name, u.email AS user_email
           FROM teacher_batch_students tbs
           JOIN students s ON s.id = tbs.student_id
           JOIN users u ON u.id = s.user_id
           WHERE tbs.teacher_batch_id = $1`,
          [batch.id]
        ).then((r) => r.rows),
      ]);

      attendanceTotal += attRows.length;

      await client.query(
        `INSERT INTO archive_teacher_batches
          (archive_period_id, original_batch_id, batch_label, max_students,
           teacher_user_id, teacher_name, supervisor_user_id, supervisor_name,
           coordinator_user_id, coordinator_name,
           attendance_config, work_immersion_schedule, students,
           attendance_records, attendance_appeals, gps_logs,
           daily_documentation, student_documents, evaluations, certificates,
           created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,$12::jsonb,$13::jsonb,
                 $14::jsonb,$15::jsonb,$16::jsonb,$17::jsonb,$18::jsonb,$19::jsonb,$20::jsonb,$21)`,
        [
          archiveId, batch.id, batch.batch_label, batch.max_students,
          batch.teacher_user_id,
          [batch.t_first, batch.t_last].filter(Boolean).join(' '),
          batch.supervisor_user_id,
          [batch.sup_first, batch.sup_last].filter(Boolean).join(' '),
          batch.coordinator_user_id,
          [batch.c_first, batch.c_last].filter(Boolean).join(' '),
          safeJSON(attCfg),
          safeJSON(schedRows),
          safeJSON(tbsRows),
          safeJSON(attRows),
          safeJSON(appealRows),
          safeJSON(gpsRows),
          safeJSON(docRows),
          safeJSON(fileRows),
          safeJSON(evalRows),
          safeJSON(certRows),
          batch.created_at,
        ]
      );
    }

    const deploymentsRes = await client.query(
      `SELECT dr.id, dr.batch_label, dr.strand, dr.num_students, dr.notes, dr.direction,
              dr.status, dr.responded_at, dr.created_at,
              cu.email AS coordinator_email, cu.role AS coordinator_role,
              su.email AS supervisor_email
       FROM deployment_requests dr
       JOIN users cu ON cu.id = dr.coordinator_id
       JOIN users su ON su.id = dr.supervisor_id
       WHERE cu.immersion_period_id = $1`,
      [periodId]
    );

    for (const dr of deploymentsRes.rows) {
      const studentsRes = await client.query(
        `SELECT drs.student_id, u.email, s.first_name, s.last_name
         FROM deployment_request_students drs
         LEFT JOIN users u ON u.id = drs.student_id
         LEFT JOIN students s ON s.user_id = u.id
         WHERE drs.deployment_request_id = $1`,
        [dr.id]
      );
      const coordName = await client.query(
        `SELECT first_name, last_name FROM coordinators WHERE user_id = $1`,
        [dr.coordinator_id]
      );
      const supName = await client.query(
        `SELECT first_name, last_name FROM supervisors WHERE user_id = $1`,
        [dr.supervisor_id]
      );
      const cName = coordName.rows[0]
        ? `${coordName.rows[0].first_name} ${coordName.rows[0].last_name}`.trim()
        : dr.coordinator_email;
      const sName = supName.rows[0]
        ? `${supName.rows[0].first_name} ${supName.rows[0].last_name}`.trim()
        : dr.supervisor_email;

      await client.query(
        `INSERT INTO archive_deployment_requests
          (archive_period_id, original_request_id, batch_label, strand, num_students,
           notes, direction, status, coordinator_name, supervisor_name,
           student_names, responded_at, created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,$12,$13)`,
        [
          archiveId, dr.id, dr.batch_label, dr.strand, dr.num_students,
          dr.notes, dr.direction, dr.status, cName, sName,
          safeJSON(studentsRes.rows), dr.responded_at, dr.created_at,
        ]
      );
    }

    await client.query(
      `UPDATE archive_periods SET attendance_record_count = $1 WHERE id = $2`,
      [attendanceTotal, archiveId]
    );

    if (batchIds.length) {
      await client.query(`DELETE FROM attendance_config WHERE teacher_batch_id = ANY($1::int[])`, [batchIds]);
    }
    if (studentPks.length) {
      await client.query(
        `DELETE FROM student_requirement_submissions WHERE student_id = ANY($1::int[])`,
        [studentPks]
      );
      await client.query(
        `DELETE FROM student_documents WHERE student_id = ANY($1::int[])`,
        [studentPks]
      );
      await client.query(
        `DELETE FROM files WHERE student_id = ANY($1::int[])`,
        [studentPks]
      );
      await client.query(
        `DELETE FROM student_daily_documentation WHERE student_id = ANY($1::int[])`,
        [studentPks]
      );
      await client.query(
        `DELETE FROM certificates WHERE student_id = ANY($1::int[])`,
        [studentPks]
      );
      await client.query(
        `DELETE FROM student_evaluations WHERE student_id = ANY($1::int[]) OR batch_id = ANY($2::int[])`,
        [studentPks, batchIds]
      );
    }

    if (allUserIds.length) {
      await client.query(
        `DELETE FROM feed_likes WHERE user_id = ANY($1::int[])`,
        [allUserIds]
      );
      await client.query(
        `DELETE FROM feed_survey_responses WHERE user_id = ANY($1::int[])`,
        [allUserIds]
      );
      await client.query(
        `DELETE FROM feed_comments WHERE user_id = ANY($1::int[])`,
        [allUserIds]
      );
      await client.query(
        `DELETE FROM feed_posts WHERE author_id = ANY($1::int[])`,
        [allUserIds]
      );
    }

    if (studentUserIds.length) {
      await client.query(
        `DELETE FROM deployment_request_students WHERE student_id = ANY($1::int[])`,
        [studentUserIds]
      );
    }
    await client.query(
      `DELETE FROM deployment_requests
       WHERE coordinator_id = ANY($1::int[]) OR supervisor_id = ANY($1::int[])`,
      [allUserIds]
    );

    await client.query(
      `DELETE FROM attendance_appeals
       WHERE student_id = ANY($1::int[]) OR teacher_id = ANY($1::int[])`,
      [allUserIds]
    );
    await client.query(
      `DELETE FROM gps_logs WHERE student_id = ANY($1::int[])`,
      [studentUserIds]
    );
    await client.query(
      `DELETE FROM student_locations WHERE student_id = ANY($1::int[])`,
      [studentUserIds]
    );
    await client.query(
      `DELETE FROM student_attendance WHERE student_id = ANY($1::int[])`,
      [studentUserIds]
    );

    if (studentPks.length) {
      await client.query(`DELETE FROM students WHERE id = ANY($1::int[])`, [studentPks]);
    }
    const teacherPks = teachers.map((t) => t.teacher_pk).filter(Boolean);
    const supervisorPks = supervisors.map((s) => s.supervisor_pk).filter(Boolean);
    const coordinatorPks = coordinators.map((c) => c.coordinator_pk).filter(Boolean);
    if (teacherPks.length) {
      await client.query(`DELETE FROM teachers WHERE id = ANY($1::int[])`, [teacherPks]);
    }
    if (supervisorPks.length) {
      await client.query(`DELETE FROM supervisors WHERE id = ANY($1::int[])`, [supervisorPks]);
    }
    if (coordinatorPks.length) {
      await client.query(`DELETE FROM coordinators WHERE id = ANY($1::int[])`, [coordinatorPks]);
    }

    await client.query(`DELETE FROM users WHERE id = ANY($1::int[])`, [allUserIds]);

    await client.query(
      `DELETE FROM teacher_batches WHERE id = ANY($1::int[])`,
      [batchIds]
    );

    await client.query(
      `DELETE FROM immersion_periods WHERE id = $1`,
      [periodId]
    );

    await client.query('COMMIT');
    return { archiveId, period };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

async function listArchivePeriods() {
  const r = await pool.query(
    `SELECT * FROM archive_periods ORDER BY archived_at DESC`
  );
  return r.rows;
}

async function getArchivePeriod(archiveId) {
  const periodRes = await pool.query(
    `SELECT * FROM archive_periods WHERE id = $1`,
    [archiveId]
  );
  const period = periodRes.rows[0];
  if (!period) return null;

  const [users, batches, deployments] = await Promise.all([
    pool.query(
      `SELECT id, original_user_id, email, role, status, phone, profile, created_at, updated_at
       FROM archive_users WHERE archive_period_id = $1
       ORDER BY role, email`,
      [archiveId]
    ).then((r) => r.rows),
    pool.query(
      `SELECT * FROM archive_teacher_batches WHERE archive_period_id = $1
       ORDER BY batch_label`,
      [archiveId]
    ).then((r) => r.rows),
    pool.query(
      `SELECT * FROM archive_deployment_requests WHERE archive_period_id = $1
       ORDER BY created_at DESC`,
      [archiveId]
    ).then((r) => r.rows),
  ]);

  return { ...period, users, batches, deployments };
}

async function previewPeriodArchive(periodId) {
  const period = await loadPeriod(periodId);
  if (!period) return null;

  const [studentCount, teacherCount, supervisorCount, coordinatorCount, batchCount] = await Promise.all([
    pool.query(
      `SELECT COUNT(DISTINCT u.id)::int AS c
       FROM users u
       LEFT JOIN students s ON s.user_id = u.id
       LEFT JOIN teacher_batches tb ON tb.immersion_period_id = $1
       LEFT JOIN teacher_batch_students tbs ON tbs.teacher_batch_id = tb.id AND tbs.student_id = s.id
       WHERE u.role = 'student'
         AND (u.immersion_period_id = $1 OR tbs.id IS NOT NULL)`,
      [periodId]
    ).then((r) => r.rows[0].c),
    pool.query(
      `SELECT COUNT(DISTINCT u.id)::int AS c
       FROM users u
       JOIN teachers t ON t.user_id = u.id
       LEFT JOIN teacher_batches tb ON tb.immersion_period_id = $1 AND tb.teacher_id = t.id
       WHERE u.role = 'teacher' AND (u.immersion_period_id = $1 OR tb.id IS NOT NULL)`,
      [periodId]
    ).then((r) => r.rows[0].c),
    pool.query(
      `SELECT COUNT(DISTINCT u.id)::int AS c
       FROM users u
       JOIN supervisors sup ON sup.user_id = u.id
       LEFT JOIN teacher_batches tb ON tb.immersion_period_id = $1 AND tb.supervisor_id = sup.id
       WHERE u.role = 'supervisor' AND (u.immersion_period_id = $1 OR tb.id IS NOT NULL)`,
      [periodId]
    ).then((r) => r.rows[0].c),
    pool.query(
      `SELECT COUNT(DISTINCT u.id)::int AS c
       FROM users u
       JOIN coordinators c ON c.user_id = u.id
       LEFT JOIN teacher_batches tb ON tb.immersion_period_id = $1 AND tb.coordinator_id = c.id
       WHERE u.role = 'coordinator' AND (u.immersion_period_id = $1 OR tb.id IS NOT NULL)`,
      [periodId]
    ).then((r) => r.rows[0].c),
    pool.query(`SELECT COUNT(*)::int AS c FROM teacher_batches WHERE immersion_period_id = $1`, [periodId]).then((r) => r.rows[0].c),
  ]);

  const already = await pool.query(
    `SELECT id, archived_at FROM archive_periods WHERE immersion_period_id = $1`,
    [periodId]
  );

  return {
    period,
    counts: {
      students: studentCount,
      teachers: teacherCount,
      supervisors: supervisorCount,
      coordinators: coordinatorCount,
      batches: batchCount,
    },
    alreadyArchived: already.rows[0] || null,
  };
}

module.exports = {
  archivePeriod,
  listArchivePeriods,
  getArchivePeriod,
  previewPeriodArchive,
};
