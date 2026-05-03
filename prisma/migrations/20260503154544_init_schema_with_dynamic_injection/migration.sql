-- CreateTable
CREATE TABLE "nexus_agents" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "agent_id" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "lane" TEXT NOT NULL,
    "dialect" TEXT NOT NULL,
    "soul_prompt" TEXT NOT NULL,
    "tools_allowed" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'offline',
    "last_heartbeat" DATETIME,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "nexus_projects" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "pm_soul_prompt" TEXT,
    "channel_config" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "nexus_tasks" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "project_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "objective" TEXT NOT NULL,
    "lane_required" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'created',
    "payload_schema" TEXT,
    "payload" TEXT,
    "proof_data" TEXT,
    "ext_meta" TEXT,
    "max_retries" INTEGER NOT NULL DEFAULT 3,
    "retry_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "nexus_tasks_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "nexus_projects" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "nexus_runs" (
    "run_id" TEXT NOT NULL PRIMARY KEY,
    "task_id" TEXT NOT NULL,
    "agent_id" TEXT NOT NULL,
    "idempotency_key" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'running',
    "error_stack" TEXT,
    "started_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ended_at" DATETIME,
    CONSTRAINT "nexus_runs_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "nexus_tasks" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "nexus_runs_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "nexus_agents" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "nexus_artifacts" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "run_id" TEXT NOT NULL,
    "artifact_type" TEXT NOT NULL,
    "payload" TEXT NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "nexus_artifacts_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "nexus_runs" ("run_id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "nexus_agents_agent_id_key" ON "nexus_agents"("agent_id");

-- CreateIndex
CREATE UNIQUE INDEX "nexus_projects_name_key" ON "nexus_projects"("name");

-- CreateIndex
CREATE INDEX "nexus_tasks_status_lane_required_idx" ON "nexus_tasks"("status", "lane_required");

-- CreateIndex
CREATE INDEX "nexus_tasks_project_id_idx" ON "nexus_tasks"("project_id");

-- CreateIndex
CREATE UNIQUE INDEX "nexus_runs_idempotency_key_key" ON "nexus_runs"("idempotency_key");

-- CreateIndex
CREATE INDEX "nexus_runs_task_id_status_idx" ON "nexus_runs"("task_id", "status");

-- CreateIndex
CREATE INDEX "nexus_artifacts_run_id_idx" ON "nexus_artifacts"("run_id");
