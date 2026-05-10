--liquibase formatted sql
-- InterviewIQ v2.3.0 — User Invites
-- Invite-only registration: stores single-use, time-limited invite tokens.

--changeset interviewiq:2.3.0-user_invites labels:v2.3.0 comment:Create user_invites table
CREATE TABLE IF NOT EXISTS user_invites (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  email        TEXT        NOT NULL,
  invited_name TEXT,
  token        TEXT        NOT NULL UNIQUE,
  invited_by   UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at   TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '48 hours'),
  used_at      TIMESTAMPTZ,
  revoked_at   TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
--rollback DROP TABLE IF EXISTS user_invites;

--changeset interviewiq:2.3.0-user_invites-idx-token labels:v2.3.0 comment:Index on invite token
CREATE INDEX IF NOT EXISTS idx_user_invites_token ON user_invites(token);
--rollback DROP INDEX IF EXISTS idx_user_invites_token;

--changeset interviewiq:2.3.0-user_invites-idx-email labels:v2.3.0 comment:Index on invite email
CREATE INDEX IF NOT EXISTS idx_user_invites_email ON user_invites(email);
--rollback DROP INDEX IF EXISTS idx_user_invites_email;
