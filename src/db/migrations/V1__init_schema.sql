PRAGMA journal_mode=WAL;
PRAGMA foreign_keys=ON;

CREATE TABLE nexus_projects (
    id VARCHAR(36) PRIMARY KEY,
    name VARCHAR(128) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'active',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    ext_meta JSON
);

CREATE TABLE nexus_tasks (
    id VARCHAR(36) PRIMARY KEY,
    project_id VARCHAR(36) NOT NULL,
    title VARCHAR(128) NOT NULL,
    objective TEXT NOT NULL,
    lane VARCHAR(32) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'created',
    max_retries INTEGER NOT NULL DEFAULT 3,
    retry_count INTEGER NOT NULL DEFAULT 0,
    payload_schema JSON DEFAULT '{}',
    ext_meta JSON DEFAULT '{}',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(project_id) REFERENCES nexus_projects(id) ON DELETE CASCADE
);

CREATE INDEX idx_task_status ON nexus_tasks(status, lane);
CREATE INDEX idx_project_id ON nexus_tasks(project_id);

CREATE TABLE nexus_runs (
    run_id VARCHAR(36) PRIMARY KEY,
    task_id VARCHAR(36) NOT NULL,
    worker_id VARCHAR(64) NOT NULL,
    idempotency_key VARCHAR(128) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'running',
    error_stack TEXT,
    started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    ended_at DATETIME,
    FOREIGN KEY(task_id) REFERENCES nexus_tasks(id) ON DELETE CASCADE,
    UNIQUE(idempotency_key)
);

CREATE INDEX idx_task_runs ON nexus_runs(task_id, status);
