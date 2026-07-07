const xlsx = require('xlsx');
const bcrypt = require('bcryptjs');
const pool = require('../../db');

const uploadStudentsExcel = async (req, res) => {
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

    const requiredColumns = ['Student ID', 'First Name', 'Last Name', 'Email'];
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
        const studentId = String(row['Student ID']).trim();
        const firstName = String(row['First Name']).trim();
        const lastName = String(row['Last Name']).trim();
        const email = String(row['Email']).trim();
        const middleName = String(row['Middle Name'] || '').trim();
        const gradeLevel = String(row['Grade Level'] || '').trim();
        const section = String(row['Section'] || '').trim();
        const strand = String(row['Strand'] || '').trim();
        const school = String(row['School'] || '').trim();
        const contact = String(row['Contact Number'] || '').trim();
        const gender = String(row['Gender'] || '').trim();

        if (!studentId || !firstName || !lastName || !email) {
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

        const existing = await client.query('SELECT id FROM users WHERE email = $1', [email]);
        if (existing.rows.length > 0) {
          results.failed++;
          results.errors.push({ row: i + 2, error: `Duplicate email: ${email}` });
          continue;
        }

        const existingStudentId = await client.query(
          'SELECT id FROM students WHERE student_number = $1',
          [studentId]
        );
        if (existingStudentId.rows.length > 0) {
          results.failed++;
          results.errors.push({ row: i + 2, error: `Duplicate student ID: ${studentId}` });
          continue;
        }

        const tempPassword = Math.random().toString(36).slice(-12);
        const hashedPassword = await bcrypt.hash(tempPassword, 10);

        const userResult = await client.query(
          `INSERT INTO users (email, password, role, phone, status)
           VALUES ($1, $2, 'student', $3, 'pending')
           RETURNING id`,
          [email, hashedPassword, contact || null]
        );

        const userId = userResult.rows[0].id;

        await client.query(
          `INSERT INTO students
            (user_id, student_number, first_name, last_name, middle_name, grade_level,
             section, track_strand, school, contact_number, gender, email)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
          [
            userId,
            studentId,
            firstName,
            lastName,
            middleName || null,
            gradeLevel || null,
            section || null,
            strand || null,
            school || null,
            contact || null,
            gender || null,
            email,
          ]
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
      message: `Upload complete. ${results.success} students added, ${results.failed} failed.`,
      results,
    });
  } catch (err) {
    console.error('Student Excel upload error:', err);
    res.status(500).json({ error: 'Server error during upload.' });
  }
};

module.exports = { uploadStudentsExcel };
