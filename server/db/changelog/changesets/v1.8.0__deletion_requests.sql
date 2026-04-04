-- v1.8.0: Account deletion requests — user-initiated right-to-forget workflow
-- Run this in Supabase SQL Editor

CREATE TABLE IF NOT EXISTS account_deletion_requests (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reason     TEXT,
  status     VARCHAR(20) NOT NULL DEFAULT 'pending', -- 'pending' | 'approved'
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reviewed_at TIMESTAMPTZ,
  reviewed_by UUID REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS deletion_requests_user_id_idx   ON account_deletion_requests(user_id);
CREATE INDEX IF NOT EXISTS deletion_requests_status_idx    ON account_deletion_requests(status);
CREATE INDEX IF NOT EXISTS deletion_requests_created_at_idx ON account_deletion_requests(created_at DESC);
