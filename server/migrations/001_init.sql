CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  login TEXT UNIQUE NOT NULL,
  full_name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin','operator','auditor')),
  salt TEXT NOT NULL,
  hash TEXT NOT NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_login TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS carriers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ppp INT,
  issue_date DATE,
  carrier_type TEXT,
  carrier_serial TEXT,
  employee TEXT NOT NULL,
  position TEXT,
  department TEXT,
  cert_type SMALLINT,
  cert_start DATE,
  cert_serial TEXT,
  return_mark DATE,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active','returned','expired','reserved')),
  sign_cert TEXT,
  sign_carrier TEXT,
  two_factor BOOLEAN NOT NULL DEFAULT FALSE,
  created TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_carriers_employee ON carriers USING gin (employee gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_carriers_status ON carriers(status);
CREATE INDEX IF NOT EXISTS idx_carriers_serial ON carriers(carrier_serial);

CREATE TABLE IF NOT EXISTS audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ts TIMESTAMPTZ NOT NULL DEFAULT now(),
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  user_name TEXT,
  action TEXT NOT NULL,
  entity TEXT,
  entity_id UUID,
  details JSONB
);
CREATE INDEX IF NOT EXISTS idx_audit_ts ON audit(ts DESC);