-- 启用 WAL 模式和外键约束
PRAGMA journal_mode=WAL;
PRAGMA foreign_keys=ON;

-- 项目表 nexus_projects
CREATE TABLE IF NOT EXISTS nexus_projects (
    id VARCHAR(36) PRIMARY KEY,
    name VARCHAR(128) NOT NULL,
    description TEXT,
    status VARCHAR(20) NOT NULL DEFAULT 'active',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Worker 表 nexus_workers
CREATE TABLE IF NOT EXISTS nexus_workers (
    id VARCHAR(64) PRIMARY KEY,
    lane VARCHAR(32) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'offline',
    last_heartbeat DATETIME,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 任务表 nexus_tasks
CREATE TABLE IF NOT EXISTS nexus_tasks (
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
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (project_id) REFERENCES nexus_projects(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_task_status ON nexus_tasks (status, lane);
CREATE INDEX IF NOT EXISTS idx_project_id ON nexus_tasks (project_id);

-- 流水表 nexus_runs
CREATE TABLE IF NOT EXISTS nexus_runs (
    run_id VARCHAR(36) PRIMARY KEY,
    task_id VARCHAR(36) NOT NULL,
    worker_id VARCHAR(64) NOT NULL,
    idempotency_key VARCHAR(128) NOT NULL UNIQUE,
    status VARCHAR(20) NOT NULL DEFAULT 'running',
    error_stack TEXT,
    started_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    ended_at DATETIME,
    FOREIGN KEY (task_id) REFERENCES nexus_tasks(id) ON DELETE CASCADE,
    FOREIGN KEY (worker_id) REFERENCES nexus_workers(id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS uk_idempotency ON nexus_runs (idempotency_key);
CREATE INDEX IF NOT EXISTS idx_task_runs ON nexus_runs (task_id, status);

-- 产物表 nexus_artifacts
CREATE TABLE IF NOT EXISTS nexus_artifacts (
    id VARCHAR(36) PRIMARY KEY,
    run_id VARCHAR(36) NOT NULL,
    artifact_type VARCHAR(64) NOT NULL,
    payload JSON NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (run_id) REFERENCES nexus_runs(run_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_artifact_run_id ON nexus_artifacts (run_id);
