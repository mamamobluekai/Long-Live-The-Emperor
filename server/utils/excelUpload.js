// Shared helpers for the admin Excel user imports (teachers / supervisors /
// coordinators).
//
// Problem this solves: each importer used to hard-code ONE exact header
// spelling, so a perfectly reasonable spreadsheet was rejected with
// "Missing columns: Supervisor First Name, Supervisor Last Name" unless the
// admin renamed the columns to match the code. Excel exports also routinely
// add trailing spaces or underscores.
//
// `parseSheetRows` normalizes whatever headers the file has to canonical keys
// and reports which required columns are genuinely absent.
const xlsx = require('xlsx');

const HEADER_ALIASES = {
  employeeId: ['employee id', 'employeeid', 'employee_id', 'employee no', 'employee number'],
  coordinatorId: ['coordinator id', 'coordinatorid', 'coordinator_id'],
  supervisorId: ['supervisor id', 'supervisorid', 'supervisor_id'],
  firstName: [
    'first name',
    'firstname',
    'first_name',
    'given name',
    'givenname',
    'supervisor first name',
    'teacher first name',
    'coordinator first name',
  ],
  lastName: [
    'last name',
    'lastname',
    'last_name',
    'surname',
    'family name',
    'supervisor last name',
    'teacher last name',
    'coordinator last name',
  ],
  companyName: ['company name', 'companyname', 'company_name', 'company', 'host company', 'business name'],
  position: ['position', 'designation', 'job title', 'title', 'role', 'designation/position'],
  email: ['email', 'email address', 'emailaddress', 'e-mail', 'e-mail address', 'e mail'],
  department: ['department', 'department/strand', 'division', 'strand'],
  phone: ['phone number', 'phone', 'phone_number', 'contact number', 'contact no', 'mobile'],
};

const REQUIRED_BY_TYPE = {
  teachers: ['employeeId', 'firstName', 'lastName', 'email', 'department', 'position'],
  coordinators: ['coordinatorId', 'firstName', 'lastName', 'email', 'department', 'position'],
  supervisors: ['employeeId', 'companyName', 'firstName', 'lastName', 'position', 'email'],
};

const FIELD_LABELS = {
  employeeId: 'Employee ID',
  coordinatorId: 'Coordinator ID',
  supervisorId: 'Supervisor ID',
  firstName: 'First Name',
  lastName: 'Last Name',
  companyName: 'Company Name',
  position: 'Position',
  email: 'Email',
  department: 'Department',
  phone: 'Phone Number',
};

// Reverse map: normalized header -> canonical field key.
const HEADER_LOOKUP = (() => {
  const map = new Map();
  Object.entries(HEADER_ALIASES).forEach(([field, aliases]) => {
    aliases.forEach((alias) => map.set(alias, field));
  });
  // Canonical labels are always valid headers too.
  Object.entries(FIELD_LABELS).forEach(([field, label]) => map.set(label.toLowerCase(), field));
  return map;
})();

function normalizeHeader(header) {
  return String(header || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

/**
 * Read the first sheet of an uploaded workbook and map it to canonical fields.
 *
 * @param {Buffer} buffer multer memory-storage buffer
 * @param {'teachers'|'supervisors'|'coordinators'} type
 * @returns {{ ok: true, rows: object[] } | { ok: false, error: string }}
 */
function parseSheetRows(buffer, type) {
  if (!buffer) return { ok: false, error: 'No file uploaded.' };

  let workbook;
  try {
    workbook = xlsx.read(buffer, { type: 'buffer' });
  } catch {
    return { ok: false, error: 'Could not read the file. Please upload a valid .xlsx or .xls file.' };
  }

  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rawRows = xlsx.utils.sheet_to_json(sheet, { defval: '' });

  if (!rawRows.length) return { ok: false, error: 'Excel file is empty.' };

  // Map every sheet header to a canonical field, ignoring unknown columns.
  const headerMap = [];
  Object.keys(rawRows[0]).forEach((header) => {
    const field = HEADER_LOOKUP.get(normalizeHeader(header));
    if (field && !headerMap.some((h) => h.field === field)) {
      headerMap.push({ header, field });
    }
  });

  const required = REQUIRED_BY_TYPE[type] || [];
  // An ID column saved under a different name still satisfies the requirement
  // (e.g. "Employee ID" on the coordinator sheet, "Supervisor ID" on the
  // supervisor sheet) because they all land in the same profile column.
  const ALTERNATIVES = { coordinatorId: ['employeeId', 'supervisorId'], employeeId: ['supervisorId'] };
  const isMissing = (field) => {
    if (headerMap.some((h) => h.field === field)) return false;
    return !(ALTERNATIVES[field] || []).some((alt) => headerMap.some((h) => h.field === alt));
  };
  const missing = required.filter(isMissing);
  if (missing.length) {
    return {
      ok: false,
      error: `Missing columns: ${missing.map((f) => FIELD_LABELS[f]).join(', ')}`,
    };
  }

  const rows = rawRows.map((raw) => {
    const row = {};
    headerMap.forEach(({ header, field }) => {
      row[field] = String(raw[header] ?? '').trim();
    });
    return row;
  });

  return { ok: true, rows };
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

module.exports = { parseSheetRows, EMAIL_REGEX, FIELD_LABELS, REQUIRED_BY_TYPE };
