require('dotenv').config();
const jwt = require('jsonwebtoken');
const p = require('./db');
(async () => {
  const r = await p.query("SELECT id, email, role FROM users WHERE role='student' LIMIT 1");
  const u = r.rows[0];
  const token = jwt.sign({ id: u.id, email: u.email, role: u.role }, process.env.JWT_SECRET, { expiresIn: '1h' });
  console.log(token);
})();
