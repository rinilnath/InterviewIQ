-- v1.9.0: Candidate info on interview kits + candidate pipeline status
-- Run this in Supabase SQL Editor

ALTER TABLE interview_kits
  ADD COLUMN IF NOT EXISTS candidate_name           VARCHAR(255),
  ADD COLUMN IF NOT EXISTS candidate_experience_years INTEGER,
  ADD COLUMN IF NOT EXISTS candidate_role           VARCHAR(255),
  ADD COLUMN IF NOT EXISTS candidate_status         VARCHAR(50) NOT NULL DEFAULT 'in_progress';
  -- candidate_status is the hiring pipeline status (in_progress / selected / rejected / on_hold)
  -- it is SEPARATE from status (which tracks kit generation: generating / completed / failed / cancelled)

CREATE INDEX IF NOT EXISTS interview_kits_candidate_name_idx   ON interview_kits(candidate_name);
CREATE INDEX IF NOT EXISTS interview_kits_candidate_status_idx ON interview_kits(candidate_status);
