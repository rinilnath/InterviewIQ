-- v2.0.0 — JD Library
-- Stores reusable job descriptions that any user can contribute and reference
-- when generating interview kits.

CREATE TABLE IF NOT EXISTS jd_library (
  id          UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  title       VARCHAR(255)  NOT NULL,
  role        VARCHAR(255)  NOT NULL,
  technologies TEXT[]        NOT NULL DEFAULT '{}',
  content     TEXT          NOT NULL,
  uploaded_by UUID          NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS jd_library_uploaded_by_idx ON jd_library(uploaded_by);
CREATE INDEX IF NOT EXISTS jd_library_role_idx        ON jd_library USING gin(to_tsvector('english', role));
