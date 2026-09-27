# Plan: Data Visualizations for the Teacher Attendance Monitor

## Context
The Attendance Monitor currently shows: live status banner → Work Immersion Duration panel
(supervisor-set attendance windows + "View Immersion Schedule" and "View Attendance Records"
buttons, both opening modals). Everything quantitative is hidden behind a modal.

**All the data needed is already available client-side.** `getBatchAttendanceReport(batchId)`
(`TeacherAttendanceRecords.jsx`) returns `dates[]` plus one record per student per date with
`status` (`checked_in` / `checked_out` / `present` / `absent` / `late`), and appeal flags
(`appeal_time_in_id`, `appeal_time_out_id`). `recharts` ^3.10.1 is already a dependency, so no
new packages are needed.

Proposed additions go **below** the duration panel, in a new "Attendance Insights" section.

---

## Recommendation (in priority order)

### 1. Daily attendance trend — stacked bar (highest value)
- **What:** one bar per immersion date, stacked Present vs Absent, with an appeal marker.
- **Why:** answers "are students showing up consistently, and on which days do they miss?" at a
  glance, which is the question the records grid makes a teacher answer by scanning 10 columns.
- **Data:** derive from the report records already fetched — count statuses per date.
- **Chart:** `BarChart` with two `Bar` stacks; keep it under ~180px tall so it doesn't push the
  page down.

### 2. Immersion progress per student — progress bars
- **What:** one row per student: name, a bar showing `days attended / required days`, and a
  right-aligned percentage. Color tiers: green ≥ 90%, amber 75–89%, red < 75%.
- **Why:** the SHS requirement is attendance over N immersion days; a single glance tells the
  teacher who is at risk of failing before the end of the schedule.
- **Data:** per student, count non-`absent` dates vs `dates.length`.
- **Chart:** plain CSS flex bars (no chart lib) — faster and lighter than a chart for this.

### 3. Per-student attendance rate — horizontal bar list
- **What:** sorted descending list of students with their attendance rate, lowest first so
  at-risk students surface.
- **Why:** complements #2 (absolute progress) with a comparative view; makes it easy to spot
  outliers.
- **Data:** same aggregation as #2.
- **Chart:** CSS bars again, or a single horizontal `BarChart` if the row count is small.

### 4. Status breakdown — donut
- **What:** Present / Absent / Late / On-leave split across the whole batch.
- **Why:** a compact summary of overall reliability for reports.
- **Data:** total status counts.
- **Chart:** `PieChart` donut with a centered total.
- **Optional:** low marginal value once #1 exists — include only if the section looks sparse.

### 5. Attendance heatmap — student × date
- **What:** a grid, students as rows, dates as columns, each cell shaded by status.
- **Why:** visually mirrors the records modal and makes patterns (e.g. everyone absent on
  Mondays) obvious.
- **Data:** same records payload.
- **Chart:** CSS grid, not a chart lib.
- **Caution:** this duplicates the modal table, so it's the first thing to cut if the section
  gets too long.

### 6. Appeals summary — small stat strip
- **What:** count of pending appeals and appeals upheld/denied.
- **Why:** the removed "Pending Appeals" stat card carried this; restoring it as one small chip
  keeps that signal without giving it four full cards.
- **Data:** the report records already expose appeal flags; if upheld/denied is needed, the
  appeals endpoint must be joined in.
- **Chart:** none.

---

## Suggested layout

```
┌─ Attendance Insights ────────────────────────────────┐
│  [ Daily attendance trend — stacked bar ]  │  [ donut ]│
├─────────────────────────────────────────────────────┤
│  Immersion progress per student (CSS bars)           │
└─────────────────────────────────────────────────────┘
```
- Wrap in the existing card system: `.card` / `.cardHeader` / `.card::before` from
  `TeacherAttendance.module.css` so it matches the maroon design system.
- Responsive: two columns above 1100px, single column below; on mobile the progress bars
  stack and truncate long names.

---

## Implementation approach

1. **Extract the report data into a hook** — `useTeacherAttendanceReport(batchId, token)` in
   `client/src/hooks/`, returning `{ dates, records, rows, loading, error, refresh }`. Both the
   records modal and the new charts read from it, so the data is fetched once per batch instead
   of twice, and switching batches resets everything in one place.
2. **Add a pure aggregation module** — `client/src/utils/attendanceAnalytics.js` with
   `byDate(records, dates)`, `perStudent(rows, dates)`, `statusTotals(records)`. Unit-testable
   and keeps the components presentational.
3. **New component** — `client/src/pages/dashboards/teacherDashboard/AttendanceInsights.jsx`
   (plus `AttendanceInsights.module.css`), rendering #1, #2, #3, #6. Add #4/#5 only if wanted.
4. **Mount it** in `TeacherAttendance.jsx` below the duration panel, inside the
   `!loading && selectedBatchId` branch, so it follows the sidebar batch and disappears when no
   batch is selected.
5. **Chart styling** — maroon `#8b1e2d` / `#b8394f` for present, soft green `#15803d`, red
   `#b4233b` for absent, amber `#9a5b10` for late, matching the existing badge palette. Axis
   labels small and muted; no gridline clutter.
6. **Empty states** — no schedule, no records, or no students → a single dashed empty state
   instead of three empty charts.

---

## Effort
Items 1–3 are the bulk: roughly one hook, one analytics module, one component, one stylesheet.
Items 4–6 are small. Recharts is already installed, so no dependency changes.

## Suggested starting scope
Ship **#1 (daily trend) + #2 (per-student progress) + #6 (appeals chip)** first — they cover the
questions a teacher actually asks. Add #3 next, and treat #4/#5 as optional.
