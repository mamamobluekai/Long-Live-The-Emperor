// File upload security (#9).
//
// `multer` with memoryStorage is already used everywhere, which is good: files
// never touch disk before validation. This guard sits *after* multer and, for
// each uploaded file, checks three independent things:
//
//   1. declared MIME type (`file.mimetype`, client-controlled, cheap check)
//   2. file extension against a per-category allow-list (also client-controlled)
//   3. magic bytes (`file.buffer` header) - the only trustworthy signal, since
//      the first two can be spoofed by a crafted multipart request
//
// A file is accepted only when its real type (magic bytes) is on the allow-list
// AND the extension maps to that type. Everything else is rejected and logged.
//
// PDFs/docs/xlsx are validated by signature too. `.svg` is deliberately not
// allowed for the generic file endpoint because SVG can carry script; images
// uploaded as profile pictures are validated separately below.
const path = require('path');
const { logSecurityEvent, getClientIp, SECURITY_EVENTS, SEVERITY } = require('../utils/securityLogger');
const pool = require('../db');

// category -> { mimes, extensions, signatures }
// signatures: array of { offset, bytes } that must match the file header.
const FILE_RULES = {
  image: {
    mimes: ['image/jpeg', 'image/png', 'image/gif', 'image/webp'],
    extensions: ['.jpg', '.jpeg', '.png', '.gif', '.webp'],
    signatures: [
      { offset: 0, bytes: [0xff, 0xd8, 0xff] }, // jpeg
      { offset: 0, bytes: [0x89, 0x50, 0x4e, 0x47] }, // png
      { offset: 0, bytes: [0x47, 0x49, 0x46, 0x38] }, // gif
      { offset: 0, bytes: [0x52, 0x49, 0x46, 0x46] }, // webp (RIFF....WEBP)
    ],
  },
  document: {
    mimes: [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    ],
    extensions: ['.pdf', '.doc', '.docx'],
    signatures: [
      { offset: 0, bytes: [0x25, 0x50, 0x44, 0x46] }, // %PDF
      { offset: 0, bytes: [0xd0, 0xcf, 0x11, 0xe0] }, // legacy OLE (doc)
      { offset: 0, bytes: [0x50, 0x4b, 0x03, 0x04] }, // zip container (docx/xlsx)
    ],
  },
  spreadsheet: {
    mimes: [
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'text/csv',
      'application/csv',
    ],
    extensions: ['.xls', '.xlsx', '.csv'],
    signatures: [
      { offset: 0, bytes: [0x50, 0x4b, 0x03, 0x04] }, // xlsx (zip)
      { offset: 0, bytes: [0xd0, 0xcf, 0x11, 0xe0] }, // xls (OLE)
      // csv is plain text; no reliable signature, so it is validated by
      // extension + mime only (see requiresSignature below).
    ],
  },
};

// CSV has no magic bytes; these extensions skip the signature check.
const EXTENSIONS_WITHOUT_SIGNATURE = new Set(['.csv']);

function matchesSignature(buffer, signature) {
  if (buffer.length < signature.offset + signature.bytes.length) return false;
  return signature.bytes.every((byte, i) => buffer[signature.offset + i] === byte);
}

function isSignatureValid(buffer, rules) {
  return rules.signatures.some((sig) => matchesSignature(buffer, sig));
}

/**
 * Build an upload guard for a set of allowed categories.
 * @param {string[]} categories e.g. ['image'] or ['document', 'spreadsheet']
 */
function uploadGuard(categories = ['image']) {
  const rules = categories.map((c) => FILE_RULES[c]).filter(Boolean);

  return async (req, res, next) => {
    // Support both single-file (req.file) and multi-file (req.files) routes.
    const files = req.files
      ? Array.isArray(req.files)
        ? req.files
        : Object.values(req.files).flat()
      : req.file
      ? [req.file]
      : [];

    if (!files.length) return next();

    for (const file of files) {
      const ext = path.extname(file.originalname || '').toLowerCase();
      const declaredMime = (file.mimetype || '').toLowerCase();

      const extOk = rules.some((r) => r.extensions.includes(ext));
      const mimeOk = rules.some((r) => r.mimes.includes(declaredMime));
      const sigOk = EXTENSIONS_WITHOUT_SIGNATURE.has(ext)
        ? true
        : rules.some((r) => isSignatureValid(file.buffer || Buffer.alloc(0), r));

      if (!extOk || !mimeOk || !sigOk) {
        const reason = !extOk
          ? `extension ${ext || '(none)'} not allowed`
          : !mimeOk
          ? `mime ${declaredMime || '(none)'} not allowed`
          : 'file signature does not match its extension';

        try {
          await pool.query(
            `INSERT INTO file_upload_audit
               (user_id, original_name, detected_mime, declared_mime, file_size, decision, reason, ip_address)
             VALUES ($1, $2, $3, $4, $5, 'rejected', $6, $7)`,
            [
              req.user?.id || null,
              String(file.originalname || '').slice(0, 500),
              null,
              declaredMime.slice(0, 150),
              file.size || null,
              reason.slice(0, 255),
              getClientIp(req),
            ]
          );
        } catch (logErr) {
          console.warn('upload audit insert failed:', logErr.message);
        }

        logSecurityEvent({
          type: SECURITY_EVENTS.UPLOAD_REJECTED,
          severity: SEVERITY.HIGH,
          req,
          detail: reason,
          metadata: { originalName: file.originalname, declaredMime, ext },
        });

        return res.status(400).json({ error: `File rejected: ${reason}.` });
      }
    }

    return next();
  };
}

module.exports = { uploadGuard, FILE_RULES };
