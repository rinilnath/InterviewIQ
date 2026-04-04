--liquibase formatted sql
-- InterviewIQ v1.5.0 — Subscription Tiers
-- Adds per-user subscription tier and expiry for quota enforcement.
-- Tiers: free (5/mo), pro (50/mo), enterprise (200/mo).
-- Admin role bypasses all quotas regardless of tier.

--changeset interviewiq:1.5.0-subscription-tier labels:v1.5.0 comment:Subscription tier — free|pro|enterprise
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS subscription_tier VARCHAR(20) NOT NULL DEFAULT 'free'
    CHECK (subscription_tier IN ('free', 'pro', 'enterprise'));
--rollback ALTER TABLE users DROP COLUMN IF EXISTS subscription_tier;

--changeset interviewiq:1.5.0-subscription-expires labels:v1.5.0 comment:NULL means tier never expires; set to a date for time-boxed pro/enterprise access
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS subscription_expires_at TIMESTAMPTZ;
--rollback ALTER TABLE users DROP COLUMN IF EXISTS subscription_expires_at;

--changeset interviewiq:1.5.0-tier-index labels:v1.5.0 comment:Index for admin queries filtering by tier
CREATE INDEX IF NOT EXISTS idx_users_subscription_tier
  ON users(subscription_tier);
--rollback DROP INDEX IF EXISTS idx_users_subscription_tier;
