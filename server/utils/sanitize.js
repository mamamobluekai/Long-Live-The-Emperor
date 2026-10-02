// Input sanitisation and injection-payload detection helpers.
//
// Two related jobs live here:
//
//   1. `escapeHtml` / `stripTags` / `sanitizeObject` - make user text safe to
//      echo back. React escapes by default, but server-rendered strings (emails,
//      PDFs, Excel exports) do not, so anything that leaves the API and is later
//      rendered as HTML must pass through here.
//
//   2. `detectInjection` - a *detection* signal, not a filter. All SQL in this
//      project is parameterized, so SQL injection is already structurally
//      impossible; this only flags obviously hostile payloads (e.g. classic
//      UNION SELECT / OR 1=1 strings, <script> tags, ../ traversal) so they can
//      be logged and rate-limited. We never rely on it to *prevent* injection.

// Characters that matter when a string is interpolated into HTML/markup.
const HTML_ESCAPES = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#x27;',
  '/': '&#x2F;',
  '`': '&#x60;',
  '=': '&#x3D;',
};

function escapeHtml(value) {
  if (value === null || value === undefined) return value;
  return String(value).replace(/[&<>"'`=/]/g, (char) => HTML_ESCAPES[char]);
}

// Removes anything that looks like a tag or a javascript:/data: URL scheme.
// Used for text that should never legitimately contain markup.
function stripTags(value) {
  if (value === null || value === undefined) return value;
  return String(value)
    .replace(/<[^>]*>/g, '')
    .replace(/javascript:/gi, '')
    .replace(/on\w+\s*=/gi, '')
    .trim();
}

// Recursively walks a request body / params object and returns a new structure
// with every string passed through `transform`. Arrays and nested objects are
// preserved; non-string primitives are left untouched.
function sanitizeObject(input, transform = stripTags, depth = 0) {
  if (depth > 8) return input; // guard against pathological nesting
  if (input === null || input === undefined) return input;
  if (typeof input === 'string') return transform(input);
  if (Array.isArray(input)) return input.map((item) => sanitizeObject(item, transform, depth + 1));
  if (typeof input === 'object') {
    const out = {};
    for (const [key, value] of Object.entries(input)) {
      out[key] = sanitizeObject(value, transform, depth + 1);
    }
    return out;
  }
  return input;
}

// Classic SQL-injection fingerprints. Intentionally aggressive: a false
// positive only produces a log line and a slightly slower request, whereas a
// false negative could hide an attack attempt from the telemetry feed.
const SQLI_PATTERNS = [
  /(\bunion\b[\s\S]{0,20}\bselect\b)/i,
  /(\bselect\b[\s\S]{0,40}\bfrom\b)/i,
  /(\bor\b|\band\b)\s+['"]?\d+['"]?\s*=\s*['"]?\d+/i,
  /('\s*(or|and)\s)/i,
  /(;\s*(drop|delete|update|insert|alter|truncate)\b)/i,
  /(--\s|\/\*|\*\/|#)/,
  /(\bxp_cmdshell\b|\binformation_schema\b|\bsleep\s*\(|\bbenchmark\s*\()/i,
  /(\bwaitfor\s+delay\b|\bpg_sleep\b)/i,
];

// XSS fingerprints: script tags, event handlers, dangerous protocols.
const XSS_PATTERNS = [
  /<\s*script\b/i,
  /<\s*img[^>]+onerror\s*=/i,
  /<\s*svg[^>]+onload\s*=/i,
  /javascript\s*:/i,
  /on(error|load|click|mouseover|focus|submit)\s*=/i,
  /<\s*iframe\b/i,
  /document\.(cookie|domain|location)/i,
  /<\s*body[^>]*onload/i,
];

// Path traversal / local file inclusion fingerprints.
const TRAVERSAL_PATTERNS = [
  /\.\.(\/|\\)/,
  /%2e%2e(%2f|%5c)/i,
  /(\/etc\/passwd|\/proc\/self|c:\\windows)/i,
  /(\.\.\\){2,}/,
];

function matchesAny(value, patterns) {
  if (value === null || value === undefined) return false;
  const text = String(value);
  return patterns.some((pattern) => pattern.test(text));
}

/**
 * Inspect every string in a body/params/query object and classify it.
 * Returns the list of matched categories plus an example fragment so the
 * caller can log something actionable without dumping the whole payload.
 */
function detectInjection(payload) {
  const findings = [];

  const walk = (value, keyPath) => {
    if (value === null || value === undefined) return;
    if (typeof value === 'string') {
      if (matchesAny(value, SQLI_PATTERNS)) {
        findings.push({ category: 'sqli', field: keyPath, sample: value.slice(0, 120) });
      }
      if (matchesAny(value, XSS_PATTERNS)) {
        findings.push({ category: 'xss', field: keyPath, sample: value.slice(0, 120) });
      }
      if (matchesAny(value, TRAVERSAL_PATTERNS)) {
        findings.push({ category: 'traversal', field: keyPath, sample: value.slice(0, 120) });
      }
      return;
    }
    if (Array.isArray(value)) {
      value.forEach((item, index) => walk(item, `${keyPath}[${index}]`));
      return;
    }
    if (typeof value === 'object') {
      for (const [key, child] of Object.entries(value)) {
        walk(child, keyPath ? `${keyPath}.${key}` : key);
      }
    }
  };

  walk(payload, '');
  return findings;
}

module.exports = {
  escapeHtml,
  stripTags,
  sanitizeObject,
  detectInjection,
  SQLI_PATTERNS,
  XSS_PATTERNS,
  TRAVERSAL_PATTERNS,
};
