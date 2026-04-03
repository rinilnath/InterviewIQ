--liquibase formatted sql
-- InterviewIQ v1.0.0 — Initial Schema
-- Establishes the three core tables (users, documents, interview_kits),
-- all supporting indexes, and the bootstrap admin account.

-- ─── users ────────────────────────────────────────────────────────────────
--changeset interviewiq:1.0.0-users labels:v1.0.0 comment:Create users table
CREATE TABLE IF NOT EXISTS users (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name          VARCHAR(255) NOT NULL,
  email         VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role          VARCHAR(20)  NOT NULL CHECK (role IN ('admin', 'user')),
  is_active     BOOLEAN      DEFAULT true,
  created_at    TIMESTAMPTZ  DEFAULT NOW(),
  created_by    UUID         REFERENCES users(id)
);
--rollback DROP TABLE IF EXISTS users;

-- ─── documents ────────────────────────────────────────────────────────────
--changeset interviewiq:1.0.0-documents labels:v1.0.0 comment:Create documents (knowledge-base) table
CREATE TABLE IF NOT EXISTS documents (
  id             UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  filename       VARCHAR(255) NOT NULL,
  original_name  VARCHAR(255) NOT NULL,
  file_type      VARCHAR(10)  NOT NULL,
  label          VARCHAR(255) NOT NULL,
  document_type  VARCHAR(50)  NOT NULL CHECK (
    document_type IN (
      'INTERVIEW_PREP_NOTES',
      'SCENARIO_QUESTIONS',
      'STUDY_NOTES',
      'CLIENT_INTERVIEW_QUESTIONS',
      'CLIENT_EXPECTATIONS'
    )
  ),
  extracted_text TEXT         NOT NULL DEFAULT '',
  storage_path   VARCHAR(500) NOT NULL,
  file_size_bytes INTEGER,
  uploaded_by    UUID         REFERENCES users(id),
  created_at     TIMESTAMPTZ  DEFAULT NOW()
);
--rollback DROP TABLE IF EXISTS documents;

-- ─── interview_kits ───────────────────────────────────────────────────────
--changeset interviewiq:1.0.0-interview_kits labels:v1.0.0 comment:Create interview_kits table
CREATE TABLE IF NOT EXISTS interview_kits (
  id                  UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  generated_by        UUID         REFERENCES users(id),
  jd_text             TEXT         NOT NULL,
  seniority_level     VARCHAR(50)  NOT NULL,
  tech_stack          JSONB        NOT NULL,
  custom_expectations TEXT,
  kit_title           VARCHAR(255),
  output_json         JSONB        NOT NULL,
  scores_json         JSONB,
  is_completed        BOOLEAN      DEFAULT false,
  created_at          TIMESTAMPTZ  DEFAULT NOW(),
  updated_at          TIMESTAMPTZ  DEFAULT NOW()
);
--rollback DROP TABLE IF EXISTS interview_kits;

-- ─── indexes ──────────────────────────────────────────────────────────────
--changeset interviewiq:1.0.0-indexes labels:v1.0.0 comment:Create performance indexes
CREATE INDEX IF NOT EXISTS idx_interview_kits_generated_by ON interview_kits(generated_by);
CREATE INDEX IF NOT EXISTS idx_interview_kits_created_at   ON interview_kits(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_documents_uploaded_by       ON documents(uploaded_by);
CREATE INDEX IF NOT EXISTS idx_users_email                 ON users(email);
--rollback DROP INDEX IF EXISTS idx_interview_kits_generated_by; DROP INDEX IF EXISTS idx_interview_kits_created_at; DROP INDEX IF EXISTS idx_documents_uploaded_by; DROP INDEX IF EXISTS idx_users_email;

-- ─── seed admin ───────────────────────────────────────────────────────────
--changeset interviewiq:1.0.0-seed-admin labels:v1.0.0 comment:Bootstrap administrator account (password: Admin@123)
-- The bcrypt hash below corresponds to Admin@123 (cost factor 10).
-- Change this password immediately after first login.
INSERT INTO users (name, email, password_hash, role)
VALUES (
  'Administrator',
  'admin@interviewiq.com',
  '$2b$10$Sjn2tSb78DgYpayRzeVdvez9ipCGTtIAgr41aBauHO5eWG8vyTqRq',
  'admin'
)
ON CONFLICT (email) DO UPDATE SET
  password_hash = '$2b$10$Sjn2tSb78DgYpayRzeVdvez9ipCGTtIAgr41aBauHO5eWG8vyTqRq';
--rollback DELETE FROM users WHERE email = 'admin@interviewiq.com';
