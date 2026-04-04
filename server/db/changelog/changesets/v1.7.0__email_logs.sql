-- v1.7.0: Email logs — track every email sent by the application
-- Run this in Supabase SQL Editor

CREATE TABLE IF NOT EXISTS email_logs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email_type      VARCHAR(50)  NOT NULL,          -- 'welcome' | 'support'
  recipient_email VARCHAR(255) NOT NULL,
  recipient_name  VARCHAR(255),
  subject         TEXT         NOT NULL,
  status          VARCHAR(20)  NOT NULL DEFAULT 'sent', -- 'sent' | 'failed'
  error           TEXT,                           -- populated on failure
  user_id         UUID REFERENCES users(id) ON DELETE SET NULL,
  read_at         TIMESTAMPTZ,                    -- NULL = unread; set by tracking pixel
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS email_logs_user_id_idx   ON email_logs(user_id);
CREATE INDEX IF NOT EXISTS email_logs_status_idx    ON email_logs(status);
CREATE INDEX IF NOT EXISTS email_logs_created_at_idx ON email_logs(created_at DESC);
