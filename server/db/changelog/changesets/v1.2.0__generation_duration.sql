--liquibase formatted sql
-- InterviewIQ v1.2.0 — Generation Duration Tracking
-- Records how many seconds Claude took to generate each kit.
-- Displayed in the kit header as "Generated in Xm Ys".
-- NULL for kits generated before this migration.

--changeset interviewiq:1.2.0-generation-seconds labels:v1.2.0 comment:Store generation wall-clock time in seconds for display in kit header
ALTER TABLE interview_kits
  ADD COLUMN IF NOT EXISTS generation_seconds INTEGER;
--rollback ALTER TABLE interview_kits DROP COLUMN IF EXISTS generation_seconds;
