-- AlterTable
ALTER TABLE "nexus_artifacts" ADD COLUMN "metadata_json" TEXT;
ALTER TABLE "nexus_artifacts" ADD COLUMN "path" TEXT;
ALTER TABLE "nexus_artifacts" ADD COLUMN "proof" TEXT;

-- CreateTable
CREATE TABLE "task_groups" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "group_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "task_dependencies" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "task_id" TEXT NOT NULL,
    "depends_on_id" TEXT NOT NULL,
    "dependency_type" TEXT NOT NULL DEFAULT 'blocks',
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "task_dependencies_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "nexus_tasks" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "task_dependencies_depends_on_id_fkey" FOREIGN KEY ("depends_on_id") REFERENCES "nexus_tasks" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "project_blueprints" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "project_id" TEXT NOT NULL,
    "blueprint_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "version" TEXT NOT NULL DEFAULT '1.0',
    "schema_json" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "project_blueprints_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "nexus_projects" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "fsm_controllers" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "controller_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "states_json" TEXT NOT NULL,
    "transitions_json" TEXT NOT NULL,
    "initial_state" TEXT NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_nexus_tasks" (
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
    "task_group_id" TEXT,
    "acceptance_criteria" TEXT,
    "reviewer" TEXT,
    "acceptance_mode" TEXT,
    "max_retries" INTEGER NOT NULL DEFAULT 3,
    "retry_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "nexus_tasks_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "nexus_projects" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "nexus_tasks_task_group_id_fkey" FOREIGN KEY ("task_group_id") REFERENCES "task_groups" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_nexus_tasks" ("created_at", "ext_meta", "id", "lane_required", "max_retries", "objective", "payload", "payload_schema", "project_id", "proof_data", "retry_count", "status", "title") SELECT "created_at", "ext_meta", "id", "lane_required", "max_retries", "objective", "payload", "payload_schema", "project_id", "proof_data", "retry_count", "status", "title" FROM "nexus_tasks";
DROP TABLE "nexus_tasks";
ALTER TABLE "new_nexus_tasks" RENAME TO "nexus_tasks";
CREATE INDEX "nexus_tasks_status_lane_required_idx" ON "nexus_tasks"("status", "lane_required");
CREATE INDEX "nexus_tasks_project_id_idx" ON "nexus_tasks"("project_id");
CREATE INDEX "nexus_tasks_task_group_id_idx" ON "nexus_tasks"("task_group_id");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "task_groups_group_id_key" ON "task_groups"("group_id");

-- CreateIndex
CREATE INDEX "task_dependencies_task_id_idx" ON "task_dependencies"("task_id");

-- CreateIndex
CREATE INDEX "task_dependencies_depends_on_id_idx" ON "task_dependencies"("depends_on_id");

-- CreateIndex
CREATE UNIQUE INDEX "task_dependencies_task_id_depends_on_id_key" ON "task_dependencies"("task_id", "depends_on_id");

-- CreateIndex
CREATE UNIQUE INDEX "project_blueprints_blueprint_id_key" ON "project_blueprints"("blueprint_id");

-- CreateIndex
CREATE INDEX "project_blueprints_project_id_idx" ON "project_blueprints"("project_id");

-- CreateIndex
CREATE UNIQUE INDEX "fsm_controllers_controller_id_key" ON "fsm_controllers"("controller_id");

-- CreateIndex
CREATE INDEX "fsm_controllers_entity_type_idx" ON "fsm_controllers"("entity_type");
