-- v2.2.0 — Candidate Lifecycle
-- Adds interview_stage (scheduled / in_progress / completed) and soft-delete
-- (removed_at) to candidate_evaluations so candidates can be staged and
-- hidden without permanent data loss.

ALTER TABLE candidate_evaluations
  ADD COLUMN IF NOT EXISTS interview_stage VARCHAR(50) NOT NULL DEFAULT 'scheduled',
  ADD COLUMN IF NOT EXISTS removed_at      TIMESTAMPTZ;

-- Partial index — only non-null rows, keeps active-candidate queries fast
CREATE INDEX IF NOT EXISTS candidate_evaluations_removed_idx
  ON candidate_evaluations(removed_at)
  WHERE removed_at IS NOT NULL;
