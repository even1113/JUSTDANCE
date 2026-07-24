CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  token_hash TEXT NOT NULL,
  status TEXT NOT NULL,
  input_version INTEGER NOT NULL DEFAULT 0,
  active_task_id TEXT,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS video_assets (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('teacher', 'user')),
  original_name TEXT NOT NULL,
  input_format TEXT NOT NULL,
  content_type TEXT NOT NULL,
  size_bytes BIGINT NOT NULL,
  storage_key TEXT NOT NULL,
  processed_storage_key TEXT,
  audio_storage_key TEXT,
  status TEXT NOT NULL,
  metadata JSONB,
  error_code TEXT,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  UNIQUE (session_id, role)
);

CREATE TABLE IF NOT EXISTS analysis_tasks (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  input_version INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL,
  stage TEXT NOT NULL,
  structured_analysis JSONB,
  report JSONB,
  error_code TEXT,
  model TEXT,
  fallback_used BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  cancelled_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS sessions_expires_at_idx ON sessions(expires_at);
CREATE INDEX IF NOT EXISTS video_assets_session_id_idx ON video_assets(session_id);
CREATE INDEX IF NOT EXISTS analysis_tasks_session_id_idx ON analysis_tasks(session_id);
