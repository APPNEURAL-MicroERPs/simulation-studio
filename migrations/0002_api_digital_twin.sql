PRAGMA foreign_keys = ON;

CREATE TABLE api_story_executions (
  id TEXT PRIMARY KEY NOT NULL,
  run_id TEXT NOT NULL REFERENCES simulation_runs(id) ON DELETE CASCADE,
  story_key TEXT NOT NULL,
  business_time TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  actor_role TEXT NOT NULL,
  module TEXT NOT NULL,
  intent TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('running', 'passed', 'failed', 'blocked')),
  expected_json TEXT NOT NULL,
  started_at TEXT NOT NULL,
  completed_at TEXT,
  last_error TEXT
);
CREATE INDEX api_story_executions_run_idx ON api_story_executions (run_id, business_time DESC);
CREATE INDEX api_story_executions_story_idx ON api_story_executions (run_id, story_key, started_at DESC);

CREATE TABLE api_operations (
  id TEXT PRIMARY KEY NOT NULL,
  story_execution_id TEXT NOT NULL REFERENCES api_story_executions(id) ON DELETE CASCADE,
  run_id TEXT NOT NULL REFERENCES simulation_runs(id) ON DELETE CASCADE,
  sequence INTEGER NOT NULL,
  module TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  method TEXT NOT NULL,
  path TEXT NOT NULL,
  company_time TEXT NOT NULL,
  correlation_id TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  request_json TEXT,
  expected_status INTEGER NOT NULL,
  actual_status INTEGER,
  response_json TEXT,
  status TEXT NOT NULL CHECK (status IN ('running', 'passed', 'failed')),
  duration_ms INTEGER,
  started_at TEXT NOT NULL,
  completed_at TEXT,
  error TEXT,
  UNIQUE (run_id, idempotency_key)
);
CREATE INDEX api_operations_story_idx ON api_operations (story_execution_id, sequence);
CREATE INDEX api_operations_trace_idx ON api_operations (run_id, correlation_id, started_at DESC);

CREATE TABLE api_assertions (
  id TEXT PRIMARY KEY NOT NULL,
  story_execution_id TEXT NOT NULL REFERENCES api_story_executions(id) ON DELETE CASCADE,
  operation_id TEXT REFERENCES api_operations(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('api_response', 'entity_state', 'workflow', 'related_entity', 'domain_event', 'my_work', 'notification', 'audit', 'permission')),
  label TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('passed', 'failed', 'skipped')),
  expected_json TEXT,
  actual_json TEXT,
  message TEXT,
  checked_at TEXT NOT NULL
);
CREATE INDEX api_assertions_story_idx ON api_assertions (story_execution_id, status, kind);

CREATE TABLE simulation_calendar_days (
  run_id TEXT NOT NULL REFERENCES simulation_runs(id) ON DELETE CASCADE,
  business_date TEXT NOT NULL,
  day_type TEXT NOT NULL CHECK (day_type IN ('working', 'weekend', 'holiday', 'release_weekend')),
  active_roles_json TEXT NOT NULL,
  note TEXT,
  PRIMARY KEY (run_id, business_date)
);
