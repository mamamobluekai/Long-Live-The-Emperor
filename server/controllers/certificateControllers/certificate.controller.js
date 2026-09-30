const PDFDocument = require('pdfkit');
const cloudinary = require('../../db/cloudinary');
const streamifier = require('streamifier');
const pool = require('../../db');
const { createNotification } = require('../../services/notification.service');

async function uploadPdfToCloudinary(buffer, publicId) {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        resource_type: 'raw',
        folder: 'certificates',
        public_id: publicId,
        format: 'pdf',
      },
      (err, result) => (err ? reject(err) : resolve(result))
    );
    streamifier.createReadStream(buffer).pipe(stream);
  });
}

function cloudinaryDownloadUrl(secureUrl) {
  if (!secureUrl) return secureUrl;
  return secureUrl.replace('/upload/', '/upload/fl_attachment/');
}

/**
 * Hex + alpha -> rgba(), so the accent colour can be tinted for rules, panels
 * and seals without asking the user for extra colours.
 */
function tint(hex, alpha) {
  const m = String(hex || '#8b1e2d').trim().replace('#', '');
  const full = m.length === 3 ? m.split('').map((c) => c + c).join('') : m;
  const n = parseInt(full.slice(0, 6), 16);
  if (Number.isNaN(n)) return `rgba(139,30,45,${alpha})`;
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`;
}

/** Muted body ink derived from the accent, so the whole sheet stays cohesive. */
function inkFor(hex, mix = 0) {
  const m = String(hex || '#8b1e2d').trim().replace('#', '');
  const full = m.length === 3 ? m.split('').map((c) => c + c).join('') : m;
  const n = parseInt(full.slice(0, 6), 16);
  if (Number.isNaN(n)) return '#1c1f2b';
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  // mix 0 = near-black ink, 1 = full accent
  const to = (c, t) => Math.round(c + (t - c) * mix);
  return `#${[to(r, 255), to(g, 255), to(b, 255)]
    .map((c) => c.toString(16).padStart(2, '0'))
    .join('')}`;
}

/**
 * Display name for the issuing supervisor, preferring their real name over the
 * email that was previously printed on the signature line and meta row.
 */
async function getIssuerDisplayName(db, userId, fallback = '') {
  if (!userId) return fallback || 'Administrator';
  const res = await db.query(
    `SELECT first_name, middle_name, last_name, suffix, email FROM users WHERE id = $1 LIMIT 1`,
    [userId]
  );
  const row = res.rows[0];
  if (!row) return fallback || 'Administrator';
  const name = [row.first_name, row.middle_name, row.last_name, row.suffix]
    .map((p) => (p == null ? '' : String(p).trim()))
    .filter(Boolean)
    .join(' ');
  return name || row.email || fallback || 'Administrator';
}

function buildCertificatePdf(student, issuedBy, template = {}) {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 0 });
      const chunks = [];
      doc.on('data', (chunk) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      const W = doc.page.width;
      const H = doc.page.height;

      const schoolName = template.school_name || 'Work Immersion Program';
      const companyName = template.company_name || 'Host Company';
      const programName = template.program_name || 'Work Immersion';
      const footerText =
        template.footer_text ||
        'Verify this certificate at the issuing institution. This is an official record of work immersion completion.';
      const accent = template.border_color || '#8b1e2d';
      const titleText = template.title_text || 'CERTIFICATE OF COMPLETION';
      const studentName = buildFullName(student);

      // --- Palette -----------------------------------------------------
      const INK = inkFor(accent, 0.12); // near-black, slightly cooled
      const BODY = inkFor(accent, 0.34); // soft body text
      const MUTED = inkFor(accent, 0.55); // captions
      const PAPER = '#fffdf9';

      // --- Ground ------------------------------------------------------
      doc.rect(0, 0, W, H).fill(PAPER);

      // A very light accent wash in the corners gives the sheet depth without
      // printing as a heavy block of colour.
      doc.save().opacity(0.05).fillColor(accent);
      doc.circle(0, 0, 300).fill();
      doc.circle(W, H, 300).fill();
      doc.restore();

      // --- Frame: outer rule, gap, inner rule ---------------------------
      const M = 34; // outer margin
      doc.lineWidth(2.6).strokeColor(accent).rect(M, M, W - M * 2, H - M * 2).stroke();
      doc.lineWidth(0.7).strokeColor(tint(accent, 0.55)).rect(M + 6, M + 6, W - (M + 6) * 2, H - (M + 6) * 2).stroke();
      doc.lineWidth(0.5).strokeColor(tint(accent, 0.3))
        .rect(M + 12, M + 12, W - (M + 12) * 2, H - (M + 12) * 2).stroke();

      // Corner flourishes: a long rule, a short inner rule, a dot, and a curl.
      const drawCorner = (x, y, sx, sy) => {
        doc.save();
        doc.strokeColor(accent).lineWidth(1.4);
        doc.moveTo(x, y).lineTo(x + sx * 54, y).stroke();
        doc.moveTo(x, y).lineTo(x, y + sy * 54).stroke();
        doc.lineWidth(0.6).strokeColor(tint(accent, 0.6));
        doc.moveTo(x + sx * 38, y + sy * 8).lineTo(x + sx * 8, y + sy * 38).stroke();
        doc.circle(x + sx * 4, y + sy * 4, 2.6).fill(accent);
        doc.circle(x + sx * 4, y + sy * 4, 5.2).lineWidth(0.6).strokeColor(tint(accent, 0.5)).stroke();
        doc.restore();
      };
      const cx = M + 26;
      const cy = M + 26;
      drawCorner(cx, cy, 1, 1);
      drawCorner(W - cx, cy, -1, 1);
      drawCorner(cx, H - cy, 1, -1);
      drawCorner(W - cx, H - cy, -1, -1);

      // --- Vertical rhythm ---------------------------------------------
      // Positions are laid out from the frame edges inward rather than chained
      // from one another, so the seal / signature / footer block cannot drift
      // into the body text when a name wraps or the title grows.
      const footRuleY = H - M - 48;
      const footTextY = H - M - 38;
      const metaY = H - M - 80;
      const sigLabelY = H - M - 128;
      const sigRuleY = H - M - 116;
      const sealCy = sigRuleY - 90;
      const sealR = 34;
      // Body copy must clear the top of the seal ribbon.
      const bodyLimit = sealCy - 60;

      // --- Eyebrow: issuer ---------------------------------------------
      const innerW = W - (M + 44) * 2;
      doc.font('Times-Italic').fontSize(10.5).fillColor(MUTED)
        .text(schoolName.toUpperCase(), M + 44, M + 32, { width: innerW, align: 'center', characterSpacing: 2.4 });

      // Small tick under the issuer, echoing the corner dots.
      const tickY = M + 52;
      doc.strokeColor(tint(accent, 0.45)).lineWidth(0.7)
        .moveTo(W / 2 - 26, tickY).lineTo(W / 2 - 6, tickY)
        .moveTo(W / 2 + 6, tickY).lineTo(W / 2 + 26, tickY)
        .stroke();
      doc.save().translate(W / 2, tickY).rotate(45).rect(-2.2, -2.2, 4.4, 4.4).fill(accent).restore();

      // --- Title --------------------------------------------------------
      const titleY = M + 66;
      doc.font('Times-Bold').fontSize(30).fillColor(INK)
        .text(titleText, M + 40, titleY, { width: W - (M + 40) * 2, align: 'center', characterSpacing: 3.2 });

      // Ornamental rule: long line, diamond, long line.
      const ruleY = titleY + 40;
      const half = 150;
      doc.strokeColor(tint(accent, 0.4)).lineWidth(0.9)
        .moveTo(W / 2 - half - 14, ruleY).lineTo(W / 2 - 12, ruleY)
        .moveTo(W / 2 + 12, ruleY).lineTo(W / 2 + half + 14, ruleY)
        .stroke();
      doc.save().translate(W / 2, ruleY).rotate(45).rect(-4, -4, 8, 8).lineWidth(1.2).strokeColor(accent).stroke().restore();
      doc.circle(W / 2, ruleY, 8.5).lineWidth(0.6).strokeColor(tint(accent, 0.4)).stroke();

      // --- Award block --------------------------------------------------
      const certifyY = ruleY + 22;
      doc.font('Times-Italic').fontSize(13).fillColor(BODY)
        .text('This is to certify that', M + 60, certifyY, { width: W - (M + 60) * 2, align: 'center' });

      const nameY = certifyY + 22;
      const nameSize = studentName.length > 30 ? 28 : studentName.length > 20 ? 32 : 36;
      doc.font('Times-BoldItalic').fontSize(nameSize).fillColor(INK)
        .text(studentName, M + 90, nameY, { width: W - (M + 90) * 2, align: 'center' });

      // Name underline: a solid rule with a shorter, lighter rule beneath it.
      const nameRuleY = nameY + nameSize + 8;
      const nameRuleW = Math.min(340, W * 0.34);
      doc.strokeColor(accent).lineWidth(1.1)
        .moveTo(W / 2 - nameRuleW / 2, nameRuleY).lineTo(W / 2 + nameRuleW / 2, nameRuleY).stroke();
      doc.strokeColor(tint(accent, 0.4)).lineWidth(0.6)
        .moveTo(W / 2 - nameRuleW / 2 + 18, nameRuleY + 5).lineTo(W / 2 + nameRuleW / 2 - 18, nameRuleY + 5).stroke();

      // Keep the closing sentence on one comfortable block above the seal.
      const bodyY = Math.min(nameRuleY + 24, bodyLimit - 34);
      doc.font('Times-Roman').fontSize(12.5).fillColor(BODY)
        .text(
          `has successfully completed the ${programName} at ${companyName}, ` +
            'having fulfilled all required hours, daily documentation, and evaluation standards.',
          M + 130,
          bodyY,
          { align: 'center', width: W - (M + 130) * 2, lineGap: 5 }
        );

      // --- Seal ---------------------------------------------------------
      // Ribbon tails first so the disc overlaps them.
      doc.save();
      doc.fillColor(tint(accent, 0.75));
      doc.moveTo(W / 2 - 15, sealCy + 20).lineTo(W / 2 - 4, sealCy + 50).lineTo(W / 2 + 6, sealCy + 38).lineTo(W / 2 + 15, sealCy + 20).closePath().fill();
      doc.fillColor(tint(accent, 0.55));
      doc.moveTo(W / 2 + 15, sealCy + 20).lineTo(W / 2 + 4, sealCy + 50).lineTo(W / 2 - 6, sealCy + 38).lineTo(W / 2 - 15, sealCy + 20).closePath().fill();
      doc.restore();

      doc.circle(W / 2, sealCy, sealR).lineWidth(1.6).strokeColor(accent).stroke();
      doc.circle(W / 2, sealCy, sealR - 6).lineWidth(0.7).strokeColor(tint(accent, 0.55)).stroke();
      doc.circle(W / 2, sealCy, sealR - 10).lineWidth(0.5)
        .dash(1.6, { space: 2.2 }).strokeColor(tint(accent, 0.45)).stroke();
      doc.undash();
      // Star + laurel ticks around the inner ring.
      doc.save().translate(W / 2, sealCy - 3);
      doc.path('M0 -9 L2.7 -2.9 L9.2 -2.3 L4.2 2 L5.8 8.4 L0 4.8 L-5.8 8.4 L-4.2 2 L-9.2 -2.3 L-2.7 -2.9 Z')
        .fill(accent);
      doc.restore();
      for (let i = 0; i < 8; i += 1) {
        const a = (Math.PI * 2 * i) / 8 + Math.PI / 8;
        doc.circle(W / 2 + Math.cos(a) * (sealR - 16), sealCy + Math.sin(a) * (sealR - 16), 1.1)
          .fill(tint(accent, 0.6));
      }
      doc.font('Helvetica').fontSize(5.6).fillColor(MUTED)
        .text('VERIFIED', W / 2 - 30, sealCy + 10, { width: 60, align: 'center', characterSpacing: 1.6 });

      // --- Signatures ---------------------------------------------------
      // Real names are printed above each rule: the supervisor on the left, the
      // host company on the right. The two blocks are laid out symmetrically
      // about the page centre so the sheet reads balanced.
      const sigW = 200;
      const sigGap = 60;
      const sigSpan = sigW * 2 + sigGap;
      const sigLeft = W / 2 - sigSpan / 2;
      const rightX = sigLeft + sigW + sigGap;
      const drawSignature = (x, signer, role) => {
        // Signer name sits in the space the signature would occupy.
        doc.font('Times-Italic').fontSize(11.5).fillColor(INK)
          .text(signer || '', x, sigLabelY - 20, { width: sigW, align: 'center' });
        doc.strokeColor(tint(accent, 0.5)).lineWidth(0.9)
          .moveTo(x, sigRuleY).lineTo(x + sigW, sigRuleY).stroke();
        // Accent tick at the start of the rule.
        doc.strokeColor(accent).lineWidth(1.4)
          .moveTo(x, sigRuleY).lineTo(x, sigRuleY - 6).stroke();
        doc.font('Times-Roman').fontSize(9).fillColor(MUTED)
          .text(role, x, sigLabelY, { width: sigW, align: 'center', characterSpacing: 0.8 });
      };
      drawSignature(sigLeft, issuedBy || schoolName, 'Work Immersion Supervisor');
      drawSignature(rightX, companyName, 'Company Representative');

      // --- Meta row -----------------------------------------------------
      // Three equal columns so the middle value is truly centred rather than
      // merely being the middle child of a justify-between row.
      const dateText = student.completion_date
        ? new Date(student.completion_date).toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
          })
        : '';
      const colW = (W - (M + 60) * 2) / 3;
      const metaLeft = M + 60;
      doc.font('Helvetica').fontSize(7.6).fillColor(MUTED);
      doc.text(`Issued by: ${issuedBy || schoolName || 'Administrator'}`, metaLeft, metaY, {
        width: colW,
        align: 'left',
        ellipsis: true,
        lineBreak: false,
      });
      doc.text(`Certificate No. ${student.certificate_number || ''}`, metaLeft + colW, metaY, {
        width: colW,
        align: 'center',
        ellipsis: true,
        lineBreak: false,
      });
      doc.text(dateText, metaLeft + colW * 2, metaY, {
        width: colW,
        align: 'right',
        ellipsis: true,
        lineBreak: false,
      });

      // --- Footer -------------------------------------------------------
      doc.strokeColor(tint(accent, 0.22)).lineWidth(0.6)
        .moveTo(M + 150, footRuleY).lineTo(W - M - 150, footRuleY).stroke();
      doc.font('Times-Italic').fontSize(8).fillColor(MUTED)
        .text(footerText, M + 120, footTextY, {
          align: 'center',
          width: W - (M + 120) * 2,
          lineGap: 2,
        });

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}

const getEligibleStudents = async (req, res) => {
  try {
    const showAll = String(req.query.all || '').toLowerCase() === 'true';

    const baseQuery = `
      WITH supervisor_batches AS (
        SELECT drs.student_id
        FROM deployment_requests dr
        JOIN deployment_request_students drs ON drs.deployment_request_id = dr.id
        WHERE dr.supervisor_id = $1
          AND dr.direction = 'coordinator_to_supervisor'
          AND dr.status = 'approved'
        UNION ALL
        SELECT tbs.student_id
        FROM teacher_batches tb
        JOIN teacher_batch_students tbs ON tbs.teacher_batch_id = tb.id
        WHERE tb.supervisor_id = $1
      )
      SELECT u.id AS user_id,
             s.id AS student_id,
             s.first_name,
             s.last_name,
             s.student_number,
             s.grade_level,
             s.track_strand,
             u.email,
             srs.status AS requirements_status,
             srs.submitted_at,
             cert.certificate_number,
             cert.cloudinary_url AS certificate_url
      FROM users u
      JOIN students s ON s.user_id = u.id
      JOIN student_requirement_submissions srs ON srs.user_id = u.id
      LEFT JOIN LATERAL (
        SELECT certificate_number, cloudinary_url
        FROM certificates c
        WHERE c.student_id = s.id
        ORDER BY c.created_at DESC
        LIMIT 1
      ) cert ON true
      WHERE u.role = 'student'
        AND s.user_id IN (SELECT student_id FROM supervisor_batches)`;

    if (!showAll) {
      const result = await pool.query(
        `${baseQuery}
         AND srs.status = 'Approved'
         AND (
           SELECT COUNT(*) FROM student_documents sd WHERE sd.student_id = s.id
         ) > 0
         AND (
           SELECT COUNT(*) FROM student_documents sd WHERE sd.student_id = s.id AND sd.status = 'Verified'
         ) = (
           SELECT COUNT(*) FROM student_documents sd WHERE sd.student_id = s.id
         )
         AND (
           SELECT COUNT(DISTINCT sa.date)::int
           FROM student_attendance sa
           WHERE sa.student_id = s.id
             AND sa.check_in_time IS NOT NULL
             AND sa.check_out_time IS NOT NULL
         ) >= 10
       ORDER BY s.last_name ASC, s.first_name ASC`,
        [req.user.id]
      );
      res.json({ eligible: result.rows });
      return;
    }

    const rows = await pool.query(
      `${baseQuery}
       ORDER BY s.last_name ASC, s.first_name ASC`,
      [req.user.id]
    );

    const enriched = await Promise.all(
      rows.rows.map(async (s) => {
        const attendanceResult = await pool.query(
          `SELECT COUNT(DISTINCT date)::int AS days
           FROM student_attendance
           WHERE student_id = $1 AND check_in_time IS NOT NULL AND check_out_time IS NOT NULL`,
          [s.student_id]
        );
        const docsResult = await pool.query(
          `SELECT COUNT(*)::int AS total, COUNT(*) FILTER (WHERE status='Verified')::int AS verified
           FROM student_documents
           WHERE student_id = $1`,
          [s.student_id]
        );
        const attendanceDays = attendanceResult.rows[0]?.days || 0;
        const totalDocs = docsResult.rows[0]?.total || 0;
        const verifiedDocs = docsResult.rows[0]?.verified || 0;
        const completed =
          s.requirements_status === 'Approved' && totalDocs > 0 && verifiedDocs === totalDocs && attendanceDays >= 10;
        return { ...s, attendance_days: attendanceDays, total_documents: totalDocs, verified_documents: verifiedDocs, completed };
      })
    );

    res.json({ eligible: enriched });
  } catch (err) {
    console.error('getEligibleStudents error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
};

const generateCertificate = async (req, res) => {
  const client = await pool.connect();
  try {
    const { studentId } = req.params;
    const supervisorUserId = req.user.id;
    await ensureBatchTemplateSchema(client);

    let studentResult;
    try {
      studentResult = await client.query(
        `SELECT u.id AS user_id, u.email, s.id AS student_id, s.first_name, s.middle_name,
                s.last_name, s.suffix, s.student_number,
                s.grade_level, s.track_strand, srs.status AS requirements_status
         FROM users u
         JOIN students s ON s.user_id = u.id
         JOIN student_requirement_submissions srs ON srs.user_id = u.id
         WHERE u.id = $1 AND u.role = 'student'
         LIMIT 1`,
        [studentId]
      );
    } catch (err) {
      client.release();
      return res.status(404).json({ error: 'Student not found.' });
    }
    if (!studentResult.rows.length) {
      client.release();
      return res.status(404).json({ error: 'Student not found.' });
    }
    const student = studentResult.rows[0];

    // The batch the student is in decides the design; the supervisor's own
    // default is only used when that batch has none.
    const teacherBatchId = await getStudentBatchId(client, student.student_id);
    const template = await resolveTemplate(client, supervisorUserId, teacherBatchId);

    const existing = await client.query(
      `SELECT id, certificate_number, cloudinary_url
       FROM certificates
       WHERE student_id = $1
       ORDER BY created_at DESC
       LIMIT 1`,
      [student.student_id]
    );
    if (existing.rows.length) {
      return res.json({
        message: 'Certificate already generated.',
        certificate: existing.rows[0],
        forced: String(existing.rows[0].certificate_number || '').startsWith('CERT-FORCE-'),
      });
    }

    const attendanceResult = await client.query(
      `SELECT COUNT(DISTINCT date)::int AS days
       FROM student_attendance
       WHERE student_id = $1 AND check_in_time IS NOT NULL AND check_out_time IS NOT NULL`,
      [student.student_id]
    );
    const attendanceDays = attendanceResult.rows[0]?.days || 0;

    const docsResult = await client.query(
      `SELECT COUNT(*)::int AS total, COUNT(*) FILTER (WHERE status='Verified')::int AS verified
       FROM student_documents
       WHERE student_id = $1`,
      [student.student_id]
    );
    const documentationGraded = docsResult.rows[0]?.verified === docsResult.rows[0]?.total && docsResult.rows[0].total > 0;

    if (student.requirements_status !== 'Approved' || !documentationGraded || attendanceDays < 10) {
      return res.status(400).json({ error: 'Student has not completed all milestones yet.' });
    }

    const certificateNumber = `CERT-${Date.now()}-${student.student_id}`;
    const completionDate = new Date().toISOString().slice(0, 10);
    const studentRecord = {
      ...student,
      full_name: buildFullName(student),
      attendance_days: attendanceDays,
      certificate_number: certificateNumber,
      completion_date: completionDate,
    };

    const issuerName = await getIssuerDisplayName(client, supervisorUserId, req.user?.email);
    const pdfBuffer = await buildCertificatePdf(studentRecord, issuerName, template);
    const publicId = certificateNumber;
    const uploadResult = await uploadPdfToCloudinary(pdfBuffer, publicId);

    const insert = await client.query(
      `INSERT INTO certificates (student_id, full_name, certificate_number, completion_date, requirements_status, documentation_status, attendance_days, issued_by, cloudinary_public_id, cloudinary_url, teacher_batch_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       RETURNING id, certificate_number, cloudinary_url`,
      [
        student.student_id,
        buildFullName(student),
        certificateNumber,
        completionDate,
        student.requirements_status,
        documentationGraded ? 'Graded' : 'Pending',
        attendanceDays,
        supervisorUserId,
        uploadResult.public_id,
        cloudinaryDownloadUrl(uploadResult.secure_url),
        teacherBatchId,
      ]
    );

    void createNotification({
      userId: student.user_id,
      title: 'Certificate available',
      message: 'Your work immersion certificate is now available for download.',
      type: 'certificate',
      category: 'certificate',
      priority: 'high',
      actionUrl: '/dashboard/student/progress',
      relatedUserId: supervisorUserId,
      entityType: 'certificate',
      entityId: insert.rows[0].id,
      eventKey: `certificate:${insert.rows[0].id}`,
    }).catch((err) => console.error('Certificate notification failed:', err.message));

    res.status(201).json({ certificate: insert.rows[0] });
  } catch (err) {
    console.error('generateCertificate error:', err);
    res.status(500).json({ error: 'Server error.' });
  } finally {
    client.release();
  }
};

const getMyCertificate = async (req, res) => {
  try {
    const studentRow = await pool.query(
      `SELECT id FROM students WHERE user_id = $1 LIMIT 1`,
      [req.user.id]
    );
    const studentId = studentRow.rows[0]?.id;
    if (!studentId) {
      return res.status(404).json({ error: 'Student profile not found.' });
    }

    const certificate = await pool.query(
      `SELECT id, certificate_number, full_name, completion_date, cloudinary_url
       FROM certificates
       WHERE student_id = $1
       ORDER BY created_at DESC
       LIMIT 1`,
      [studentId]
    );

    if (!certificate.rows.length) {
      return res.status(404).json({ error: 'No certificate generated yet.' });
    }

    res.json({ certificate: certificate.rows[0] });
  } catch (err) {
    console.error('getMyCertificate error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
};

const DEFAULT_TEMPLATE = {
  school_name: 'Work Immersion Program',
  company_name: 'Host Company',
  program_name: 'Work Immersion',
  footer_text:
    'Verify this certificate at the issuing institution. This is an official record of work immersion completion.',
  border_color: '#8b1e2d',
  title_text: 'CERTIFICATE OF COMPLETION',
};

/**
 * A student's name as it should appear on the certificate.
 * middle_name and suffix exist on `students` but were never selected before,
 * so they were silently dropped from the certificate.
 */
function buildFullName(row) {
  if (!row) return '';
  if (row.full_name) return row.full_name;
  return [row.first_name, row.middle_name, row.last_name, row.suffix]
    .map((p) => (p == null ? '' : String(p).trim()))
    .filter(Boolean)
    .join(' ');
}

/**
 * Add the per-batch design columns. Idempotent, so the feature works whether or
 * not migration 024 has been applied - this project has no migration runner.
 */
async function ensureBatchTemplateSchema(db = pool) {
  await db.query(`
    ALTER TABLE certificate_templates
      ADD COLUMN IF NOT EXISTS teacher_batch_id INTEGER
        REFERENCES teacher_batches(id) ON DELETE CASCADE;

    -- Migration 005 created a table-level UNIQUE(supervisor_id), which caps a
    -- supervisor at ONE design row and makes every per-batch insert fail. It
    -- must be dropped before the partial indexes below can take effect.
    ALTER TABLE certificate_templates
      DROP CONSTRAINT IF EXISTS certificate_templates_supervisor_id_key;

    ALTER TABLE certificates
      ADD COLUMN IF NOT EXISTS teacher_batch_id INTEGER
        REFERENCES teacher_batches(id) ON DELETE SET NULL;
    CREATE UNIQUE INDEX IF NOT EXISTS ux_certificate_templates_batch
      ON certificate_templates (teacher_batch_id)
      WHERE teacher_batch_id IS NOT NULL;
    CREATE UNIQUE INDEX IF NOT EXISTS ux_certificate_templates_supervisor_default
      ON certificate_templates (supervisor_id)
      WHERE teacher_batch_id IS NULL;
    CREATE INDEX IF NOT EXISTS idx_certificate_templates_lookup
      ON certificate_templates (supervisor_id, teacher_batch_id);
    CREATE INDEX IF NOT EXISTS idx_certificates_batch
      ON certificates (teacher_batch_id);
  `);
}

/** The batch a student belongs to (the batch that issued their certificate). */
async function getStudentBatchId(db, studentId) {
  const res = await db.query(
    `SELECT teacher_batch_id FROM teacher_batch_students
      WHERE student_id = $1
      ORDER BY assigned_at ASC
      LIMIT 1`,
    [studentId]
  );
  return res.rows[0]?.teacher_batch_id ?? null;
}

/**
 * Resolve the design to use: the batch's own design if it has one, otherwise
 * the supervisor's default, otherwise the built-in defaults.
 */
async function resolveTemplate(db, supervisorUserId, teacherBatchId) {
  if (teacherBatchId != null) {
    const batchRes = await db.query(
      `SELECT school_name, company_name, program_name, footer_text, border_color, title_text
         FROM certificate_templates
        WHERE supervisor_id = $1 AND teacher_batch_id = $2
        LIMIT 1`,
      [supervisorUserId, teacherBatchId]
    );
    if (batchRes.rows.length) return batchRes.rows[0];
  }

  const supRes = await db.query(
    `SELECT school_name, company_name, program_name, footer_text, border_color, title_text
       FROM certificate_templates
      WHERE supervisor_id = $1 AND teacher_batch_id IS NULL
      LIMIT 1`,
    [supervisorUserId]
  );
  if (supRes.rows.length) return supRes.rows[0];
  return { ...DEFAULT_TEMPLATE };
}

/**
 * Has this student completed everything a certificate requires? Mirrors the
 * student's own Progress page gate (approved requirements, all documentation
 * graded, and enough completed attendance days) so a student who sees
 * "Completed" can actually download a certificate.
 */
async function isStudentComplete(db, student, teacherBatchId) {
  const requirementsApproved = student.requirements_status === 'Approved';

  const docs = await db.query(
    `SELECT COUNT(*)::int AS total,
            COUNT(*) FILTER (WHERE status = 'Verified')::int AS verified
       FROM student_documents
      WHERE student_id = $1`,
    [student.student_id]
  );
  const total = docs.rows[0]?.total ?? 0;
  const verified = docs.rows[0]?.verified ?? 0;

  // Graded against the daily documentation the student actually had to file,
  // which is schedule-aware, rather than against a hardcoded 10.
  const grading = await db.query(
    `SELECT COUNT(*)::int AS graded
       FROM student_daily_documentation sdd
      WHERE sdd.student_id = $1
        AND sdd.status = 'Graded'`,
    [student.student_id]
  );
  const graded = grading.rows[0]?.graded ?? 0;

  let requiredDays = 10;
  if (teacherBatchId != null) {
    const sched = await db.query(
      `SELECT duration_type, duration_value
         FROM work_immersion_schedules
        WHERE teacher_batch_id = $1
        ORDER BY start_date ASC
        LIMIT 1`,
      [teacherBatchId]
    );
    const row = sched.rows[0];
    if (row) {
      requiredDays =
        row.duration_type === 'hours'
          ? Math.ceil(Number(row.duration_value) / 8)
          : Number(row.duration_value);
    }
  }

  const attendance = await db.query(
    `SELECT COUNT(DISTINCT date)::int AS days
       FROM student_attendance
      WHERE student_id = $1
        AND check_in_time IS NOT NULL
        AND check_out_time IS NOT NULL`,
    [student.student_id]
  );
  const attendanceDays = attendance.rows[0]?.days ?? 0;

  return {
    complete: requirementsApproved && verified === total && total > 0 && graded > 0 && attendanceDays >= requiredDays,
    attendanceDays,
    requiredDays,
    requirementsApproved,
    documentationGraded: total > 0 && verified === total,
    gradedDocumentation: graded,
  };
}

const downloadMyCertificate = async (req, res) => {
  try {
    await ensureBatchTemplateSchema();

    let result = await pool.query(
      `SELECT c.id,
              c.certificate_number,
              c.full_name,
              c.completion_date,
              c.requirements_status,
              c.documentation_status,
              c.attendance_days,
              c.issued_by,
              c.teacher_batch_id AS certificate_batch_id,
              s.id AS student_id,
              s.first_name,
              s.middle_name,
              s.last_name,
              s.suffix,
              s.student_number,
              s.grade_level,
              s.track_strand,
              u.email,
              issuer.email AS issuer_email
       FROM students s
       JOIN users u ON u.id = s.user_id
       JOIN certificates c ON c.student_id = s.id
       LEFT JOIN users issuer ON issuer.id = c.issued_by
       WHERE s.user_id = $1
       ORDER BY c.created_at DESC
       LIMIT 1`,
      [req.user.id]
    );

    // Nothing issued yet: if the student has actually finished, issue it now so
    // they can download straight away. Previously the UI showed a download
    // button for any "completed" student and this endpoint replied 404.
    if (!result.rows.length) {
      const studentRes = await pool.query(
        `SELECT s.id AS student_id, s.first_name, s.middle_name, s.last_name, s.suffix,
                s.student_number, s.grade_level, s.track_strand,
                srs.status AS requirements_status,
                tb.supervisor_id AS supervisor_user_id
           FROM students s
           JOIN users u ON u.id = s.user_id
           LEFT JOIN student_requirement_submissions srs ON srs.user_id = u.id
           LEFT JOIN teacher_batch_students tbs ON tbs.student_id = s.id
           LEFT JOIN teacher_batches tb ON tb.id = tbs.teacher_batch_id
          WHERE u.id = $1 AND u.role = 'student'
          ORDER BY tbs.assigned_at ASC
          LIMIT 1`,
        [req.user.id]
      );
      const student = studentRes.rows[0];
      if (!student) {
        return res.status(404).json({ error: 'No certificate found for your account yet.' });
      }

      const teacherBatchId = await getStudentBatchId(pool, student.student_id);
      const status = await isStudentComplete(pool, student, teacherBatchId);

      if (!status.complete) {
        return res.status(400).json({
          error: 'You have not completed all immersion requirements yet.',
        });
      }

      const template = await resolveTemplate(
        pool,
        student.supervisor_user_id,
        teacherBatchId
      );
      const certificateNumber = `CERT-${Date.now()}-${student.student_id}`;
      const completionDate = new Date().toISOString().slice(0, 10);
      const issuerName = await getIssuerDisplayName(pool, student.supervisor_user_id);
      const pdfBuffer = await buildCertificatePdf(
        {
          ...student,
          full_name: buildFullName(student),
          attendance_days: status.attendanceDays,
          certificate_number: certificateNumber,
          completion_date: completionDate,
        },
        issuerName,
        template
      );
      const publicId = certificateNumber;
      const uploadResult = await uploadPdfToCloudinary(pdfBuffer, publicId);

      // No unique constraint exists on certificates.student_id (a student can
      // legitimately hold several), so ON CONFLICT cannot be used. Guard the
      // insert instead, which is safe against a concurrent double download.
      await pool.query(
        `INSERT INTO certificates
           (student_id, full_name, certificate_number, completion_date,
            requirements_status, documentation_status, attendance_days,
            issued_by, cloudinary_public_id, cloudinary_url, teacher_batch_id)
         SELECT $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11
          WHERE NOT EXISTS (SELECT 1 FROM certificates WHERE student_id = $1)`,
        [
          student.student_id,
          buildFullName(student),
          certificateNumber,
          completionDate,
          'Approved',
          'Verified',
          status.attendanceDays,
          student.supervisor_user_id ?? null,
          uploadResult.public_id,
          uploadResult.secure_url,
          teacherBatchId,
        ]
      );

      result = await pool.query(
        `SELECT c.id, c.certificate_number, c.full_name, c.completion_date,
                c.issued_by, c.teacher_batch_id AS certificate_batch_id,
                s.id AS student_id, s.first_name, s.middle_name, s.last_name, s.suffix,
                s.student_number, s.grade_level, s.track_strand, u.email,
                issuer.email AS issuer_email
           FROM students s
           JOIN users u ON u.id = s.user_id
           JOIN certificates c ON c.student_id = s.id
           LEFT JOIN users issuer ON issuer.id = c.issued_by
          WHERE s.user_id = $1
          ORDER BY c.created_at DESC
          LIMIT 1`,
        [req.user.id]
      );
    }

    if (!result.rows.length) {
      return res.status(404).json({ error: 'No certificate generated yet.' });
    }

    const certificate = result.rows[0];
    // The batch the certificate was issued for decides its design; the issuing
    // supervisor is only the fallback.
    const template = await resolveTemplate(
      pool,
      certificate.issued_by,
      certificate.certificate_batch_id
    );
    const issuerName = await getIssuerDisplayName(
      pool,
      certificate.issued_by,
      certificate.issuer_email
    );
    const pdfBuffer = await buildCertificatePdf(
      { ...certificate, full_name: certificate.full_name || buildFullName(certificate) },
      issuerName,
      template
    );
    const filename = `Certificate_${certificate.certificate_number || certificate.id}.pdf`;

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', pdfBuffer.length);
    res.send(pdfBuffer);
  } catch (err) {
    console.error('downloadMyCertificate error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
};

const getMyCertificateTemplate = async (req, res) => {
  try {
    await ensureBatchTemplateSchema();

    // Optional ?batchId= returns that batch's own design; omitted returns the
    // supervisor default.
    const batchId =
      req.query.batchId === undefined || req.query.batchId === '' || req.query.batchId === 'default'
        ? null
        : Number(req.query.batchId);
    if (batchId !== null && !Number.isInteger(batchId)) {
      return res.status(400).json({ error: 'Invalid batch id.' });
    }

    const template = await resolveTemplate(pool, req.user.id, batchId);
    res.json({ ...template, teacher_batch_id: batchId, is_default: batchId === null });
  } catch (err) {
    console.error('getMyCertificateTemplate error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
};

const saveMyCertificateTemplate = async (req, res) => {
  const client = await pool.connect();
  try {
    await ensureBatchTemplateSchema(client);

    const {
      school_name = DEFAULT_TEMPLATE.school_name,
      company_name = DEFAULT_TEMPLATE.company_name,
      program_name = DEFAULT_TEMPLATE.program_name,
      footer_text = DEFAULT_TEMPLATE.footer_text,
      border_color = DEFAULT_TEMPLATE.border_color,
      title_text = DEFAULT_TEMPLATE.title_text,
    } = req.body || {};

    const rawBatchId = req.body?.teacher_batch_id;
    const teacherBatchId = rawBatchId == null || rawBatchId === '' ? null : Number(rawBatchId);
    if (teacherBatchId !== null && !Number.isInteger(teacherBatchId)) {
      client.release();
      return res.status(400).json({ error: 'Invalid batch id.' });
    }

    // A batch design and the supervisor default live in the same table, so the
    // conflict target is chosen by whether teacher_batch_id is set. ON CONFLICT
    // cannot reference a partial index by name, so both cases are matched with
    // an IS NOT DISTINCT FROM guard instead.
    const existing = await client.query(
      `SELECT id FROM certificate_templates
        WHERE supervisor_id = $1 AND teacher_batch_id IS NOT DISTINCT FROM $2
        LIMIT 1`,
      [req.user.id, teacherBatchId]
    );

    let row;
    if (existing.rows.length) {
      const upd = await client.query(
        `UPDATE certificate_templates
            SET school_name = $2, company_name = $3, program_name = $4,
                footer_text = $5, border_color = $6, title_text = $7,
                updated_at = CURRENT_TIMESTAMP
          WHERE id = $1
        RETURNING school_name, company_name, program_name, footer_text, border_color, title_text`,
        [existing.rows[0].id, school_name, company_name, program_name, footer_text, border_color, title_text]
      );
      row = upd.rows[0];
    } else {
      const ins = await client.query(
        `INSERT INTO certificate_templates
           (supervisor_id, teacher_batch_id, school_name, company_name, program_name, footer_text, border_color, title_text)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
        RETURNING school_name, company_name, program_name, footer_text, border_color, title_text`,
        [req.user.id, teacherBatchId, school_name, company_name, program_name, footer_text, border_color, title_text]
      );
      row = ins.rows[0];
    }

    res.json({ ...row, teacher_batch_id: teacherBatchId, is_default: teacherBatchId === null });
  } catch (err) {
    console.error('saveMyCertificateTemplate error:', err);
    res.status(500).json({ error: 'Server error.' });
  } finally {
    client.release();
  }
};

const forceGenerateCertificate = async (req, res) => {
  const client = await pool.connect();
  try {
    const { studentId } = req.params;
    const supervisorUserId = req.user.id;
    await ensureBatchTemplateSchema(client);

    const studentResult = await client.query(
      `SELECT u.id AS user_id, s.id AS student_id, s.first_name, s.middle_name,
              s.last_name, s.suffix, s.student_number,
              s.grade_level, s.track_strand, srs.status AS requirements_status
       FROM users u
       JOIN students s ON s.user_id = u.id
       JOIN student_requirement_submissions srs ON srs.user_id = u.id
       WHERE u.id = $1 AND u.role = 'student'
       LIMIT 1`,
      [studentId]
    );
    if (!studentResult.rows.length) {
      return res.status(404).json({ error: 'Student not found.' });
    }
    const student = studentResult.rows[0];

    // Same design resolution as the normal issue path.
    const teacherBatchId = await getStudentBatchId(client, student.student_id);
    const template = await resolveTemplate(client, supervisorUserId, teacherBatchId);

    const existing = await client.query(
      `SELECT id, certificate_number, cloudinary_url
       FROM certificates
       WHERE student_id = $1
       ORDER BY created_at DESC
       LIMIT 1`,
      [student.student_id]
    );
    if (existing.rows.length) {
      return res.json({
        message: 'Certificate already generated.',
        certificate: existing.rows[0],
        forced: String(existing.rows[0].certificate_number || '').startsWith('CERT-FORCE-'),
      });
    }

    const attendanceResult = await client.query(
      `SELECT COUNT(DISTINCT date)::int AS days
       FROM student_attendance
       WHERE student_id = $1 AND check_in_time IS NOT NULL AND check_out_time IS NOT NULL`,
      [student.student_id]
    );
    const docsResult = await client.query(
      `SELECT COUNT(*)::int AS total, COUNT(*) FILTER (WHERE status='Verified')::int AS verified
       FROM student_documents
       WHERE student_id = $1`,
      [student.student_id]
    );

    const certificateNumber = `CERT-FORCE-${Date.now()}-${student.student_id}`;
    const completionDate = new Date().toISOString().slice(0, 10);
    const studentRecord = {
      ...student,
      full_name: buildFullName(student),
      attendance_days: attendanceResult.rows[0]?.days || 0,
      certificate_number: certificateNumber,
      completion_date: completionDate,
    };

    const issuerName = await getIssuerDisplayName(client, supervisorUserId, req.user?.email);
    const pdfBuffer = await buildCertificatePdf(studentRecord, issuerName, template);
    const publicId = certificateNumber;
    const uploadResult = await uploadPdfToCloudinary(pdfBuffer, publicId);

    const insert = await client.query(
      `INSERT INTO certificates (student_id, full_name, certificate_number, completion_date, requirements_status, documentation_status, attendance_days, issued_by, cloudinary_public_id, cloudinary_url, teacher_batch_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       RETURNING id, certificate_number, cloudinary_url`,
      [
        student.student_id,
        buildFullName(student),
        certificateNumber,
        completionDate,
        'Forced',
        docsResult.rows[0]?.verified ? 'Graded' : 'Pending',
        attendanceResult.rows[0]?.days || 0,
        supervisorUserId,
        uploadResult.public_id,
        cloudinaryDownloadUrl(uploadResult.secure_url),
        teacherBatchId,
      ]
    );

    void createNotification({
      userId: student.user_id,
      title: 'Certificate available',
      message: 'Your work immersion certificate is now available for download.',
      type: 'certificate',
      category: 'certificate',
      priority: 'high',
      actionUrl: '/dashboard/student/progress',
      relatedUserId: supervisorUserId,
      entityType: 'certificate',
      entityId: insert.rows[0].id,
      eventKey: `certificate:${insert.rows[0].id}`,
    }).catch((err) => console.error('Certificate notification failed:', err.message));

    res.status(201).json({ certificate: insert.rows[0], forced: true });
  } catch (err) {
    console.error('forceGenerateCertificate error:', err);
    res.status(500).json({ error: 'Server error.' });
  } finally {
    client.release();
  }
};

const undoForceIssue = async (req, res) => {
  const client = await pool.connect();
  try {
    const { studentId } = req.params;

    const certResult = await client.query(
      `SELECT c.id, c.cloudinary_public_id, c.cloudinary_url, c.certificate_number
       FROM certificates c
       JOIN students s ON s.id = c.student_id
       WHERE s.user_id = $1
         AND c.certificate_number LIKE 'CERT-FORCE-%'
       ORDER BY c.created_at DESC`,
      [studentId]
    );
    if (!certResult.rows.length) {
      return res.status(404).json({ error: 'No force-issued certificate found for this student.' });
    }

    const certIds = certResult.rows.map((cert) => cert.id);
    await client.query('DELETE FROM certificates WHERE id = ANY($1::int[])', [certIds]);

    for (const cert of certResult.rows) {
      try {
        await cloudinary.uploader.destroy(cert.cloudinary_public_id, { resource_type: 'raw' });
      } catch (cloudinaryErr) {
        console.error('Cloudinary delete failed:', cloudinaryErr);
      }
    }

    res.json({ message: 'Certificate removed successfully.' });
  } catch (err) {
    console.error('undoForceIssue error:', err);
    res.status(500).json({ error: 'Server error.' });
  } finally {
    client.release();
  }
};

module.exports = {
  getEligibleStudents,
  generateCertificate,
  forceGenerateCertificate,
  undoForceIssue,
  getMyCertificate,
  downloadMyCertificate,
  getMyCertificateTemplate,
  saveMyCertificateTemplate,
  // Exported so the schema bootstrap, design resolution and the PDF renderer
  // can be exercised directly by verification scripts without going through
  // HTTP or Cloudinary.
  ensureBatchTemplateSchema,
  resolveTemplate,
  buildFullName,
  buildCertificatePdf,
};
