require('dotenv').config();


const { Pool, types } = require('pg');

// DATE oid = 1082.
// node-postgres's built-in parser for DATE columns constructs a JS Date via
// the LOCAL timezone constructor — new Date(year, month-1, day). On a server
// whose OS timezone is Asia/Manila (UTC+8), a DATE value of '2026-08-31'
// becomes a JS Date for "Aug 31, 00:00:00 Manila time" → '2026-08-30T16:00:00Z'
// in UTC. Any downstream code that reads .getUTCDate(), .toISOString(), or
// otherwise treats that Date as UTC then sees the WRONG calendar day (Aug 30).
//
// DATE columns carry no time-of-day or timezone, so we return the raw
// 'YYYY-MM-DD' string as-is. This keeps the calendar day intact regardless of
// server timezone. Existing instanceof-Date branches in callers become defensive
// fallbacks; the String(value).slice(0,10) path handles the normal case.
types.setTypeParser(1082, (val) => (val === null ? val : String(val)));

const pool = new Pool({
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  database: process.env.DB_NAME,
});

pool.on('error', (err) => {
  console.error('Unexpected database error:', err);
  process.exit(-1);
});

module.exports = pool;
