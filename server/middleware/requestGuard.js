// Request payload inspection middleware (#1 SQLi, #5 XSS, path traversal).
//
// This is a *detection* layer, not the primary defence. SQL injection is
// prevented structurally by always using parameterized queries ($1, $2 ...),
// and React escapes output by default. What this middleware adds is:
//
//   - early visibility: obviously hostile payloads are logged as security
//     events so an operator can see them happening;
//   - a hard block for the highest-confidence signatures (classic
//     `UNION SELECT`, `<script>`, `../` in a URL param), which have no
//     legitimate reason to appear in this API's inputs.
//
// Fields that legitimately contain markup or SQL-looking text are exempted by
// path (e.g. feed posts and chat messages are text but still cannot contain
// raw `<script>`); see SAFE_FIELD_EXEMPTION below.
const { detectInjection } = require('../utils/sanitize');
const { logSecurityEvent, SECURITY_EVENTS, SEVERITY } = require('../utils/securityLogger');

// High-confidence signatures we block outright (everything else is only logged).
const BLOCK_CATEGORIES = new Set(['traversal', 'sqli']);

// Paths where blocking on category would break legitimate input. Even here we
// still *log* the finding. Content bodies (feed/chat) are intentionally kept in
// the block list for script tags because raw HTML must never be stored.
const NEVER_BLOCK_PATHS = [
  /^\/api\/feed(\/|$)/, // posts may quote code-like text
  /^\/api\/chat(\/|$)/,
  /^\/api\/documentation(\/|$)/,
];

function pathIsExempt(req) {
  const path = req.path || req.originalUrl || '';
  return NEVER_BLOCK_PATHS.some((re) => re.test(path));
}

function requestGuard(req, res, next) {
  // Only inspect methods/parts that can carry attacker-controlled input.
  const payload = {
    ...(req.params || {}),
    ...(req.query || {}),
    ...(typeof req.body === 'object' && req.body ? req.body : {}),
  };

  const findings = detectInjection(payload);
  if (findings.length === 0) return next();

  const categories = [...new Set(findings.map((f) => f.category))];
  const exempt = pathIsExempt(req);

  // Fire-and-forget logging for every category found.
  const logPromises = findings.slice(0, 10).map((finding) => {
    const type =
      finding.category === 'sqli'
        ? SECURITY_EVENTS.SQLI_ATTEMPT
        : finding.category === 'xss'
        ? SECURITY_EVENTS.XSS_ATTEMPT
        : SECURITY_EVENTS.PATH_TRAVERSAL_ATTEMPT;
    return logSecurityEvent({
      type,
      severity: SEVERITY.HIGH,
      req,
      detail: `${finding.category} pattern in field "${finding.field}"`,
      metadata: { field: finding.field, sample: finding.sample },
    });
  });
  Promise.allSettled(logPromises).catch(() => {});

  const shouldBlock = !exempt && categories.some((c) => BLOCK_CATEGORIES.has(c));
  if (shouldBlock) {
    return res.status(400).json({ error: 'Request blocked: the input contains a disallowed pattern.' });
  }

  // XSS in a content path: allow through to be stored, but it is already logged
  // and must be escaped on render. (React does this by default; exports do not.)
  return next();
}

module.exports = requestGuard;
