--liquibase formatted sql
-- InterviewIQ v1.1.0 — Async Generation Support
-- Adds a lifecycle status field to interview_kits so the API can respond
-- immediately and run Claude generation in the background.
-- Allows output_json to be NULL during the 'generating' phase.

--changeset interviewiq:1.1.0-status-column labels:v1.1.0 comment:Add generation status column — DEFAULT completed keeps existing rows valid
ALTER TABLE interview_kits
  ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'completed';
--rollback ALTER TABLE interview_kits DROP COLUMN IF EXISTS status;

--changeset interviewiq:1.1.0-error-column labels:v1.1.0 comment:Add error_message column for failed generation jobs
ALTER TABLE interview_kits
  ADD COLUMN IF NOT EXISTS error_message TEXT;
--rollback ALTER TABLE interview_kits DROP COLUMN IF EXISTS error_message;

--changeset interviewiq:1.1.0-nullable-output labels:v1.1.0 comment:Allow output_json to be NULL while kit is in generating state
ALTER TABLE interview_kits ALTER COLUMN output_json DROP NOT NULL;
--rollback ALTER TABLE interview_kits ALTER COLUMN output_json SET NOT NULL;

--changeset interviewiq:1.1.0-status-index labels:v1.1.0 comment:Index on status for fast generation-state queries
CREATE INDEX IF NOT EXISTS idx_interview_kits_status ON interview_kits(status);
--rollback DROP INDEX IF EXISTS idx_interview_kits_status;
