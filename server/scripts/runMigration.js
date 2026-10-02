// Migration runner.
//
// Applies a .sql file through the same `pg` pool the app uses, so it works
// without requiring `psql` to be installed or on PATH. The whole file runs in
// a single transaction: if any statement fails, everything rolls back and the
// process exits non-zero.
//
// Usage:
//   node scripts/runMigration.js db/migrations/026_security_hardening.sql
const fs = require('fs');
const path = require('path');

require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const pool = require('../db');

async function main() {
  const relPath = process.argv[2];
  if (!relPath) {
    console.error('Usage: node scripts/runMigration.js <path-to-sql-file>');
    process.exit(1);
  }

  const filePath = path.isAbsolute(relPath) ? relPath : path.join(__dirname, '..', relPath);
  if (!fs.existsSync(filePath)) {
    console.error(`Migration file not found: ${filePath}`);
    process.exit(1);
  }

  const sql = fs.readFileSync(filePath, 'utf8');
  console.log(`Applying ${path.basename(filePath)} ...`);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(sql);
    await client.query('COMMIT');
    console.log('Migration applied successfully.');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Migration failed, rolled back:', err.message);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error('Unexpected error:', err.message);
  process.exit(1);
});
