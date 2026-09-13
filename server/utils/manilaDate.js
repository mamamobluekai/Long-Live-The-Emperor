// Single source of truth for date helpers. All "today" / "now" calculations
// in this server go through this file to avoid timezone drift between
// Node.js (which uses OS TZ) and PostgreSQL (which uses session TZ).
//
// Usage:
//   const { nowInManila, nowInManilaDateOnly, isValidManilaDate } = require('../utils/manilaDate');
//   const today = nowInManilaDateOnly(); // 'YYYY-MM-DD'

const TZ = 'Asia/Manila';

function dateOnly(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// "now" as an ISO string anchored to Asia/Manila wall-clock.
function nowInManila() {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: TZ,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(new Date());
  const map = {};
  for (const p of parts) map[p.type] = p.value;
  return `${map.year}-${map.month}-${map.day}T${map.hour}:${map.minute}:${map.second}+08:00`;
}

// Today as 'YYYY-MM-DD' in Asia/Manila.
function nowInManilaDateOnly() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const map = {};
  for (const p of parts) map[p.type] = p.value;
  return `${map.year}-${map.month}-${map.day}`;
}

// Validates that a string is a real YYYY-MM-DD calendar date.
function isValidManilaDate(s) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(s))) return false;
  const [y, m, d] = s.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return (
    dt.getUTCFullYear() === y &&
    dt.getUTCMonth() + 1 === m &&
    dt.getUTCDate() === d
  );
}

module.exports = {
  TZ,
  dateOnly,
  nowInManila,
  nowInManilaDateOnly,
  isValidManilaDate,
};