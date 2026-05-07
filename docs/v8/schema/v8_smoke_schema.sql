-- V8-R0 smoke schema
-- Purpose: minimal contract-only schema for smoke tests.
-- It must be applied to an ephemeral test DB created by the test runner.
-- It intentionally avoids references to any production DB path.

PRAGMA foreign_keys = ON;

CREATE TABLE v8_projects (
  project_id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE v8_tasks (
  task_id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'created' CHECK (status IN (
    'created',
    'dispatched',
    'running',
    'completion_pending',
    'review_pending',
    'completed',
    'retry_ready',
    'blocked',
    'dead_letter',
    'cancelled'
  )),
  proof_json TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (project_id) REFERENCES v8_projects(project_id) ON DELETE CASCADE
);

CREATE TABLE v8_runs (
  run_id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  task_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'created',
  proof_json TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (project_id) REFERENCES v8_projects(project_id) ON DELETE CASCADE,
  FOREIGN KEY (task_id) REFERENCES v8_tasks(task_id) ON DELETE CASCADE
);

CREATE TABLE v8_artifacts (
  artifact_id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  task_id TEXT,
  artifact_type TEXT NOT NULL,
  proof_json TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (project_id) REFERENCES v8_projects(project_id) ON DELETE CASCADE,
  FOREIGN KEY (task_id) REFERENCES v8_tasks(task_id) ON DELETE SET NULL
);

CREATE INDEX idx_v8_tasks_project_status ON v8_tasks(project_id, status);
CREATE INDEX idx_v8_runs_project_task ON v8_runs(project_id, task_id);
CREATE INDEX idx_v8_artifacts_project_task ON v8_artifacts(project_id, task_id);
