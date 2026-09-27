// Stable per-batch colors used by the teacher Live Map so a teacher handling
// several batches can tell at a glance which batch a student belongs to.
// The color is derived from the batch's position in the sorted batch list, so
// a batch keeps the same color across reloads and across tabs.
export const BATCH_COLORS = [
  '#2563eb',
  '#db2777',
  '#7c3aed',
  '#ea580c',
  '#0891b2',
  '#16a34a',
  '#c026d3',
  '#ca8a04',
  '#4f46e5',
  '#dc2626',
  '#059669',
  '#9333ea',
];

export function colorForBatchIndex(index) {
  if (!Number.isFinite(index) || index < 0) return BATCH_COLORS[0];
  return BATCH_COLORS[index % BATCH_COLORS.length];
}

export function buildBatchColorMap(batches = []) {
  const map = {};
  batches.forEach((batch, index) => {
    map[batch.id] = colorForBatchIndex(index);
  });
  return map;
}
