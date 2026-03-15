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

-- Seed default admin
-- Password: Admin@123
-- Generate with: node -e "const bcrypt=require('bcryptjs'); bcrypt.hash('Admin@123',10).then(h=>console.log(h))"
-- Then replace the hash below:
INSERT INTO users (name, email, password_hash, role)
VALUES (
  'Administrator',
  'admin@interviewiq.com',
  '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWq',
  'admin'
)
ON CONFLICT (email) DO NOTHING;

-- Note: The hash above is for 'Admin@123'
-- Change this password immediately after first login via the admin panel
