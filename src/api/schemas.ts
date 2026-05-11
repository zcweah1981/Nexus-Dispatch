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
    notification_rules:         {
      type: 'object',
      properties: {
        merge_dispatch_accept: { type: 'boolean' },
        suppress_daemon_bots:  { type: 'boolean' },
      },
      additionalProperties: false,
    },
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
    dependencies:         { type: 'array', items: { type: 'string', minLength: 1 }, uniqueItems: true },
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
  required: ['project_id', 'status'],
  properties: {
    project_id: { type: 'string', minLength: 1 },
    status: {
      type: 'string',
      enum: ['created', 'dispatched', 'running', 'completion_pending', 'review_pending',
             'completed', 'retry_ready', 'blocked', 'dead_letter', 'cancelled'],
    },
    proof_data: { } as any,
    ext_meta:   { } as any,
  },
  additionalProperties: false,
} as const;

// ─── V8 Runtime API Schemas（R2 主线：thin routes -> service/repository） ──
export const runtimeProjectCreateSchema = {
  $id: 'runtimeProjectCreate',
  type: 'object',
  required: ['name'],
  properties: {
    id:             { type: 'string', minLength: 1 },
    name:           { type: 'string', minLength: 1, maxLength: 256 },
    status:         { type: 'string', maxLength: 64 },
    pm_soul_prompt: { type: 'string', maxLength: 8192 },
    channel_config: { type: 'object', additionalProperties: true },
  },
  additionalProperties: false,
} as const;

export const runtimeVisibleLanguageUpdateSchema = {
  $id: 'runtimeVisibleLanguageUpdate',
  type: 'object',
  required: ['visible_language'],
  properties: {
    visible_language: { type: 'string', enum: ['zh-CN', 'en-US'] },
  },
  additionalProperties: false,
} as const;

const runtimeAuditActorReasonProperties = {
  actor: { type: 'string', minLength: 1, maxLength: 128 },
  reason: { type: 'string', minLength: 1, maxLength: 2048 },
  idempotency_key: { type: 'string', minLength: 1, maxLength: 512 },
} as const;

export const runtimeControlledTaskActionSchema = {
  $id: 'runtimeControlledTaskAction',
  type: 'object',
  required: ['actor', 'reason'],
  properties: runtimeAuditActorReasonProperties,
  additionalProperties: false,
} as const;

export const runtimeControlledSettingsPatchSchema = {
  $id: 'runtimeControlledSettingsPatch',
  type: 'object',
  required: ['actor', 'reason'],
  properties: {
    ...runtimeAuditActorReasonProperties,
    visible_language: { type: 'string', enum: ['zh-CN', 'en-US'] },
    display_name: { type: 'string', minLength: 1, maxLength: 256 },
    docs_url: { type: 'string', minLength: 1, maxLength: 1024 },
    public_repo_url: { type: 'string', minLength: 1, maxLength: 1024 },
    enabled_lanes: { type: 'array', items: { type: 'string', minLength: 1, maxLength: 64 }, maxItems: 32 },
    proof_policy_display_rules: { type: 'object', additionalProperties: true },
    notification_quiet_mode: { type: 'boolean' },
    db_path: {},
    database_url: {},
    DATABASE_URL: {},
    secrets: {},
    bot_token: {},
    chat_id: {},
    worker_credentials: {},
    worker_endpoint_credentials: {},
    runtime_internal_path: {},
    deployment_env: {},
  },
  additionalProperties: false,
} as const;

export const runtimeAgentRegisterSchema = {
  $id: 'runtimeAgentRegister',
  type: 'object',
  required: ['agent_id', 'endpoint', 'lane', 'dialect', 'soul_prompt', 'tools_allowed'],
  properties: {
    id:            { type: 'string', minLength: 1 },
    agent_id:      { type: 'string', minLength: 1, maxLength: 128 },
    endpoint:      { type: 'string', minLength: 1, maxLength: 512 },
    lane:          { type: 'string', minLength: 1, maxLength: 64 },
    dialect:       { type: 'string', minLength: 1, maxLength: 64 },
    soul_prompt:   { type: 'string', maxLength: 8192 },
    tools_allowed: { } as any,
    status:        { type: 'string', enum: ['online', 'offline', 'disabled'] },
  },
  additionalProperties: false,
} as const;

export const runtimeBlueprintFreezeSchema = {
  $id: 'runtimeBlueprintFreeze',
  type: 'object',
  required: ['project_id', 'blueprint'],
  properties: {
    project_id: { type: 'string', minLength: 1 },
    blueprint:  { type: 'object', additionalProperties: true },
  },
  additionalProperties: false,
} as const;

export const runtimeBlueprintThawCurrentPhaseSchema = {
  $id: 'runtimeBlueprintThawCurrentPhase',
  type: 'object',
  required: ['project_id', 'blueprint_id'],
  anyOf: [{ required: ['phase_id'] }, { required: ['group_id'] }],
  properties: {
    project_id:   { type: 'string', minLength: 1 },
    blueprint_id: { type: 'string', minLength: 1 },
    phase_id:     { type: 'string', minLength: 1 },
    group_id:     { type: 'string', minLength: 1 },
  },
  additionalProperties: false,
} as const;

export const runtimeBlueprintAdvancePhaseSchema = {
  $id: 'runtimeBlueprintAdvancePhase',
  type: 'object',
  required: ['project_id', 'blueprint_id'],
  anyOf: [{ required: ['from_phase_id'] }, { required: ['from_group_id'] }],
  properties: {
    project_id:    { type: 'string', minLength: 1 },
    blueprint_id:  { type: 'string', minLength: 1 },
    from_phase_id: { type: 'string', minLength: 1 },
    from_group_id: { type: 'string', minLength: 1 },
  },
  additionalProperties: false,
} as const;

export const runtimeTaskCreateSchema = {
  $id: 'runtimeTaskCreate',
  type: 'object',
  required: ['project_id', 'title', 'objective', 'lane_required'],
  properties: {
    project_id:          { type: 'string', minLength: 1 },
    id:                  { type: 'string', minLength: 1 },
    title:               { type: 'string', minLength: 1, maxLength: 512 },
    objective:           { type: 'string', minLength: 1, maxLength: 8192 },
    lane_required:       { type: 'string', minLength: 1, maxLength: 64 },
    status:              { type: 'string', maxLength: 64 },
    payload:             { } as any,
    payload_schema:      { } as any,
    proof_data:          { } as any,
    ext_meta:            { } as any,
    task_group_id:       { type: 'string' },
    acceptance_criteria: { } as any,
    reviewer:            { type: 'string', maxLength: 128 },
    acceptance_mode:     { type: 'string', maxLength: 64 },
    max_retries:         { type: 'integer', minimum: 0, maximum: 100 },
    retry_count:         { type: 'integer', minimum: 0, maximum: 100 },
  },
  additionalProperties: false,
} as const;

export const runtimeRunCreateSchema = {
  $id: 'runtimeRunCreate',
  type: 'object',
  required: ['project_id', 'task_id', 'agent_id'],
  properties: {
    project_id:      { type: 'string', minLength: 1 },
    run_id:          { type: 'string', minLength: 1 },
    task_id:         { type: 'string', minLength: 1 },
    agent_id:        { type: 'string', minLength: 1 },
    dispatch_id:     { type: 'string' },
    worker_run_id:   { type: 'string' },
    idempotency_key: { type: 'string' },
    status:          { type: 'string', enum: ['created', 'running', 'success', 'cancelled', 'error', 'failed'] },
    error_stack:     { type: 'string', maxLength: 65536 },
    result_summary:  { type: 'string', maxLength: 65536 },
  },
  additionalProperties: false,
} as const;

export const runtimeRunStatusUpdateSchema = {
  $id: 'runtimeRunStatusUpdate',
  type: 'object',
  required: ['project_id', 'status'],
  properties: {
    project_id:     { type: 'string', minLength: 1 },
    status:         { type: 'string', enum: ['created', 'running', 'success', 'cancelled', 'error', 'failed'] },
    error_stack:    { type: 'string', maxLength: 65536 },
    result_summary: { type: 'string', maxLength: 65536 },
  },
  additionalProperties: false,
} as const;

export const runtimeArtifactCreateSchema = {
  $id: 'runtimeArtifactCreate',
  type: 'object',
  required: ['project_id', 'run_id', 'artifact_type', 'payload'],
  properties: {
    project_id:     { type: 'string', minLength: 1 },
    id:             { type: 'string', minLength: 1 },
    task_id:        { type: 'string' },
    run_id:         { type: 'string', minLength: 1 },
    artifact_type:  { type: 'string', minLength: 1, maxLength: 128 },
    payload:        { } as any,
    payload_data:   { } as any,
    proof:          { } as any,
    path:           { type: 'string', maxLength: 1024 },
    metadata_json:  { } as any,
  },
  additionalProperties: false,
} as const;

export const runtimeCronjobBindSchema = {
  $id: 'runtimeCronjobBind',
  type: 'object',
  required: ['project_id', 'cronjob_id', 'name', 'schedule'],
  properties: {
    project_id:      { type: 'string', minLength: 1 },
    id:              { type: 'string', minLength: 1 },
    cronjob_id:      { type: 'string', minLength: 1, maxLength: 256 },
    name:            { type: 'string', minLength: 1, maxLength: 256 },
    schedule:        { type: 'string', minLength: 1, maxLength: 256 },
    status:          { type: 'string', enum: ['active', 'paused', 'disabled'] },
    enabled_policy:  { type: 'string', enum: ['always_on', 'manual', 'project_active', 'maintenance_only'] },
    owner_agent_id:  { type: 'string' },
    config_json:     { } as any,
  },
  additionalProperties: false,
} as const;

export const runtimeCronjobStatusUpdateSchema = {
  $id: 'runtimeCronjobStatusUpdate',
  type: 'object',
  required: ['status'],
  properties: {
    status:      { type: 'string', enum: ['active', 'paused', 'disabled'] },
    config_json: { } as any,
    last_run_at: { type: 'string', minLength: 1 },
  },
  additionalProperties: false,
} as const;

export const runtimeReportCreateSchema = {
  $id: 'runtimeReportCreate',
  type: 'object',
  required: ['project_id', 'message_type', 'payload_json'],
  properties: {
    project_id:    { type: 'string', minLength: 1 },
    id:            { type: 'string', minLength: 1 },
    task_id:       { type: 'string' },
    run_id:        { type: 'string' },
    message_type:  { type: 'string', minLength: 1, maxLength: 128 },
    status:        { type: 'string', enum: ['pending', 'sending', 'sent', 'suppressed', 'error', 'failed'] },
    summary:       { type: 'string', maxLength: 4096 },
    payload_json:  { } as any,
    delivery_json: { } as any,
    dedupe_key:    { type: 'string', minLength: 1, maxLength: 512 },
    visible_message: { type: 'string', maxLength: 4096 },
  },
  additionalProperties: false,
} as const;

export const runtimeReportStatusUpdateSchema = {
  $id: 'runtimeReportStatusUpdate',
  type: 'object',
  required: ['project_id', 'status'],
  properties: {
    project_id:    { type: 'string', minLength: 1 },
    status:        { type: 'string', enum: ['pending', 'sending', 'sent', 'suppressed', 'error', 'failed'] },
    delivery_json: { } as any,
  },
  additionalProperties: false,
} as const;

// ─── POST /api/v1/runtime/tasks/transition — V8 FSM 状态迁移 ─────────
export const taskTransitionSchema = {
  $id: 'taskTransition',
  type: 'object',
  required: ['project_id', 'task_id', 'event', 'proof'],
  properties: {
    project_id: { type: 'string', minLength: 1 },
    task_id:    { type: 'string', minLength: 1 },
    event: {
      type: 'string',
      enum: [
        'dispatch',
        'start',
        'submit_completion',
        'request_review',
        'auto_complete',
        'review_pass',
        'retry',
        'block',
        'dead_letter',
        'cancel',
        'reopen',
        'return_to_created',
      ],
    },
    proof: { type: 'object', additionalProperties: true },
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
          dependencies:         { type: 'array', items: { type: 'string', minLength: 1 }, uniqueItems: true },
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

// ═══════════════════════════════════════════════════════════════
//  T3.1: Daemon Tick API Schemas（4个新接口）
// ═══════════════════════════════════════════════════════════════

// ─── POST /api/v1/tasks/:id/claim — 原子 claim 特定任务 ─────────
export const taskClaimByIdSchema = {
  $id: 'taskClaimById',
  type: 'object',
  required: ['project_id'],
  properties: {
    project_id: { type: 'string', minLength: 1 },
  },
  additionalProperties: false,
} as const;

// ─── POST /api/v1/runs — 创建 Run 记录 ──────────────────────────
export const runCreateSchema = {
  $id: 'runCreate',
  type: 'object',
  required: ['project_id', 'task_id', 'agent_id'],
  properties: {
    project_id:      { type: 'string', minLength: 1 },
    run_id:          { type: 'string', minLength: 1 },
    task_id:         { type: 'string', minLength: 1 },
    agent_id:        { type: 'string', minLength: 1 },
    dispatch_id:     { type: 'string' },
    worker_run_id:   { type: 'string' },
    idempotency_key: { type: 'string' },
    status:          { type: 'string', enum: ['created', 'running', 'success', 'cancelled', 'error', 'failed'] },
    error_stack:     { type: 'string', maxLength: 65536 },
    result_summary:  { type: 'string', maxLength: 65536 },
  },
  additionalProperties: false,
} as const;

// ─── POST /api/v1/tasks/recover-timeouts — 超时任务回收 ──────────
export const taskRecoverTimeoutsSchema = {
  $id: 'taskRecoverTimeouts',
  type: 'object',
  required: ['project_id'],
  properties: {
    project_id: { type: 'string', minLength: 1 },
    timeout_minutes: { type: 'integer', minimum: 1, maximum: 1440 },
  },
  additionalProperties: false,
} as const;

// ─── PATCH /api/v1/runs/:id/status — Run 状态更新 ────────────────
export const runStatusUpdateSchema = {
  $id: 'runStatusUpdate',
  type: 'object',
  required: ['project_id', 'status'],
  properties: {
    project_id:     { type: 'string', minLength: 1 },
    status:         { type: 'string', enum: ['created', 'running', 'success', 'cancelled', 'error', 'failed'] },
    error_stack:    { type: 'string', maxLength: 65536 },
    result_summary: { type: 'string', maxLength: 65536 },
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
