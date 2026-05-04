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
    id:   { type: 'string', minLength: 1, maxLength: 128 },
    lane: { type: 'string', minLength: 1, maxLength: 64 },
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
    name:          { type: 'string', minLength: 1, maxLength: 256 },
    states:        { type: 'array', items: {} },
    transitions:   { type: 'array', items: {} },
    initial_state: { type: 'string', minLength: 1 },
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

// ─── Registry: map route keys to schemas ────────────────────────────
export const schemas: Record<string, { key: string; schema: object }> = {
  'POST:/api/v1/projects/init':         { key: 'projectInit',      schema: projectInitSchema },
  'POST:/api/v1/agents/register':       { key: 'agentRegister',    schema: agentRegisterSchema },
  'POST:/api/v1/tasks/claim':           { key: 'taskClaim',        schema: taskClaimSchema },
  'POST:/api/v1/tasks/:id/release':     { key: 'taskRelease',      schema: taskReleaseSchema },
  'POST:/api/v1/tasks/:id/acknowledge': { key: 'taskAck',          schema: taskAckSchema },
  'POST:/api/v1/tasks/:id/submit_proof':{ key: 'submitProof',      schema: submitProofSchema },
  'POST:/api/v1/webhook/artifacts':     { key: 'webhookArtifacts', schema: webhookArtifactsSchema },
};
