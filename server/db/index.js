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

// Connection configuration.
//
// Preferred: a single DATABASE_URL connection string, exactly as Supabase's
// dashboard hands it to you (Project Settings -> Database -> Connection string
// -> Session pooler). This carries host, port, user, password and database in
// one value, so no field has to be split up (and no region has to be guessed):
//
//   DATABASE_URL=postgresql://postgres.<ref>:<password>@aws-0-<region>.pooler.supabase.com:5432/postgres
//
// Fallback: the discrete DB_HOST / DB_PORT / DB_USER / DB_PASSWORD / DB_NAME
// variables, which is what a local Postgres (127.0.0.1) uses.
//
// SSL: Supabase (and any remote Postgres) requires TLS. It is enabled
// automatically when DATABASE_URL is present or when the host is not localhost.
// Override explicitly with DB_SSL=true/false if needed.
const isLocalHost = ['localhost', '127.0.0.1', '::1'].includes(String(process.env.DB_HOST || '').toLowerCase());

const useSsl =
  process.env.DB_SSL != null
    ? String(process.env.DB_SSL).toLowerCase() === 'true'
    : Boolean(process.env.DATABASE_URL) || !isLocalHost;

const poolConfig = process.env.DATABASE_URL
  ? { connectionString: process.env.DATABASE_URL }
  : {
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      host: process.env.DB_HOST,
      port: process.env.DB_PORT,
      database: process.env.DB_NAME,
    };

if (useSsl) {
  // Supabase's pooler presents a certificate that node-postgres will not verify
  // against the local CA bundle, so verification is relaxed here (the transport
  // is still encrypted).
  poolConfig.ssl = { rejectUnauthorized: false };
}

const pool = new Pool(poolConfig);

pool.on('error', (err) => {
  console.error('Unexpected database error:', err);
  process.exit(-1);
});

module.exports = pool;
