--liquibase formatted sql
-- InterviewIQ v1.6.0 — Upgrade Requests
-- Manual payment flow: user submits UTR after bank transfer/UPI,
-- admin approves and the tier is upgraded automatically.

--changeset interviewiq:1.6.0-upgrade-requests labels:v1.6.0 comment:Stores user upgrade requests pending admin approval
CREATE TABLE IF NOT EXISTS upgrade_requests (
  id             UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID         NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  requested_tier VARCHAR(20)  NOT NULL CHECK (requested_tier IN ('pro', 'enterprise')),
  plan_period    VARCHAR(10)  NOT NULL DEFAULT 'monthly' CHECK (plan_period IN ('monthly', 'annual')),
  amount_inr     INTEGER      NOT NULL,          -- amount user claims to have paid (₹)
  utr_number     VARCHAR(100) NOT NULL,          -- UTR / UPI transaction reference
  payment_method VARCHAR(20)  NOT NULL DEFAULT 'upi' CHECK (payment_method IN ('upi', 'bank_transfer')),
  status         VARCHAR(20)  NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  admin_note     TEXT,
  reviewed_at    TIMESTAMPTZ,
  reviewed_by    UUID         REFERENCES users(id),
  created_at     TIMESTAMPTZ  DEFAULT NOW()
);
--rollback DROP TABLE IF EXISTS upgrade_requests;

--changeset interviewiq:1.6.0-upgrade-requests-indexes labels:v1.6.0 comment:Indexes for upgrade request queries
CREATE INDEX IF NOT EXISTS idx_upgrade_requests_user_id  ON upgrade_requests(user_id);
CREATE INDEX IF NOT EXISTS idx_upgrade_requests_status   ON upgrade_requests(status);
CREATE INDEX IF NOT EXISTS idx_upgrade_requests_created  ON upgrade_requests(created_at DESC);
--rollback DROP INDEX IF EXISTS idx_upgrade_requests_user_id; DROP INDEX IF EXISTS idx_upgrade_requests_status; DROP INDEX IF EXISTS idx_upgrade_requests_created;
