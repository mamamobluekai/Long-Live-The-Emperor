const multer = require('multer');
const nodemailer = require('nodemailer');
const xlsx = require('xlsx');
const pool = require('../../db');
const { NO_PASSWORD_SENTINEL } = require('../../utils/passwordPolicy');
const { normalizeEmail } = require('../../utils/normalizeEmail');
const { parseSheetRows, EMAIL_REGEX } = require('../../utils/excelUpload');

// Example workbooks so an admin always has the exact column layout the importer
// expects, plus a "Read me" sheet describing every field.
const TEMPLATE_SPECS = {
  teachers: {
    sheet: 'Teachers',
    columns: [
      'Employee ID',
      'First Name',
      'Last Name',
      'Email',
      'Phone Number',
      'Department',
      'Position',
    ],
    sample: [
      'T-1001',
      'Juan',
      'Dela Cruz',
      'juan.delacruz@wims.edu.ph',
      '09171234567',
      'Mathematics',
      'Department Head',
    ],
    guide: [
      ['Employee ID', 'Required', 'Unique ID used by the system', 'T-1001'],
      ['First Name', 'Required', 'Given name', 'Juan'],
      ['Last Name', 'Required', 'Family name', 'Dela Cruz'],
      ['Email', 'Required', 'Must be unique and a valid email', 'juan.delacruz@wims.edu.ph'],
      ['Phone Number', 'Optional', 'Contact number', '09171234567'],
      ['Department', 'Required', 'Department or strand handled', 'Mathematics'],
      ['Position', 'Required', 'Designation or job title', 'Department Head'],
    ],
    notes: [
      'Keep the header row exactly as shown; extra columns are ignored.',
      'Accepted header aliases: "Employee No", "Given Name", "Surname", "Designation", "Contact Number".',
      'New accounts are created with a random temporary password and a "pending" status that you approve afterwards.',
    ],
  },
  supervisors: {
    sheet: 'Supervisors',
    columns: [
      'Employee ID',
      'Company Name',
      'First Name',
      'Last Name',
      'Position',
      'Email',
      'Phone Number',
      'Department',
    ],
    sample: [
      'S-2001',
      'Ace Hardware Inc.',
      'Maria',
      'Santos',
      'Site Supervisor',
      'maria.santos@acehardware.ph',
      '09181234567',
      'Operations',
    ],
    guide: [
      ['Employee ID', 'Required', 'Unique ID used by the system', 'S-2001'],
      ['Company Name', 'Required', 'Host company or business name', 'Ace Hardware Inc.'],
      ['First Name', 'Required', 'Given name', 'Maria'],
      ['Last Name', 'Required', 'Family name', 'Santos'],
      ['Position', 'Required', 'Designation or job title', 'Site Supervisor'],
      ['Email', 'Required', 'Must be unique and a valid email', 'maria.santos@acehardware.ph'],
      ['Phone Number', 'Optional', 'Contact number', '09181234567'],
      ['Department', 'Optional', 'Department or division in the company', 'Operations'],
    ],
    notes: [
      'Keep the header row exactly as shown; extra columns are ignored.',
      'Accepted header aliases: "Company", "Host Company", "Business Name", "Job Title", "Designation".',
      'New accounts are created with a random temporary password and a "pending" status that you approve afterwards.',
    ],
  },
  coordinators: {
    sheet: 'Coordinators',
    columns: [
      'Coordinator ID',
      'First Name',
      'Last Name',
      'Email',
      'Phone Number',
      'Department',
      'Position',
    ],
    sample: [
      'C-3001',
      'Ana',
      'Reyes',
      'ana.reyes@wims.edu.ph',
      '09191234567',
      'Senior High School',
      'Work Immersion Coordinator',
    ],
    guide: [
      ['Coordinator ID', 'Required', 'Unique ID used by the system (may be titled "Employee ID")', 'C-3001'],
      ['First Name', 'Required', 'Given name', 'Ana'],
      ['Last Name', 'Required', 'Family name', 'Reyes'],
      ['Email', 'Required', 'Must be unique and a valid email', 'ana.reyes@wims.edu.ph'],
      ['Phone Number', 'Optional', 'Contact number', '09191234567'],
      ['Department', 'Required', 'Department or strand handled', 'Senior High School'],
      ['Position', 'Required', 'Designation or job title', 'Work Immersion Coordinator'],
    ],
    notes: [
      'Keep the header row exactly as shown; extra columns are ignored.',
      'Accepted header aliases: "Employee ID", "Given Name", "Surname", "Designation", "Contact Number".',
      'New accounts are created with a random temporary password and a "pending" status that you approve afterwards.',
    ],
  },
};

const downloadUploadTemplate = async (req, res) => {
  const spec = TEMPLATE_SPECS[req.params.type];

  if (!spec) {
    return res.status(400).json({ error: 'Unknown upload template.' });
  }

  try {
    const workbook = xlsx.utils.book_new();

    const dataSheet = xlsx.utils.aoa_to_sheet([spec.columns, spec.sample]);
    dataSheet['!cols'] = spec.columns.map((column) => ({
      wch: Math.max(16, column.length + 4),
    }));
    xlsx.utils.book_append_sheet(workbook, dataSheet, spec.sheet);

    const guideRows = [
      ['Field', 'Requirement', 'Description', 'Example'],
      ...spec.guide,
      [],
      ['Notes', '', '', ''],
      ...spec.notes.map((note) => [note, '', '', '']),
    ];
    const guideSheet = xlsx.utils.aoa_to_sheet(guideRows);
    guideSheet['!cols'] = [
      { wch: 18 },
      { wch: 14 },
      { wch: 48 },
      { wch: 32 },
    ];
    xlsx.utils.book_append_sheet(workbook, guideSheet, 'Read me');

    const buffer = xlsx.write(workbook, { type: 'buffer', bookType: 'xlsx' });

    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${req.params.type}_upload_template.xlsx"`,
    );
    res.send(buffer);
  } catch (err) {
    console.error('Template download error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
};

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

transporter.verify((err) => {
  if (err) {
    console.error('Email transporter verification failed:', err.message);
  } else {
    console.log('Email transporter ready.');
  }
});

const uploadTeachersExcel = async (req, res) => {
  try {
    const parsed = parseSheetRows(req.file?.buffer, 'teachers');
    if (!parsed.ok) {
      return res.status(400).json({ error: parsed.error });
    }
    const rows = parsed.rows;

    const results = { success: 0, failed: 0, errors: [] };
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        const employeeId = row.employeeId;
        const firstName = row.firstName;
        const lastName = row.lastName;
        // Canonicalised to match how registration stores an address, so the
        // duplicate check below and a later login agree.
        const email = normalizeEmail(row.email);
        const department = row.department;
        const position = row.position;
        const phone = row.phone || '';

        if (!employeeId || !firstName || !lastName || !email || !department || !position) {
          results.failed++;
          results.errors.push({ row: i + 2, error: 'Missing required fields' });
          continue;
        }

        if (!EMAIL_REGEX.test(email)) {
          results.failed++;
          results.errors.push({ row: i + 2, error: `Invalid email: ${email}` });
          continue;
        }

        const existing = await client.query(
          'SELECT id FROM users WHERE email = $1',
          [email]
        );
        if (existing.rows.length > 0) {
          results.failed++;
          results.errors.push({ row: i + 2, error: `Duplicate email: ${email}` });
          continue;
        }

        const existingEmpId = await client.query(
          'SELECT id FROM teachers WHERE employee_id = $1',
          [employeeId]
        );
        if (existingEmpId.rows.length > 0) {
          results.failed++;
          results.errors.push({ row: i + 2, error: `Duplicate employee ID: ${employeeId}` });
          continue;
        }

        const userResult = await client.query(
          `INSERT INTO users (email, password, role, phone, status)
           VALUES ($1, $2, 'teacher', $3, 'pending')
           RETURNING id`,
          [email, NO_PASSWORD_SENTINEL, phone || null]
        );

        const userId = userResult.rows[0].id;

        // Insert into teachers table
        await client.query(
          `INSERT INTO teachers (user_id, first_name, last_name, employee_id, department, designation)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [userId, firstName, lastName, employeeId, department, position]
        );

        results.success++;
      }

      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }

    res.json({
      message: `Upload complete. ${results.success} teachers added, ${results.failed} failed.`,
      results,
    });
  } catch (err) {
    console.error('Excel upload error:', err);
    res.status(500).json({ error: 'Upload failed: ' + err.message });
  }
};

const uploadSupervisorsExcel = async (req, res) => {
  try {
    const parsed = parseSheetRows(req.file?.buffer, 'supervisors');
    if (!parsed.ok) {
      return res.status(400).json({ error: parsed.error });
    }
    const rows = parsed.rows;

    const results = { success: 0, failed: 0, errors: [] };
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        const employeeId = row.employeeId;
        const companyName = row.companyName;
        const firstName = row.firstName;
        const lastName = row.lastName;
        const position = row.position;
        // Canonicalised to match how registration stores an address, so the
        // duplicate check below and a later login agree.
        const email = normalizeEmail(row.email);
        const department = row.department || '';
        const phone = row.phone || '';

        if (!employeeId || !companyName || !firstName || !lastName || !position || !email) {
          results.failed++;
          results.errors.push({ row: i + 2, error: 'Missing required fields' });
          continue;
        }

        if (!EMAIL_REGEX.test(email)) {
          results.failed++;
          results.errors.push({ row: i + 2, error: `Invalid email: ${email}` });
          continue;
        }

        const existing = await client.query(
          'SELECT id FROM users WHERE email = $1',
          [email]
        );
        if (existing.rows.length > 0) {
          results.failed++;
          results.errors.push({ row: i + 2, error: `Duplicate email: ${email}` });
          continue;
        }

        const existingEmpId = await client.query(
          'SELECT id FROM supervisors WHERE employee_id = $1',
          [employeeId]
        );
        if (existingEmpId.rows.length > 0) {
          results.failed++;
          results.errors.push({ row: i + 2, error: `Duplicate employee ID: ${employeeId}` });
          continue;
        }

        const userResult = await client.query(
          `INSERT INTO users (email, password, role, phone, status)
           VALUES ($1, $2, 'supervisor', $3, 'pending')
           RETURNING id`,
          [email, NO_PASSWORD_SENTINEL, phone || null]
        );

        const userId = userResult.rows[0].id;

        // Insert into supervisors table
        await client.query(
          `INSERT INTO supervisors (user_id, first_name, last_name, employee_id, company_name, designation, department)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [userId, firstName, lastName, employeeId, companyName, position, department || null]
        );

        results.success++;
      }

      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }

    res.json({
      message: `Upload complete. ${results.success} supervisors added, ${results.failed} failed.`,
      results,
    });
  } catch (err) {
    console.error('Excel upload error:', err);
    res.status(500).json({ error: 'Upload failed: ' + err.message });
  }
};

const uploadCoordinatorsExcel = async (req, res) => {
  try {
    const parsed = parseSheetRows(req.file?.buffer, 'coordinators');
    if (!parsed.ok) {
      return res.status(400).json({ error: parsed.error });
    }
    const rows = parsed.rows;

    const results = { success: 0, failed: 0, errors: [] };
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];

        const coordinatorId = row.coordinatorId || row.employeeId;
        const firstName = row.firstName;
        const lastName = row.lastName;
        // Canonicalised to match how registration stores an address, so the
        // duplicate check below and a later login agree.
        const email = normalizeEmail(row.email);
        const department = row.department;
        const position = row.position;
        const phone = row.phone || '';

        // Validate required fields
        if (!coordinatorId || !firstName || !lastName || !email || !department || !position) {
          results.failed++;
          results.errors.push({ row: i + 2, error: 'Missing required fields' });
          continue;
        }

        // Validate email
        if (!EMAIL_REGEX.test(email)) {
          results.failed++;
          results.errors.push({ row: i + 2, error: `Invalid email: ${email}` });
          continue;
        }

        // Check duplicate email
        const existing = await client.query(
          'SELECT id FROM users WHERE email = $1',
          [email]
        );

        if (existing.rows.length > 0) {
          results.failed++;
          results.errors.push({
            row: i + 2,
            error: `Duplicate email: ${email}`,
          });
          continue;
        }

        const existingEmpId = await client.query(
          'SELECT id FROM coordinators WHERE employee_id = $1',
          [coordinatorId]
        );

        if (existingEmpId.rows.length > 0) {
          results.failed++;
          results.errors.push({
            row: i + 2,
            error: `Duplicate coordinator ID: ${coordinatorId}`,
          });
          continue;
        }

        // Insert coordinator in users table
        const userResult = await client.query(
          `INSERT INTO users (email, password, role, phone, status)
           VALUES ($1, $2, 'coordinator', $3, 'pending')
           RETURNING id`,
          [email, NO_PASSWORD_SENTINEL, phone || null]
        );

        const userId = userResult.rows[0].id;

        // Insert into coordinators table
        await client.query(
          `INSERT INTO coordinators (user_id, first_name, last_name, employee_id, department, designation)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [userId, firstName, lastName, coordinatorId, department, position]
        );

        results.success++;
      }

      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }

    return res.json({
      message: `Upload complete. ${results.success} coordinators added, ${results.failed} failed.`,
      results,
    });
  } catch (err) {
    console.error('Coordinator upload error:', err);
    return res.status(500).json({
      error: 'Upload failed: ' + err.message,
    });
  }
};

module.exports = {
  uploadTeachersExcel,
  uploadSupervisorsExcel,
  uploadCoordinatorsExcel,
  downloadUploadTemplate,
};
