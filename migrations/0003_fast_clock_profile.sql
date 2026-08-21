ALTER TABLE simulation_runs ADD COLUMN clock_profile TEXT NOT NULL DEFAULT 'standard'
  CHECK (clock_profile IN ('standard', 'fast'));
