// Database connection check.
//
//   cd server
//   npm run db:check
//
// Prints WHICH database the app is really talking to and proves the
// connection works (or explains exactly why it does not). Useful after
// switching between local Postgres and Supabase.
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const pool = require('../db');

function mask(value) {
  if (!value) return '(not set)';
  return String(value).replace(/(:\/\/[^:]+:)[^@]+@/, '$1****@');
}

async function main() {
  const usingUrl = Boolean(process.env.DATABASE_URL);

  // Resolve the host we are ACTUALLY connecting to, so the verdict below is
  // based on the real target rather than a stale DB_HOST left over from the
  // local-development fallback.
  let activeHost;
  let activeDb;
  if (usingUrl) {
    try {
      const u = new URL(process.env.DATABASE_URL);
      activeHost = u.hostname;
      activeDb = decodeURIComponent(u.pathname.replace(/^\//, '')) || '(default)';
    } catch {
      activeHost = '(unparseable DATABASE_URL)';
      activeDb = '(unknown)';
    }
  } else {
    activeHost = process.env.DB_HOST || '(not set)';
    activeDb = process.env.DB_NAME || '(not set)';
  }
  const isLocal = ['localhost', '127.0.0.1', '::1'].includes(String(activeHost).toLowerCase());

  console.log('--- Configuration ---');
  if (usingUrl) {
    console.log('Source        : DATABASE_URL');
    console.log('DATABASE_URL  :', mask(process.env.DATABASE_URL));
  } else {
    console.log('Source        : DB_* variables (no DATABASE_URL set)');
    console.log('DB_HOST       :', process.env.DB_HOST || '(not set)');
    console.log('DB_PORT       :', process.env.DB_PORT || '(not set)');
    console.log('DB_NAME       :', process.env.DB_NAME || '(not set)');
    console.log('DB_USER       :', process.env.DB_USER || '(not set)');
  }
  console.log('Target is local :', isLocal);
  console.log('Active host     :', activeHost);
  console.log('Active database :', activeDb);
  console.log('');

  // Fast network probe so a blocked port fails fast instead of hanging.
  const host = activeHost;
  const port = usingUrl
    ? Number(new URL(process.env.DATABASE_URL).port || 5432)
    : Number(process.env.DB_PORT || 5432);

  console.log('--- Network ---');
  const net = require('net');
  const reachable = await new Promise((resolve) => {
    const socket = net.connect({ host, port, timeout: 8000 });
    const done = (ok) => { socket.destroy(); resolve(ok); };
    socket.on('connect', () => done(true));
    socket.on('timeout', () => done(false));
    socket.on('error', () => done(false));
  });
  console.log(`TCP ${host}:${port} :`, reachable ? 'reachable' : 'NOT reachable');
  if (!reachable) {
    console.log('');
    console.log('The server never got a TCP connection, so the pool will fail too.');
    console.log('Common causes:');
    console.log('  - DATABASE_URL is still commented out / host or region is wrong');
    console.log('  - firewall blocks outbound 5432');
    console.log('  - Supabase project is paused or the password is wrong');
  }
  console.log('');

  console.log('--- Database query ---');
  try {
    const res = await pool.query(`
      SELECT current_database()   AS database,
             current_user         AS username,
             inet_server_addr()::text AS server_addr,
             inet_server_port()    AS server_port,
             version()            AS version,
             current_setting('TimeZone') AS timezone,
             (SELECT count(*)::int FROM information_schema.tables
               WHERE table_schema = 'public') AS public_tables
    `);
    const r = res.rows[0];
    console.log('CONNECTED.');
    console.log('  database     :', r.database);
    console.log('  username     :', r.username);
    console.log('  server addr  :', r.server_addr, `port ${r.server_port}`);
    console.log('  timezone     :', r.timezone);
    console.log('  version      :', String(r.version).split(',')[0]);
    console.log('  public tables:', r.public_tables);

    const onRemote = !isLocal;
    console.log('');
    if (onRemote && r.public_tables > 0) {
      console.log('Supabase / remote PostgreSQL - connection is good.');
      if (usingUrl && /pooler\.supabase\.com/i.test(activeHost)) {
        console.log('Using the IPv4 Session pooler (correct for IPv4-only networks).');
      }
      if (r.public_tables < 40) {
        console.log(`Only ${r.public_tables} tables found - the migration may be incomplete.`);
        console.log('Run server/db/migrations/000_supabase_full_migration.sql if needed.');
      }
    } else if (onRemote) {
      console.log('Connected, but the schema is EMPTY - run');
      console.log('server/db/migrations/000_supabase_full_migration.sql on the remote database.');
    } else {
      console.log('Connected to a LOCAL database (not Supabase).');
      console.log('Set DATABASE_URL in server/.env to the Session pooler string to use Supabase.');
    }
    process.exitCode = 0;
  } catch (err) {
    console.log('FAILED:', err.message);
    console.log('  code    :', err.code || '(none)');
    if (err.code === '28P01') console.log('  meaning : wrong username or password');
    if (err.code === '3D000') console.log('  meaning : database does not exist');
    if (err.code === 'ECONNREFUSED') console.log('  meaning : nothing is listening on that host/port');
    if (err.code === 'ENOTFOUND') console.log('  meaning : hostname does not resolve (check region/ref)');
    if (err.code === 'CERT_NOT_VERIFIED' || /certificate/i.test(err.message)) {
      console.log('  meaning : TLS certificate rejected (Supabase pooler cert vs local CA)');
    }
    process.exitCode = 1;
  } finally {
    await pool.end().catch(() => {});
  }
}

main();