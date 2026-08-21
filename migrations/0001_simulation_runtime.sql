PRAGMA foreign_keys = ON;

CREATE TABLE simulation_runs (
  id TEXT PRIMARY KEY NOT NULL,
  tenant_id TEXT NOT NULL,
  seed TEXT NOT NULL,
  mode TEXT NOT NULL CHECK (mode IN ('live', 'accelerated', 'fast', 'replay', 'scenario')),
  status TEXT NOT NULL CHECK (status IN ('running', 'paused', 'completed')),
  company_time TEXT NOT NULL,
  speed INTEGER NOT NULL CHECK (speed IN (1, 10, 60)),
  tick INTEGER NOT NULL DEFAULT 0,
  planned_through_date TEXT,
  last_tick_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX simulation_runs_active_idx ON simulation_runs (tenant_id, status, updated_at);

CREATE TABLE simulation_employees (
  run_id TEXT NOT NULL REFERENCES simulation_runs(id) ON DELETE CASCADE,
  employee_id TEXT NOT NULL,
  name TEXT NOT NULL,
  title TEXT NOT NULL,
  role_key TEXT NOT NULL,
  department TEXT NOT NULL,
  team TEXT NOT NULL,
  manager_id TEXT,
  location TEXT NOT NULL,
  timezone TEXT NOT NULL,
  work_start_minute INTEGER NOT NULL,
  work_end_minute INTEGER NOT NULL,
  permissions_json TEXT NOT NULL,
  project_ids_json TEXT NOT NULL,
  skills_json TEXT NOT NULL,
  presence_state TEXT NOT NULL DEFAULT 'offline' CHECK (presence_state IN ('offline', 'working', 'meeting', 'leave')),
  current_activity_id TEXT,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (run_id, employee_id)
);
CREATE INDEX simulation_employees_presence_idx ON simulation_employees (run_id, presence_state, department);

CREATE TABLE scheduled_activities (
  id TEXT PRIMARY KEY NOT NULL,
  run_id TEXT NOT NULL REFERENCES simulation_runs(id) ON DELETE CASCADE,
  employee_id TEXT NOT NULL,
  scheduled_at TEXT NOT NULL,
  template_key TEXT NOT NULL,
  module TEXT NOT NULL,
  label TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('scheduled', 'completed', 'blocked', 'failed')),
  impact TEXT NOT NULL CHECK (impact IN ('normal', 'minor', 'significant', 'critical')),
  correlation_id TEXT NOT NULL,
  action_bundle_json TEXT NOT NULL,
  processed_at TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX scheduled_activities_due_idx ON scheduled_activities (run_id, status, scheduled_at);
CREATE INDEX scheduled_activities_employee_idx ON scheduled_activities (run_id, employee_id, scheduled_at);
CREATE INDEX scheduled_activities_module_idx ON scheduled_activities (run_id, module, scheduled_at);

CREATE TABLE business_events (
  id TEXT PRIMARY KEY NOT NULL,
  run_id TEXT NOT NULL REFERENCES simulation_runs(id) ON DELETE CASCADE,
  event_kind TEXT NOT NULL CHECK (event_kind IN ('business', 'activity', 'audit', 'workflow', 'notification', 'history')),
  event_type TEXT NOT NULL,
  module TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  aggregate_type TEXT NOT NULL,
  aggregate_id TEXT NOT NULL,
  occurred_at TEXT NOT NULL,
  correlation_id TEXT NOT NULL,
  causation_id TEXT,
  impact TEXT NOT NULL,
  summary TEXT NOT NULL,
  data_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX business_events_stream_idx ON business_events (run_id, occurred_at DESC, id DESC);
CREATE INDEX business_events_correlation_idx ON business_events (run_id, correlation_id, occurred_at);
CREATE INDEX business_events_module_idx ON business_events (run_id, module, occurred_at DESC);

CREATE TABLE scenario_executions (
  id TEXT PRIMARY KEY NOT NULL,
  run_id TEXT NOT NULL REFERENCES simulation_runs(id) ON DELETE CASCADE,
  scenario_id TEXT NOT NULL,
  label TEXT NOT NULL,
  correlation_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('accepted', 'projected', 'partial', 'failed')),
  event_count INTEGER NOT NULL,
  affected_modules_json TEXT NOT NULL,
  started_at TEXT NOT NULL,
  completed_at TEXT,
  last_error TEXT
);
CREATE INDEX scenario_executions_run_idx ON scenario_executions (run_id, started_at DESC);

CREATE TABLE event_deliveries (
  id TEXT PRIMARY KEY NOT NULL,
  run_id TEXT NOT NULL REFERENCES simulation_runs(id) ON DELETE CASCADE,
  event_id TEXT NOT NULL,
  target_module TEXT NOT NULL,
  target_path TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'delivered', 'failed', 'unsupported')),
  http_status INTEGER,
  error TEXT,
  attempted_at TEXT NOT NULL
);
CREATE INDEX event_deliveries_run_idx ON event_deliveries (run_id, attempted_at DESC);

CREATE TABLE company_snapshots (
  id TEXT PRIMARY KEY NOT NULL,
  run_id TEXT NOT NULL REFERENCES simulation_runs(id) ON DELETE CASCADE,
  company_time TEXT NOT NULL,
  event_count INTEGER NOT NULL,
  active_workflows INTEGER NOT NULL,
  pending_approvals INTEGER NOT NULL,
  exceptions INTEGER NOT NULL,
  state_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX company_snapshots_run_idx ON company_snapshots (run_id, company_time DESC);

CREATE TABLE company_history (
  id TEXT PRIMARY KEY NOT NULL,
  run_id TEXT NOT NULL REFERENCES simulation_runs(id) ON DELETE CASCADE,
  occurred_on TEXT NOT NULL,
  summary TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX company_history_run_idx ON company_history (run_id, occurred_on);
