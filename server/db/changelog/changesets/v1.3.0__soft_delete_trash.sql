--liquibase formatted sql
-- InterviewIQ v1.3.0 — Soft Delete / Trash
-- Deletes become soft-deletes: deleted_at is stamped; rows remain queryable.
-- Trash lifetime is 30 days from deleted_at; a scheduled cleanup job (or
-- on-demand via GET /trash) permanently removes rows older than 30 days.
-- Users see a warning banner 24 h before any item expires.

--changeset interviewiq:1.3.0-deleted-at labels:v1.3.0 comment:Soft-delete timestamp — NULL means the row is active
ALTER TABLE interview_kits
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
--rollback ALTER TABLE interview_kits DROP COLUMN IF EXISTS deleted_at;

--changeset interviewiq:1.3.0-deleted-by labels:v1.3.0 comment:Track which user performed the delete
ALTER TABLE interview_kits
  ADD COLUMN IF NOT EXISTS deleted_by UUID REFERENCES users(id);
--rollback ALTER TABLE interview_kits DROP COLUMN IF EXISTS deleted_by;

--changeset interviewiq:1.3.0-deleted-index labels:v1.3.0 comment:Partial index for active rows (deleted_at IS NULL) — speeds up all standard list queries
CREATE INDEX IF NOT EXISTS idx_interview_kits_active
  ON interview_kits(generated_by, created_at DESC)
  WHERE deleted_at IS NULL;
--rollback DROP INDEX IF EXISTS idx_interview_kits_active;

--changeset interviewiq:1.3.0-trash-cleanup-index labels:v1.3.0 comment:Index to efficiently find rows eligible for permanent deletion
CREATE INDEX IF NOT EXISTS idx_interview_kits_deleted_at
  ON interview_kits(deleted_at)
  WHERE deleted_at IS NOT NULL;
--rollback DROP INDEX IF EXISTS idx_interview_kits_deleted_at;
