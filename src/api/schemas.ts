/**
 * Nexus Dispatch API — JSON Schema Definitions
 * T2.6: Request body schemas for each endpoint
 *
 * All schemas follow JSON Schema draft-07 (Ajv compatible).
 */

// ─── POST /api/v1/projects/init ────────────────────────────────────
export const projectInitSchema = {
  $id: 'projectInit',
  type: 'object',
  required: ['name'],
  properties: {
    name:        { type: 'string', minLength: 1, maxLength: 256 },
    description: { type: 'string', maxLength: 2048 },
  },
  additionalProperties: false,
} as const;

// ─── POST /api/v1/agents/register ───────────────────────────────────
export const agentRegisterSchema = {
  $id: 'agentRegister',
  type: 'object',
  required: ['id', 'lane'],
  properties: {
    id:            { type: 'string', minLength: 1, maxLength: 128 },
    lane:          { type: 'string', minLength: 1, maxLength: 64 },
    endpoint:      { type: 'string', maxLength: 512 },
    dialect:       { type: 'string', maxLength: 64 },
    soul_prompt:   { type: 'string', maxLength: 8192 },
    tools_allowed: { type: 'string', maxLength: 4096 },
  },
  additionalProperties: false,
} as const;

// ─── POST /api/v1/tasks/claim ────────────────────────────────────────
// No body required — worker claims the next available task.
export const taskClaimSchema = {
  $id: 'taskClaim',
  type: 'object',
  properties: {},
  additionalProperties: false,
} as const;

// ─── POST /api/v1/tasks/:id/release ─────────────────────────────────
export const taskReleaseSchema = {
  $id: 'taskRelease',
  type: 'object',
  properties: {
    reason: { type: 'string', maxLength: 1024 },
  },
  additionalProperties: false,
} as const;

// ─── POST /api/v1/tasks/:id/acknowledge ─────────────────────────────
export const taskAckSchema = {
  $id: 'taskAck',
  type: 'object',
  required: ['worker_id', 'run_id'],
  properties: {
    worker_id: { type: 'string', minLength: 1 },
    run_id:    { type: 'string', minLength: 1 },
  },
  additionalProperties: false,
} as const;

// ─── POST /api/v1/tasks/:id/submit_proof ────────────────────────────
export const submitProofSchema = {
  $id: 'submitProof',
  type: 'object',
  required: ['run_id', 'artifact_type', 'payload'],
  properties: {
    run_id:        { type: 'string', minLength: 1 },
    artifact_type: { type: 'string', minLength: 1, maxLength: 128 },
    payload:       { } as any, // validated against task.payload_schema at runtime
  },
  additionalProperties: false,
} as const;

// ─── POST /api/v1/webhook/artifacts ─────────────────────────────────
export const webhookArtifactsSchema = {
  $id: 'webhookArtifacts',
  type: 'object',
  required: ['run_id', 'artifact_type', 'payload'],
  properties: {
    run_id:        { type: 'string', minLength: 1 },
    artifact_type: { type: 'string', minLength: 1, maxLength: 128 },
    payload:       { } as any,
  },
  additionalProperties: false,
} as const;

// ─── PUT /api/v1/controllers/:id/config ─────────────────────────────
export const controllerConfigUpdateSchema = {
  $id: 'controllerConfigUpdate',
  type: 'object',
  properties: {
    name:                       { type: 'string', minLength: 1, maxLength: 256 },
    states:                     { type: 'array', items: {} },
    transitions:                { type: 'array', items: {} },
    initial_state:              { type: 'string', minLength: 1 },
    // PRD 8.3 & 19.2 Settings
    default_reviewer:           { type: 'string', maxLength: 128 },
    poll_interval_seconds:      { type: 'integer', minimum: 1, maximum: 3600 },
    dispatch_policy:            { type: 'string', enum: ['priority_first', 'fifo', 'round_robin'] },
    blueprint_auto_advance:     { type: 'boolean' },
    max_concurrent_dispatches:  { type: 'integer', minimum: 1, maximum: 100 },
    retry_max_attempts:         { type: 'integer', minimum: 0, maximum: 50 },
    acceptance_mode:            { type: 'object', additionalProperties: { type: 'string', enum: ['pm_audit', 'machine_audit', 'design_spec'] } },
    reviewer_routing:           { type: 'object', additionalProperties: { type: 'string' } },
  },
  additionalProperties: false,
  minProperties: 1,
} as const;

// ─── POST /api/v1/blueprints ────────────────────────────────────────
export const blueprintCreateSchema = {
  $id: 'blueprintCreate',
  type: 'object',
  required: ['project_id', 'name', 'blueprint_id', 'schema_json'],
  properties: {
    project_id:    { type: 'string', minLength: 1 },
    name:          { type: 'string', minLength: 1, maxLength: 256 },
    blueprint_id:  { type: 'string', minLength: 1, maxLength: 128 },
    version:       { type: 'string', maxLength: 32 },
    schema_json:   { type: 'object' },
  },
  additionalProperties: false,
} as const;

// ═══════════════════════════════════════════════════════════════
//  T2.1: 任务管理 API Schemas（5个接口）
// ═══════════════════════════════════════════════════════════════

// ─── POST /api/v1/tasks — 创建任务 ──────────────────────────────────
export const taskCreateSchema = {
  $id: 'taskCreate',
  type: 'object',
  required: ['project_id', 'title', 'objective', 'lane_required'],
  properties: {
    project_id:          { type: 'string', minLength: 1 },
    title:               { type: 'string', minLength: 1, maxLength: 512 },
    objective:           { type: 'string', minLength: 1, maxLength: 8192 },
    lane_required:       { type: 'string', minLength: 1, maxLength: 64 },
    task_group_id:       { type: 'string' },
    payload:             { } as any,
    payload_schema:      { } as any,
    acceptance_criteria: { type: 'array', items: { type: 'string' } },
    reviewer:            { type: 'string', maxLength: 128 },
    acceptance_mode:     { type: 'string', maxLength: 64 },
    max_retries:         { type: 'integer', minimum: 0, maximum: 100 },
  },
  additionalProperties: false,
} as const;

// ─── PATCH /api/v1/tasks/:id/status — 状态更新 ──────────────────────
export const taskStatusUpdateSchema = {
  $id: 'taskStatusUpdate',
  type: 'object',
  required: ['status'],
  properties: {
    status: {
      type: 'string',
      enum: ['created', 'dispatched', 'accepted', 'review_spawned',
             'completion_pending', 'validating', 'completed', 'failed'],
    },
    proof_data: { type: 'string', maxLength: 65536 },
    ext_meta:   { type: 'string', maxLength: 65536 },
  },
  additionalProperties: false,
} as const;

// ─── POST /api/v1/tasks/batch — 批量注入 ─────────────────────────────
export const taskBatchSchema = {
  $id: 'taskBatch',
  type: 'object',
  required: ['project_id', 'group_id', 'tasks'],
  properties: {
    project_id: { type: 'string', minLength: 1 },
    group_id:   { type: 'string', minLength: 1 },
    tasks: {
      type: 'array',
      minItems: 1,
      maxItems: 500,
      items: {
        type: 'object',
        required: ['title', 'objective', 'lane_required'],
        properties: {
          title:               { type: 'string', minLength: 1, maxLength: 512 },
          objective:           { type: 'string', minLength: 1, maxLength: 8192 },
          lane_required:       { type: 'string', minLength: 1, maxLength: 64 },
          payload:             { } as any,
          payload_schema:      { } as any,
          acceptance_criteria: { type: 'array', items: { type: 'string' } },
          reviewer:            { type: 'string', maxLength: 128 },
          acceptance_mode:     { type: 'string', maxLength: 64 },
        },
        additionalProperties: false,
      },
    },
  },
  additionalProperties: false,
} as const;

// ─── POST /api/v1/tasks/:id/accept — 审核通过 ──────────────────────
export const taskAcceptSchema = {
  $id: 'taskAccept',
  type: 'object',
  properties: {
    reviewer_id: { type: 'string', minLength: 1 },
    note:        { type: 'string', maxLength: 2048 },
  },
  additionalProperties: false,
} as const;

// ─── POST /api/v1/tasks/:id/reject — 审核驳回 ──────────────────────
export const taskRejectSchema = {
  $id: 'taskReject',
  type: 'object',
  required: ['reason'],
  properties: {
    reviewer_id: { type: 'string', minLength: 1 },
    reason:      { type: 'string', minLength: 1, maxLength: 4096 },
  },
  additionalProperties: false,
} as const;

// ─── Registry: map route keys to schemas ────────────────────────────
export const schemas: Record<string, { key: string; schema: object }> = {
  'POST:/api/v1/projects/init':         { key: 'projectInit',      schema: projectInitSchema },
  'POST:/api/v1/agents/register':       { key: 'agentRegister',    schema: agentRegisterSchema },
  'POST:/api/v1/tasks/claim':           { key: 'taskClaim',        schema: taskClaimSchema },
  'POST:/api/v1/tasks':                 { key: 'taskCreate',       schema: taskCreateSchema },
  'PATCH:/api/v1/tasks/:id/status':     { key: 'taskStatusUpdate', schema: taskStatusUpdateSchema },
  'POST:/api/v1/tasks/batch':           { key: 'taskBatch',        schema: taskBatchSchema },
  'POST:/api/v1/tasks/:id/release':     { key: 'taskRelease',      schema: taskReleaseSchema },
  'POST:/api/v1/tasks/:id/acknowledge': { key: 'taskAck',          schema: taskAckSchema },
  'POST:/api/v1/tasks/:id/submit_proof':{ key: 'submitProof',      schema: submitProofSchema },
  'POST:/api/v1/webhook/artifacts':     { key: 'webhookArtifacts', schema: webhookArtifactsSchema },
};
