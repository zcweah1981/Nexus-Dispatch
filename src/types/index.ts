// ═══════════════════════════════════════════════════════════════
// Nexus Dispatch System — Type Definitions V7.5
// Aligned with Prisma Schema V7.5 (9 models)
// Task: nd-v75-t13 | Agent: long-coder-1
// ═══════════════════════════════════════════════════════════════

// ─── Union Types / Enums ─────────────────────────────────────

/** Task lifecycle states — extends Prisma enum with V7.5 FSM states */
export type TaskStatus =
  | 'created'
  | 'dispatched'
  | 'accepted'
  | 'review_spawned'
  | 'completion_pending'
  | 'validating'
  | 'completed'
  | 'failed';

/** Agent online/offline status */
export type AgentStatus = 'online' | 'offline';

/** Agent lane classification */
export type AgentLane = 'DEV' | 'DESIGN' | 'OPS' | 'CONTENT';

/** Agent dialect / protocol */
export type AgentDialect = 'hermes' | 'openclaw';

/**
 * Acceptance mode for task verification.
 * AC: pm_audit | machine_audit | design_spec | standard
 */
export type AcceptanceMode =
  | 'pm_audit'
  | 'machine_audit'
  | 'design_spec'
  | 'standard';

/** Run execution status */
export type RunStatus = 'running' | 'success' | 'failed';

/** Task dependency relationship type */
export type DependencyType = 'blocks' | 'requires' | 'related';

/** Project lifecycle status */
export type ProjectStatus = 'active' | 'archived';

/** Blueprint lifecycle status */
export type BlueprintStatus = 'draft' | 'active' | 'archived';

/** Task group lifecycle status */
export type TaskGroupStatus = 'active' | 'completed' | 'archived';

// ─── Core Domain Models (Prisma field-aligned) ───────────────

/**
 * Task — core task entity.
 * Prisma model: nexus_tasks
 * All fields map 1:1 to Prisma Task columns.
 */
export interface Task {
  id: string;
  project_id: string;
  title: string;
  objective: string;
  lane_required: string;
  status: TaskStatus;
  payload_schema?: string | null;
  payload?: string | null;
  proof_data?: string | null;
  ext_meta?: string | null;
  // V7.5 fields
  task_group_id?: string | null;
  acceptance_criteria?: string | null;
  reviewer?: string | null;
  acceptance_mode?: AcceptanceMode | null;
  max_retries: number;
  retry_count: number;
  created_at: Date;
}

/**
 * Agent — registered execution agent.
 * Prisma model: nexus_agents
 */
export interface Agent {
  id: string;
  agent_id: string;
  endpoint: string;
  lane: string;
  dialect: string;
  soul_prompt: string;
  tools_allowed: string;
  status: AgentStatus;
  last_heartbeat?: Date | null;
  created_at: Date;
}

/**
 * Run — single execution attempt of a task by an agent.
 * Prisma model: nexus_runs
 */
export interface Run {
  run_id: string;
  task_id: string;
  agent_id: string;
  idempotency_key: string;
  status: RunStatus;
  error_stack?: string | null;
  started_at: Date;
  ended_at?: Date | null;
}

/**
 * Artifact — structured proof/output from a run.
 * Prisma model: nexus_artifacts
 */
export interface Artifact {
  id: string;
  run_id: string;
  artifact_type: string;
  payload: string;
  created_at: Date;
  // V7.5 fields
  proof?: string | null;
  path?: string | null;
  metadata_json?: string | null;
}

/**
 * TaskDependency — DAG edge between tasks.
 * Prisma model: task_dependencies
 */
export interface TaskDependency {
  id: string;
  task_id: string;
  depends_on_id: string;
  dependency_type: DependencyType;
  created_at: Date;
}

/**
 * Project — top-level project container.
 * Prisma model: nexus_projects
 */
export interface Project {
  id: string;
  name: string;
  status: ProjectStatus;
  pm_soul_prompt?: string | null;
  channel_config?: string | null;
  created_at: Date;
}

/**
 * TaskGroup — logical grouping of tasks for DAG orchestration.
 * Prisma model: task_groups
 */
export interface TaskGroup {
  id: string;
  group_id: string;
  name: string;
  description?: string | null;
  status: TaskGroupStatus;
  created_at: Date;
}

/**
 * ProjectBlueprint — reusable project template definitions.
 * Prisma model: project_blueprints
 */
export interface ProjectBlueprint {
  id: string;
  project_id: string;
  blueprint_id: string;
  name: string;
  version: string;
  schema_json: string;
  status: BlueprintStatus;
  created_at: Date;
  updated_at: Date;
}

/**
 * FSMController — finite state machine controller definitions.
 * Prisma model: fsm_controllers
 */
export interface FSMController {
  id: string;
  controller_id: string;
  name: string;
  entity_type: string;
  states_json: string;
  transitions_json: string;
  initial_state: string;
  created_at: Date;
  updated_at: Date;
}

// ─── Helper / Input Types ────────────────────────────────────

/**
 * Input type for DAG plan creation.
 * Used by NexusToolchain.createDagPlan() — carries the minimal
 * data needed for cycle detection plus optional full task payload.
 */
export interface DagPlanTaskInput {
  id: string;
  dependencies: string[];
  title?: string;
  objective?: string;
  lane_required?: string;
  [key: string]: unknown;
}
