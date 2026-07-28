const PDFDocument = require('pdfkit');
const cloudinary = require('../../db/cloudinary');
const streamifier = require('streamifier');
const pool = require('../../db');

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

function buildCertificatePdf(student, issuedBy, template = {}) {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: 'A4', margin: 0 });
      const chunks = [];
      doc.on('data', (chunk) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      const pageWidth = doc.page.width;
      const pageHeight = doc.page.height;
      const margin = 50;
      const usableWidth = pageWidth - margin * 2;

      const schoolName = template.school_name || 'Work Immersion Program';
      const companyName = template.company_name || 'Host Company';
      const programName = template.program_name || 'Work Immersion';
      const footerText = template.footer_text || 'Verify this certificate at the issuing institution. This is an official record of work immersion completion.';
      const borderColor = template.border_color || '#1e3a8a';
      const titleText = template.title_text || 'CERTIFICATE OF COMPLETION';

      // Outer decorative border
      doc
        .strokeColor(borderColor)
        .lineWidth(4)
        .rect(margin, margin, usableWidth, pageHeight - margin * 2)
        .stroke();

      // Inner border
      const innerMargin = margin + 8;
      doc
        .strokeColor('#cbd5e1')
        .lineWidth(1.5)
        .rect(innerMargin, innerMargin, usableWidth - 16, pageHeight - innerMargin * 2)
        .stroke();

      // Header accent bar
      doc
        .fillColor(borderColor)
        .rect(margin + 20, margin + 20, usableWidth - 40, 6)
        .fill();

      // Title
      doc.moveDown(2.5);
      doc
        .font('Helvetica-Bold')
        .fontSize(22)
        .fillColor('#0f172a')
        .text(titleText, { align: 'center' });

      doc.moveDown(0.3);
      doc
        .font('Helvetica-Oblique')
        .fontSize(11)
        .fillColor('#475569')
        .text(programName, { align: 'center' });

      // Divider
      doc.moveDown(1.2);
      doc
        .strokeColor('#3b82f6')
        .lineWidth(1)
        .moveTo(margin + 60, doc.y)
        .lineTo(pageWidth - margin - 60, doc.y)
        .stroke();
      doc.moveDown(1);

      // Body
      doc
        .font('Helvetica')
        .fontSize(13)
        .fillColor('#334155')
        .text('This is to certify that', { align: 'center' });

      doc.moveDown(0.6);
      doc
        .font('Helvetica-Bold')
        .fontSize(20)
        .fillColor('#0f172a')
        .text(student.full_name || `${student.first_name} ${student.last_name}`, { align: 'center' });

      doc.moveDown(0.6);
      doc
        .font('Helvetica')
        .fontSize(12)
        .fillColor('#334155')
        .text(
          `has successfully completed the ${programName} at ` +
            companyName +
            ` with a total of ${student.attendance_days || 10} attendance days.`,
          { align: 'center', width: usableWidth - 80 }
        );

      doc.moveDown(1);
      doc
        .font('Helvetica')
        .fontSize(11)
        .fillColor('#475569')
        .text(
          'Requirements approved  ·  Documentation verified  ·  Attendance completed',
          { align: 'center' }
        );

      doc.moveDown(1.2);
      doc
        .strokeColor('#cbd5e1')
        .lineWidth(0.5)
        .moveTo(margin + 60, doc.y)
        .lineTo(pageWidth - margin - 60, doc.y)
        .stroke();
      doc.moveDown(0.6);

      const leftX = margin + 30;
      const centerX = pageWidth / 2;
      const rightX = pageWidth - margin - 30;

      doc.font('Helvetica').fontSize(9).fillColor('#64748b');
      doc.text('ISSUED BY', leftX, doc.y, { width: 140, align: 'left' });
      doc.text('CERTIFICATE NO.', centerX - 60, doc.y, { width: 120, align: 'center' });
      doc.text('DATE', rightX - 120, doc.y, { width: 120, align: 'right' });

      doc.moveDown(0.3);
      doc.font('Helvetica-Bold').fontSize(11).fillColor('#0f172a');
      doc.text(issuedBy || schoolName || 'Administrator', leftX, doc.y, { width: 180, align: 'left' });
      doc.text(student.certificate_number || '', centerX - 60, doc.y, { width: 120, align: 'center' });
      doc.text(
        student.completion_date
          ? new Date(student.completion_date).toLocaleDateString('en-US', {
              year: 'numeric',
              month: 'long',
              day: 'numeric',
            })
          : '',
        rightX - 120,
        doc.y,
        { width: 120, align: 'right' }
      );

      doc.moveDown(2);
      doc
        .strokeColor(borderColor)
        .lineWidth(2)
        .rect(margin + 40, doc.y, usableWidth - 80, 1)
        .stroke();

      doc.moveDown(0.4);
      doc
        .font('Helvetica-Oblique')
        .fontSize(9)
        .fillColor('#64748b')
        .text(footerText, { align: 'center', width: usableWidth - 80 });

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
             srs.submitted_at
      FROM users u
      JOIN students s ON s.user_id = u.id
      JOIN student_requirement_submissions srs ON srs.user_id = u.id
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

    const templateResult = await client.query(
      `SELECT school_name, company_name, program_name, footer_text, border_color, title_text
       FROM certificate_templates
       WHERE supervisor_id = $1
       LIMIT 1`,
      [supervisorUserId]
    );
    const template = templateResult.rows[0] || {};

    let studentResult;
    try {
      studentResult = await client.query(
        `SELECT u.id AS user_id, u.email, s.id AS student_id, s.first_name, s.last_name, s.student_number,
                s.grade_level, s.track_strand, srs.status AS requirements_status
         FROM users u
         JOIN students s ON s.user_id = u.id
         JOIN student_requirement_submissions srs ON srs.user_id = u.id
         WHERE u.id = $1 AND u.role = 'student'
         LIMIT 1`,
        [studentId]
      );
    } catch (err) {
      return res.status(404).json({ error: 'Student not found.' });
    }
    if (!studentResult.rows.length) {
      return res.status(404).json({ error: 'Student not found.' });
    }
    const student = studentResult.rows[0];

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

    const existing = await client.query(
      `SELECT id, cloudinary_url FROM certificates WHERE student_id = $1 LIMIT 1`,
      [student.student_id]
    );
    if (existing.rows.length) {
      return res.json({
        message: 'Certificate already generated.',
        certificate: {
          id: existing.rows[0].id,
          cloudinary_url: existing.rows[0].cloudinary_url,
        },
      });
    }

    const certificateNumber = `CERT-${Date.now()}-${student.student_id}`;
    const completionDate = new Date().toISOString().slice(0, 10);
    const studentRecord = {
      ...student,
      attendance_days: attendanceDays,
      certificate_number: certificateNumber,
      completion_date: completionDate,
    };

    const pdfBuffer = await buildCertificatePdf(studentRecord, req.user?.email || 'Administrator', template);
    const publicId = `certificates/${certificateNumber}`;
    const uploadResult = await uploadPdfToCloudinary(pdfBuffer, publicId);

    const insert = await client.query(
      `INSERT INTO certificates (student_id, full_name, certificate_number, completion_date, requirements_status, documentation_status, attendance_days, issued_by, cloudinary_public_id, cloudinary_url)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING id, certificate_number, cloudinary_url`,
      [
        student.student_id,
        `${student.first_name} ${student.last_name}`,
        certificateNumber,
        completionDate,
        student.requirements_status,
        documentationGraded ? 'Graded' : 'Pending',
        attendanceDays,
        supervisorUserId,
        uploadResult.public_id,
        cloudinaryDownloadUrl(uploadResult.secure_url),
      ]
    );

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

const downloadMyCertificate = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT c.id,
              c.certificate_number,
              c.full_name,
              c.completion_date,
              c.requirements_status,
              c.documentation_status,
              c.attendance_days,
              c.issued_by,
              s.id AS student_id,
              s.first_name,
              s.last_name,
              s.student_number,
              s.grade_level,
              s.track_strand,
              u.email,
              ct.school_name,
              ct.company_name,
              ct.program_name,
              ct.footer_text,
              ct.border_color,
              ct.title_text,
              issuer.email AS issuer_email
       FROM students s
       JOIN users u ON u.id = s.user_id
       JOIN certificates c ON c.student_id = s.id
       LEFT JOIN certificate_templates ct ON ct.supervisor_id = c.issued_by
       LEFT JOIN users issuer ON issuer.id = c.issued_by
       WHERE s.user_id = $1
       ORDER BY c.created_at DESC
       LIMIT 1`,
      [req.user.id]
    );

    if (!result.rows.length) {
      return res.status(404).json({ error: 'No certificate generated yet.' });
    }

    const certificate = result.rows[0];
    const template = {
      school_name: certificate.school_name,
      company_name: certificate.company_name,
      program_name: certificate.program_name,
      footer_text: certificate.footer_text,
      border_color: certificate.border_color,
      title_text: certificate.title_text,
    };
    const pdfBuffer = await buildCertificatePdf(certificate, certificate.issuer_email || 'Administrator', template);
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
    const result = await pool.query(
      `SELECT school_name, company_name, program_name, footer_text, border_color, title_text
       FROM certificate_templates
       WHERE supervisor_id = $1
       LIMIT 1`,
      [req.user.id]
    );

    if (!result.rows.length) {
      return res.json({
        school_name: 'Work Immersion Program',
        company_name: 'Host Company',
        program_name: 'Work Immersion',
        footer_text: 'Verify this certificate at the issuing institution. This is an official record of work immersion completion.',
        border_color: '#1e3a8a',
        title_text: 'CERTIFICATE OF COMPLETION',
      });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error('getMyCertificateTemplate error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
};

const saveMyCertificateTemplate = async (req, res) => {
  const client = await pool.connect();
  try {
    const {
      school_name = 'Work Immersion Program',
      company_name = 'Host Company',
      program_name = 'Work Immersion',
      footer_text = 'Verify this certificate at the issuing institution. This is an official record of work immersion completion.',
      border_color = '#1e3a8a',
      title_text = 'CERTIFICATE OF COMPLETION',
    } = req.body || {};

    const result = await client.query(
      `INSERT INTO certificate_templates (supervisor_id, school_name, company_name, program_name, footer_text, border_color, title_text)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (supervisor_id) DO UPDATE SET
         school_name = EXCLUDED.school_name,
         company_name = EXCLUDED.company_name,
         program_name = EXCLUDED.program_name,
         footer_text = EXCLUDED.footer_text,
         border_color = EXCLUDED.border_color,
         title_text = EXCLUDED.title_text,
         updated_at = CURRENT_TIMESTAMP
       RETURNING school_name, company_name, program_name, footer_text, border_color, title_text`,
      [req.user.id, school_name, company_name, program_name, footer_text, border_color, title_text]
    );

    res.json(result.rows[0]);
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

    const templateResult = await client.query(
      `SELECT school_name, company_name, program_name, footer_text, border_color, title_text
       FROM certificate_templates
       WHERE supervisor_id = $1
       LIMIT 1`,
      [supervisorUserId]
    );
    const template = templateResult.rows[0] || {};

    const studentResult = await client.query(
      `SELECT u.id AS user_id, s.id AS student_id, s.first_name, s.last_name, s.student_number,
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
      attendance_days: attendanceResult.rows[0]?.days || 0,
      certificate_number: certificateNumber,
      completion_date: completionDate,
    };

    const pdfBuffer = await buildCertificatePdf(studentRecord, req.user?.email || 'Administrator', template);
    const publicId = `certificates/${certificateNumber}`;
    const uploadResult = await uploadPdfToCloudinary(pdfBuffer, publicId);

    const insert = await client.query(
      `INSERT INTO certificates (student_id, full_name, certificate_number, completion_date, requirements_status, documentation_status, attendance_days, issued_by, cloudinary_public_id, cloudinary_url)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING id, certificate_number, cloudinary_url`,
      [
        student.student_id,
        `${student.first_name} ${student.last_name}`,
        certificateNumber,
        completionDate,
        'Forced',
        docsResult.rows[0]?.verified ? 'Graded' : 'Pending',
        attendanceResult.rows[0]?.days || 0,
        supervisorUserId,
        uploadResult.public_id,
        cloudinaryDownloadUrl(uploadResult.secure_url),
      ]
    );

    res.status(201).json({ certificate: insert.rows[0], forced: true });
  } catch (err) {
    console.error('forceGenerateCertificate error:', err);
    res.status(500).json({ error: 'Server error.' });
  } finally {
    client.release();
  }
};

module.exports = {
  getEligibleStudents,
  generateCertificate,
  forceGenerateCertificate,
  getMyCertificate,
  downloadMyCertificate,
  getMyCertificateTemplate,
  saveMyCertificateTemplate,
};
