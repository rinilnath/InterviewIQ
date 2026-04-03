--liquibase formatted sql
-- InterviewIQ v1.4.0 — Shared Kits
-- Adds an is_shared flag so completed kits can be published org-wide.
-- A shared kit is visible on the /shared page to all authenticated users.
-- Only the owner (or admin) can toggle sharing; only completed kits can be shared.

--changeset interviewiq:1.4.0-is-shared labels:v1.4.0 comment:Flag — true means the kit is visible to all users on the Shared Kits page
ALTER TABLE interview_kits
  ADD COLUMN IF NOT EXISTS is_shared BOOLEAN NOT NULL DEFAULT false;
--rollback ALTER TABLE interview_kits DROP COLUMN IF EXISTS is_shared;

--changeset interviewiq:1.4.0-shared-index labels:v1.4.0 comment:Partial index for the shared kits list query (is_shared=true, completed, not deleted)
CREATE INDEX IF NOT EXISTS idx_interview_kits_shared
  ON interview_kits(created_at DESC)
  WHERE is_shared = true AND deleted_at IS NULL AND status = 'completed';
--rollback DROP INDEX IF EXISTS idx_interview_kits_shared;
