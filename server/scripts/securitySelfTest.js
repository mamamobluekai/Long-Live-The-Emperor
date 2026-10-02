// Security self-test.
//
// A lightweight, dependency-free sanity check for the pure (non-DB) helpers
// added by the security hardening work. It does NOT touch the database, so it
// can run anywhere (`node scripts/securitySelfTest.js`) and is safe in CI.
//
// It verifies:
//   - sanitize: HTML escaping, tag stripping, injection detection
//   - uploadGuard: magic-byte / extension / MIME decisions
//   - generateToken: tokens are signed, carry a jti, and verify with the pinned
//     algorithm; forged `alg:none` tokens are rejected
//
// Exit code is non-zero when any assertion fails, so it can gate a build.
const assert = require('assert');

let passed = 0;
const failures = [];

function test(name, fn) {
  try {
    fn();
    passed += 1;
    console.log(`  ok  - ${name}`);
  } catch (err) {
    failures.push({ name, message: err.message });
    console.error(`FAIL  - ${name}: ${err.message}`);
  }
}

// --- sanitize -----------------------------------------------------------------
const { escapeHtml, stripTags, detectInjection } = require('../utils/sanitize');

test('escapeHtml neutralises script tags', () => {
  const out = escapeHtml('<script>alert(1)</script>');
  assert(!out.includes('<script>'), 'script tag survived escaping');
  assert(out.includes('&lt;script&gt;'), 'expected escaped entity');
});

test('stripTags removes markup and javascript: URLs', () => {
  assert.strictEqual(stripTags('<b>hi</b>'), 'hi');
  assert(!stripTags('javascript:alert(1)').includes('javascript:'));
  assert(!stripTags('<img src=x onerror=alert(1)>').includes('onerror'));
});

test('detectInjection flags SQLi payloads', () => {
  const findings = detectInjection({ email: "' OR 1=1 --" });
  assert(findings.some((f) => f.category === 'sqli'), 'expected sqli finding');
});

test('detectInjection flags XSS payloads', () => {
  const findings = detectInjection({ note: '<script>alert(1)</script>' });
  assert(findings.some((f) => f.category === 'xss'), 'expected xss finding');
});

test('detectInjection flags path traversal', () => {
  const findings = detectInjection({ path: '../../etc/passwd' });
  assert(findings.some((f) => f.category === 'traversal'), 'expected traversal finding');
});

test('detectInjection leaves benign input alone', () => {
  const findings = detectInjection({ name: 'Maria Santos', email: 'maria@example.com' });

// --- uploadGuard rules --------------------------------------------------------
const { uploadGuard } = require('../middleware/uploadGuard');

// Build a fake express response recorder.
function mockRes() {
  return {
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.body = payload; return this; },
  };
}

// A tiny valid PNG header (magic bytes only) plus filler.
const PNG_HEADER = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
const PDF_HEADER = Buffer.concat([Buffer.from('%PDF-1.4'), Buffer.alloc(8)]);

// Small async wrapper so async guards can be asserted too.
async function asyncTest(name, fn) {
  try {
    await fn();
    passed += 1;
    console.log(`  ok  - ${name}`);
  } catch (err) {
    failures.push({ name, message: err.message });
    console.error(`FAIL  - ${name}: ${err.message}`);
  }
}

async function runUploadTests() {
  await asyncTest('uploadGuard accepts a real PNG for the image category', async () => {
    const guard = uploadGuard(['image']);
    const req = { file: { originalname: 'photo.png', mimetype: 'image/png', buffer: PNG_HEADER, size: PNG_HEADER.length } };
    const res = mockRes();
    let nextCalled = false;
    await guard(req, res, () => { nextCalled = true; });
    assert(nextCalled, `expected next(), got status ${res.statusCode}`);
  });

  await asyncTest('uploadGuard rejects an executable disguised as an image', async () => {
    const guard = uploadGuard(['image']);
    // .png extension + image/png mime, but the bytes are an MZ/PE, not a PNG.
    const req = {
      file: { originalname: 'evil.png', mimetype: 'image/png', buffer: Buffer.from([0x4d, 0x5a, 0x90, 0x00]), size: 4 },
      user: { id: 1 },
    };
    const res = mockRes();
    let nextCalled = false;
    await guard(req, res, () => { nextCalled = true; });
    assert(!nextCalled, 'malicious file was allowed through');
    assert.strictEqual(res.statusCode, 400, 'expected 400 rejection');
  });

  await asyncTest('uploadGuard rejects a disallowed extension', async () => {
    const guard = uploadGuard(['image']);
    const req = {
      file: { originalname: 'shell.php', mimetype: 'image/png', buffer: PNG_HEADER, size: PNG_HEADER.length },
      user: { id: 1 },
    };
    const res = mockRes();
    let nextCalled = false;
    await guard(req, res, () => { nextCalled = true; });
    assert(!nextCalled, '.php upload was allowed');
  });

  await asyncTest('uploadGuard accepts a real PDF for the document category', async () => {
    const guard = uploadGuard(['document']);
    const req = { file: { originalname: 'report.pdf', mimetype: 'application/pdf', buffer: PDF_HEADER, size: PDF_HEADER.length } };
    const res = mockRes();
    let nextCalled = false;
    await guard(req, res, () => { nextCalled = true; });
    assert(nextCalled, 'legitimate PDF was rejected');
  });
}

// --- token signing ------------------------------------------------------------
process.env.JWT_SECRET = process.env.JWT_SECRET || 'self-test-secret-do-not-use-in-prod';
const jwt = require('jsonwebtoken');
const { generateAccessToken, generateRefreshToken, verifyAccessToken } = require('../utils/generateToken');

test('access token carries a jti and verifies', () => {
  const token = generateAccessToken({ id: 5, role: 'admin', email: 'a@b.c' });
  const decoded = verifyAccessToken(token);
  assert(decoded.jti, 'missing jti claim');
  assert.strictEqual(decoded.role, 'admin');
});

test('refresh token returns token + jti and verifies', () => {
  const { token, jti } = generateRefreshToken({ id: 5 });
  assert(jti, 'missing jti');
  const decoded = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ['HS256'] });
  assert.strictEqual(decoded.jti, jti);
});

test('alg:none forgery is rejected', () => {
  const forged = jwt.sign({ id: 1, role: 'admin' }, '', { algorithm: 'none' });
  assert.throws(() => verifyAccessToken(forged), 'forged alg:none token was accepted');
});

// --- run + summary ------------------------------------------------------------
(async () => {
  await runUploadTests();
  console.log(`\n${passed} passed, ${failures.length} failed`);
  if (failures.length) {
    process.exitCode = 1;
  }
})();

  assert.strictEqual(findings.length, 0, 'benign input wrongly flagged');
});
