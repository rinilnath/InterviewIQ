-- InterviewIQ Database Migrations
-- Run these in your Supabase SQL Editor

-- Users table
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role VARCHAR(20) NOT NULL CHECK (role IN ('admin', 'user')),
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES users(id)
);

-- Documents table
CREATE TABLE IF NOT EXISTS documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  filename VARCHAR(255) NOT NULL,
  original_name VARCHAR(255) NOT NULL,
  file_type VARCHAR(10) NOT NULL,
  label VARCHAR(255) NOT NULL,
  document_type VARCHAR(50) NOT NULL CHECK (
    document_type IN (
      'INTERVIEW_PREP_NOTES',
      'SCENARIO_QUESTIONS',
      'STUDY_NOTES',
      'CLIENT_INTERVIEW_QUESTIONS',
      'CLIENT_EXPECTATIONS'
    )
  ),
  extracted_text TEXT NOT NULL DEFAULT '',
  storage_path VARCHAR(500) NOT NULL,
  file_size_bytes INTEGER,
  uploaded_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Interview Kits table
CREATE TABLE IF NOT EXISTS interview_kits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  generated_by UUID REFERENCES users(id),
  jd_text TEXT NOT NULL,
  seniority_level VARCHAR(50) NOT NULL,
  tech_stack JSONB NOT NULL,
  custom_expectations TEXT,
  kit_title VARCHAR(255),
  output_json JSONB NOT NULL,
  scores_json JSONB,
  is_completed BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_interview_kits_generated_by ON interview_kits(generated_by);
CREATE INDEX IF NOT EXISTS idx_interview_kits_created_at ON interview_kits(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_documents_uploaded_by ON documents(uploaded_by);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

-- ─── Async generation support (run these on existing databases) ────────────
-- Adds generation lifecycle status tracking to interview_kits.
-- DEFAULT 'completed' so all existing kits remain valid without data migration.
ALTER TABLE interview_kits
  ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'completed',
  ADD COLUMN IF NOT EXISTS error_message TEXT;

-- Allow NULL output_json for kits that are still being generated
ALTER TABLE interview_kits ALTER COLUMN output_json DROP NOT NULL;

CREATE INDEX IF NOT EXISTS idx_interview_kits_status ON interview_kits(status);

-- Store how long generation took so it can be shown in the kit header
ALTER TABLE interview_kits ADD COLUMN IF NOT EXISTS generation_seconds INTEGER;

-- ─── Soft delete / Trash (v1.3.0) ─────────────────────────────────────────
-- Deletes are now soft: deleted_at is stamped, rows stay in DB for 30 days.
-- Permanent deletion runs as lazy cleanup on GET /trash or via daily interval.
ALTER TABLE interview_kits
  ADD COLUMN IF NOT EXISTS deleted_at  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS deleted_by  UUID REFERENCES users(id);

-- Partial index: speeds up all active-kit list queries (history, dashboard)
CREATE INDEX IF NOT EXISTS idx_interview_kits_active
  ON interview_kits(generated_by, created_at DESC)
  WHERE deleted_at IS NULL;

-- Index for efficient trash expiry cleanup
CREATE INDEX IF NOT EXISTS idx_interview_kits_deleted_at
  ON interview_kits(deleted_at)
  WHERE deleted_at IS NOT NULL;
-- ───────────────────────────────────────────────────────────────────────────

-- ─── Shared Kits (v1.4.0) ─────────────────────────────────────────────────
-- Completed kits can be published org-wide by toggling is_shared.
-- Shared kits are visible to all users on the /shared page.
ALTER TABLE interview_kits
  ADD COLUMN IF NOT EXISTS is_shared BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_interview_kits_shared
  ON interview_kits(created_at DESC)
  WHERE is_shared = true AND deleted_at IS NULL AND status = 'completed';
-- ───────────────────────────────────────────────────────────────────────────

-- Seed default admin
-- Password: Admin@123
INSERT INTO users (name, email, password_hash, role)
VALUES (
  'Administrator',
  'admin@interviewiq.com',
  '$2b$10$Sjn2tSb78DgYpayRzeVdvez9ipCGTtIAgr41aBauHO5eWG8vyTqRq',
  'admin'
)
ON CONFLICT (email) DO UPDATE SET
  password_hash = '$2b$10$Sjn2tSb78DgYpayRzeVdvez9ipCGTtIAgr41aBauHO5eWG8vyTqRq';

-- Note: Default password is Admin@123
-- Change this immediately after first login via Admin → Users → Reset Password
