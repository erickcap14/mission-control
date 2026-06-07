-- MISSION-CONTROL — PostgreSQL schema
-- Persistent, LAN-shared, multi-device store for Claude Code session analytics.
-- Apply with: npm run db:migrate

CREATE TABLE IF NOT EXISTS devices (
  id          TEXT PRIMARY KEY,         -- short id, e.g. "macbook-air"
  name        TEXT NOT NULL,            -- display name
  key_hash    TEXT NOT NULL,            -- scrypt hash of the device API key (never the raw key)
  is_host     BOOLEAN NOT NULL DEFAULT false, -- the device that runs the backend (restore is host-only)
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen   TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS sessions (
  device_id    TEXT NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  session_id   TEXT NOT NULL,           -- JSONL filename (uuid)
  project_path TEXT,
  model        TEXT,
  cost         DOUBLE PRECISION,
  start_time   TIMESTAMPTZ,
  end_time     TIMESTAMPTZ,
  data         JSONB NOT NULL,          -- full parsed session object (tokens, costBreakdown, toolCalls, …)
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (device_id, session_id)
);

CREATE INDEX IF NOT EXISTS sessions_start_time_idx ON sessions (start_time);
CREATE INDEX IF NOT EXISTS sessions_device_idx     ON sessions (device_id);
CREATE INDEX IF NOT EXISTS sessions_project_idx    ON sessions (project_path);

-- User-edited status/summary, kept separate so re-ingesting a session never clobbers edits.
CREATE TABLE IF NOT EXISTS session_meta (
  device_id   TEXT NOT NULL,
  session_id  TEXT NOT NULL,
  status      TEXT,
  summary     TEXT,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (device_id, session_id)
);

-- Per-device toolkit snapshot pushed by each collector on startup and every 5 min.
CREATE TABLE IF NOT EXISTS device_toolkit (
  device_id   TEXT PRIMARY KEY REFERENCES devices(id) ON DELETE CASCADE,
  data        JSONB NOT NULL,             -- full scanToolkit result
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
