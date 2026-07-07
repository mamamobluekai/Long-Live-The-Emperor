const multer = require('multer');
const xlsx = require('xlsx');
const bcrypt = require('bcryptjs');
const nodemailer = require('nodemailer');
const pool = require('../../db');

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
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded.' });
    }

    const workbook = xlsx.read(req.file.buffer, { type: 'buffer' });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = xlsx.utils.sheet_to_json(sheet, { defval: '' });

    if (rows.length === 0) {
      return res.status(400).json({ error: 'Excel file is empty.' });
    }

    const requiredColumns = ['Employee ID', 'First Name', 'Last Name', 'Email', 'Department', 'Position'];
    const headers = Object.keys(rows[0]);
    const missing = requiredColumns.filter((c) => !headers.includes(c));
    if (missing.length > 0) {
      return res.status(400).json({ error: `Missing columns: ${missing.join(', ')}` });
    }

    const results = { success: 0, failed: 0, errors: [] };
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        const employeeId = String(row['Employee ID']).trim();
        const firstName = String(row['First Name']).trim();
        const lastName = String(row['Last Name']).trim();
        const email = String(row['Email']).trim();
        const department = String(row['Department']).trim();
        const position = String(row['Position']).trim();
        const phone = String(row['Phone Number'] || '').trim();

        if (!employeeId || !firstName || !lastName || !email || !department || !position) {
          results.failed++;
          results.errors.push({ row: i + 2, error: 'Missing required fields' });
          continue;
        }

        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
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

        const tempPassword = Math.random().toString(36).slice(-12);
        const hashedPassword = await bcrypt.hash(tempPassword, 10);

        const userResult = await client.query(
          `INSERT INTO users (email, password, role, phone, status)
           VALUES ($1, $2, 'teacher', $3, 'pending')
           RETURNING id`,
          [email, hashedPassword, phone || null]
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
    res.status(500).json({ error: 'Server error during upload.' });
  }
};

const uploadSupervisorsExcel = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded.' });
    }

    const workbook = xlsx.read(req.file.buffer, { type: 'buffer' });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = xlsx.utils.sheet_to_json(sheet, { defval: '' });

    if (rows.length === 0) {
      return res.status(400).json({ error: 'Excel file is empty.' });
    }

    const requiredColumns = ['Employee ID', 'Company Name', 'Supervisor First Name', 'Supervisor Last Name', 'Position', 'Email'];
    const headers = Object.keys(rows[0]);
    const missing = requiredColumns.filter((c) => !headers.includes(c));
    if (missing.length > 0) {
      return res.status(400).json({ error: `Missing columns: ${missing.join(', ')}` });
    }

    const results = { success: 0, failed: 0, errors: [] };
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        const employeeId = String(row['Employee ID']).trim();
        const companyName = String(row['Company Name']).trim();
        const firstName = String(row['Supervisor First Name']).trim();
        const lastName = String(row['Supervisor Last Name']).trim();
        const position = String(row['Position']).trim();
        const email = String(row['Email']).trim();
        const department = String(row['Department'] || '').trim();
        const phone = String(row['Phone Number'] || '').trim();

        if (!employeeId || !companyName || !firstName || !lastName || !position || !email) {
          results.failed++;
          results.errors.push({ row: i + 2, error: 'Missing required fields' });
          continue;
        }

        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
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

        const tempPassword = Math.random().toString(36).slice(-12);
        const hashedPassword = await bcrypt.hash(tempPassword, 10);

        const userResult = await client.query(
          `INSERT INTO users (email, password, role, phone, status)
           VALUES ($1, $2, 'supervisor', $3, 'pending')
           RETURNING id`,
          [email, hashedPassword, phone || null]
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
    res.status(500).json({ error: 'Server error during upload.' });
  }
};

const uploadCoordinatorsExcel = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded.' });
    }

    const workbook = xlsx.read(req.file.buffer, { type: 'buffer' });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = xlsx.utils.sheet_to_json(sheet, { defval: '' });

    if (rows.length === 0) {
      return res.status(400).json({ error: 'Excel file is empty.' });
    }

    const requiredColumns = ['Coordinator ID', 'First Name', 'Last Name', 'Email', 'Department', 'Position'];
    const headers = Object.keys(rows[0]);
    const missing = requiredColumns.filter((c) => !headers.includes(c));

    if (missing.length > 0) {
      return res.status(400).json({
        error: `Missing columns: ${missing.join(', ')}`,
      });
    }

    const results = {
      success: 0,
      failed: 0,
      errors: [],
    };

    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];

        const coordinatorId = String(row['Coordinator ID']).trim();
        const firstName = String(row['First Name']).trim();
        const lastName = String(row['Last Name']).trim();
        const email = String(row['Email']).trim();
        const department = String(row['Department']).trim();
        const position = String(row['Position']).trim();
        const phone = String(row['Phone Number'] || '').trim();

        // Validate required fields
        if (
          !coordinatorId ||
          !firstName ||
          !lastName ||
          !email ||
          !department ||
          !position
        ) {
          results.failed++;
          results.errors.push({
            row: i + 2,
            error: 'Missing required fields',
          });
          continue;
        }

        // Validate email
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

        if (!emailRegex.test(email)) {
          results.failed++;
          results.errors.push({
            row: i + 2,
            error: `Invalid email: ${email}`,
          });
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

        const tempPassword = Math.random().toString(36).slice(-12);
        const hashedPassword = await bcrypt.hash(tempPassword, 10);

        // Insert coordinator in users table
        const userResult = await client.query(
          `INSERT INTO users (email, password, role, phone, status)
           VALUES ($1, $2, 'coordinator', $3, 'pending')
           RETURNING id`,
          [email, hashedPassword, phone || null]
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
      error: 'Server error during upload.',
    });
  }
};

module.exports = {
  uploadTeachersExcel,
  uploadSupervisorsExcel,
  uploadCoordinatorsExcel,
};
