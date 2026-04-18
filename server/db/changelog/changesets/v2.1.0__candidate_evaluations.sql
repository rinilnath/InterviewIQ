-- v2.1.0 — Candidate Evaluations
-- Decouples scoring from interview_kits so one kit can be used for
-- multiple candidates. Each candidate gets an independent evaluation record
-- with their own scores_json, overall_score and pipeline status.

CREATE TABLE IF NOT EXISTS candidate_evaluations (
  id                        UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  kit_id                    UUID          NOT NULL REFERENCES interview_kits(id) ON DELETE CASCADE,
  candidate_name            VARCHAR(255)  NOT NULL,
  candidate_role            VARCHAR(255),
  candidate_experience_years INTEGER,
  scores_json               JSONB         NOT NULL DEFAULT '{}',
  overall_score             NUMERIC(3,1),
  result_status             VARCHAR(50)   NOT NULL DEFAULT 'in_progress',
  interviewed_by            UUID          REFERENCES users(id) ON DELETE SET NULL,
  created_at                TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at                TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS candidate_evaluations_kit_id_idx ON candidate_evaluations(kit_id);
CREATE INDEX IF NOT EXISTS candidate_evaluations_interviewed_by_idx ON candidate_evaluations(interviewed_by);

-- Migrate existing candidate rows from interview_kits into candidate_evaluations.
-- Scores were embedded in output_json — we skip migrating them (output_json is
-- still readable; old kits can be re-scored by adding a new candidate evaluation).
INSERT INTO candidate_evaluations
  (kit_id, candidate_name, candidate_role, candidate_experience_years, result_status, interviewed_by, created_at)
SELECT
  id,
  candidate_name,
  candidate_role,
  candidate_experience_years,
  COALESCE(candidate_status, 'in_progress'),
  generated_by,
  created_at
FROM interview_kits
WHERE candidate_name IS NOT NULL;

-- Remove candidate-specific columns that now live in candidate_evaluations
ALTER TABLE interview_kits DROP COLUMN IF EXISTS candidate_name;
ALTER TABLE interview_kits DROP COLUMN IF EXISTS candidate_role;
ALTER TABLE interview_kits DROP COLUMN IF EXISTS candidate_experience_years;
ALTER TABLE interview_kits DROP COLUMN IF EXISTS candidate_status;
ALTER TABLE interview_kits DROP COLUMN IF EXISTS scores_json;
