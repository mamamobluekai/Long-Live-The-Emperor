# Plan: Global Batch Switcher for Teacher Dashboard (Live Map stays batch-agnostic)

## Goal
Add a batch switcher in the teacher dashboard sidebar. One selection drives **all** batch-scoped data (students, attendance, documentation, evaluations, reports, overview stats) and is remembered across reloads.

**Exception — Live Map is NOT batch-scoped.** The Live Map must keep showing students from **all** batches the teacher handles at the same time, with each student's marker colored by their batch so the teacher can tell the batches apart. The sidebar switcher does not filter the map.

## Current state (verified)
- `client/src/hooks/useTeacherBatch.js` loads all assigned batches via `GET /coordinator/teacher-batches/me` and persists the selection in `localStorage` key `wim-teacher-batch-id`.
- `TeacherBatchPicker.jsx` is rendered **only** in `LiveMap.jsx:372` and `TeacherAttendance.jsx:174`.
- **Core defect:** `useTeacherBatch` uses local `useState` per call site. Every consumer (`TeacherOverview.jsx:52`, `TeacherStudents`, `TeacherReports`, `TeacherStudentDocumentation`, `TeacherAppeals`, `TeacherBatchPicker`) gets its own independent state instance, so a selection change in one component does not update its siblings — they resync only on remount/navigation, and each mount re-fetches the batch list.
- Live Map today: single `selectedBatchId`, `getBatchCurrentLocations(batchId)` fetch + 30s poll, one socket room, and marker color driven purely by check-in status (`makeAvatarIcon`, `LiveMap.jsx:121-152`).
- Server already authorizes per-batch access (`server/utils/batchAccess.js`), so no new endpoints are required — the map can call the existing endpoint once per assigned batch.
- Sidebar is a static link list (`TeacherSidebar.jsx`) rendered into `DashboardLayout` (`TeacherDashboard.jsx:24`).

## Plan

### 1. Shared state (fixes the sync defect)
- Create `client/src/context/TeacherBatchContext.jsx` (or convert `useTeacherBatch.js` into a provider + consumer hook).
  - `TeacherBatchProvider` owns `batches`, `selectedId`, `loading`, `error`, `selectBatch`, `reload`.
  - Fetch the batch list once per session; keep `localStorage` persistence (existing `STORAGE_KEY`).
  - Validate the persisted id against the fetched list; fall back to the first batch (existing behavior).
  - Expose the same return shape as today (`batchId`, `batchLabel`, `batches`, `selectedId`, `selectBatch`, `loading`, `error`, `reload`) so no page signature changes.
  - Stable `useCallback` identity for `selectBatch` so consumer effects depending on `batchId` only re-run on real changes.
  - Listen for the `storage` event so a switch in one browser tab syncs the other.

### 2. Mount the provider once
- Wrap `<Routes>` in `TeacherDashboard.jsx` with `TeacherBatchProvider` (inside `DashboardLayout`) so the sidebar switcher and all routes share one state instance.
- `useTeacherBatch()` becomes a consumer of the context, with a safe fallback if used outside the provider (e.g. Announcements or other shells).

### 3. Sidebar switcher UI
- Add a batch switcher block to `TeacherSidebar.jsx` above the nav links, styled in a new `TeacherSidebarBatch.module.css` (or extend `TeacherDashboard.module.css`).
- Compact `select` + "Batch" label; show the current batch label. Disabled/skeleton state while loading, error state with retry when `error` is set.
- Hide (or render as a static read-only label) when the teacher has only one batch.
- Label the control clearly as the scope for dashboard data, e.g. "Batch (dashboard data)" — a tooltip should note that the Live Map always shows all batches.
- Keep `TeacherBatchPicker` for the remaining in-page usage in `TeacherAttendance.jsx`, reimplemented as a thin wrapper over the shared context so both controls stay in sync. **Remove its usage from `LiveMap.jsx`.**

### 4. Live Map shows all batches, colored by batch
Modify `LiveMap.jsx` only as follows — no other behavior (layers, locate-me, popups, schedule messaging, Marinduque bounds filtering) changes.
- Stop reading the selected batch: use `batches` from the shared hook instead of `batchId`/`batchLabel`.
- Fetch locations for **every** assigned batch: `Promise.all(batches.map(b => getBatchCurrentLocations(b.id, token, { signal })))` in the existing effect, keyed on `batches.map(b => b.id).join(',')` instead of `selectedBatchId`. Keep the single 30s poll and the existing abort/retry logic. Tag each returned student with its batch (`batch_id`, `batch_label`) before merging, and guard against a student appearing twice.
- Socket: on connect, emit `student:join_batch` for every batch id (replace the single-room joins at `LiveMap.jsx:273` and `:350-355`); keep the existing `student:location_update` / `checked_in` / `checked_out` handlers, matching on `student_id`.
- Per-batch color palette: add a fixed `BATCH_COLORS` array and a stable `colorForBatch(batchId)` helper (e.g. assign by index in the sorted batch list so a batch keeps its color across reloads).
  - Avatar circle fill becomes the **batch color**; keep check-in status readable another way — a small status dot (existing green/grey dot) and/or a dashed/hollow ring for "not checked in", so status is not lost when color is used for batch identity.
  - Add a batch color chip to the marker label or popup (`Batch: <label>`), and show `batch_label` in the popup meta rows.
- Legend: keep the checked-in / not-checked-in counts, and add one legend entry per assigned batch showing its color swatch, label, and student count.
- Header: replace the "Batch: {label}" tag with a summary like "All batches (N)" plus a per-batch count; drop `TeacherBatchPicker` from the header.
- Empty states: no assigned batches → "You have not been assigned to a batch yet"; batches exist but no locations → keep the existing schedule message.
- Reuse the existing CSS module (`LiveMap.module.css`) for the new legend chips; the avatars are inline-styled HTML strings in `makeAvatarIcon`, so extend the `color`/`border` computation there.

### 5. Data reload on switch (other pages)
- Every remaining batch-scoped page already keys its fetch on `batchId` / `selectedBatchId`; confirm each fetch effect lists `batchId` in its dependency array and resets local state on change so stale rows from the previous batch are not shown.
- Target files: `TeacherOverview.jsx`, `TeacherStudents.jsx`, `TeacherAttendance.jsx`, `AttendanceReportsRecords.jsx`, `TeacherStudentDocumentation.jsx`, `TeacherStudentEvaluations.jsx`, `TeacherReports.jsx`, `TeacherReportsConcerns.jsx`, `TeacherAppeals.jsx`, `TeacherSettings.jsx`.
- `LiveMap.jsx` is explicitly excluded from this list.
- Any page that is intentionally batch-agnostic (announcements, group chat) should stay so and be documented.

### 6. Empty / edge states
- Zero assigned batches: sidebar shows "No batch assigned"; batch-scoped pages show an empty-state message instead of firing requests with `batchId = null`; the map shows its existing unassigned message.
- Selection no longer valid (teacher unassigned elsewhere): fall back to the first batch and clear the stale `localStorage` value.
- Two batches with the same label: the legend and picker must disambiguate (append year/short id if available).

### 7. Verification
- Manual: with two assigned batches, switch in the sidebar and confirm students, attendance, documentation, evaluations, reports, and overview counts all update; reload and confirm the selection persists; confirm the inline picker in Attendance Monitor matches the sidebar.
- Live Map: confirm all batches' students appear together, each marker uses its batch color, the status dot still distinguishes checked-in, and the legend lists one entry per batch with correct counts; confirm the map does not change when the sidebar selection changes.
- Multi-tab: confirm a switch in one tab syncs the other.
- Run the repo's lint and typecheck/build commands before finishing.

## Out of scope
- New server endpoints or schema changes (authorization and data already exist; the map reuses `getBatchCurrentLocations` per batch).
- Reassigning teachers to batches (coordinator-only flow, already built).
