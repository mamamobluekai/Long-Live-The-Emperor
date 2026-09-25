-- Make document_types editable/manageable by coordinators.
-- Requirements become data-driven instead of hardcoded in application code.
--
--   is_active  : soft delete. Inactive rows stay for history/link integrity but
--                are hidden from checklists, upload pickers, and progress math.
--   sort_order : explicit ordering for the checklist / upload UI.
--   description: optional helper text shown to coordinators.

ALTER TABLE document_types
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS sort_order INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS description TEXT;

-- Seed sort_order from the original insertion order so nothing visually jumps
-- for the 10 default requirements.
WITH ordered AS (
  SELECT id, ROW_NUMBER() OVER (ORDER BY id) * 10 AS seq
  FROM document_types
)
UPDATE document_types dt
SET sort_order = ordered.seq
FROM ordered
WHERE dt.id = ordered.id
  AND dt.sort_order = 0;

CREATE INDEX IF NOT EXISTS idx_document_types_active
  ON document_types (is_active, sort_order);
