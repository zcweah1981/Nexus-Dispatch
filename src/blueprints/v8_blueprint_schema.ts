export type V8BlueprintAcceptanceMode = 'pm_audit' | 'repo_pr_tests_proof' | 'repo_tests_proof' | 'manual';

export interface V8BlueprintTask {
  task_id: string;
  title: string;
  objective: string;
  lane_required: string;
  acceptance_mode: V8BlueprintAcceptanceMode;
  acceptance_criteria: string[];
  reviewer?: string;
  depends_on?: string[];
  payload?: Record<string, unknown>;
  payload_schema?: Record<string, unknown>;
  ext_meta?: Record<string, unknown>;
  max_retries?: number;
}

export interface V8BlueprintPhase {
  phase_id: string;
  name: string;
  group_id: string;
  description?: string;
  priority?: number;
  tasks: V8BlueprintTask[];
}

export interface V8Blueprint {
  version: string;
  blueprint_id: string;
  name: string;
  description?: string;
  phases: V8BlueprintPhase[];
}

export interface V8BlueprintValidationOk {
  ok: true;
  value: V8Blueprint;
}

export interface V8BlueprintValidationError {
  ok: false;
  errors: string[];
}

export type V8BlueprintValidationResult = V8BlueprintValidationOk | V8BlueprintValidationError;

type JsonSchema = Record<string, any>;

const jsonObjectSchema: JsonSchema = {
  type: 'object',
  additionalProperties: true,
};

export const V8_BLUEPRINT_SCHEMA = {
  $schema: 'http://json-schema.org/draft-07/schema#',
  title: 'Nexus Dispatch V8 Project Blueprint',
  type: 'object',
  additionalProperties: false,
  required: ['version', 'blueprint_id', 'name', 'phases'],
  properties: {
    version: { type: 'string', minLength: 1 },
    blueprint_id: { type: 'string', minLength: 1 },
    name: { type: 'string', minLength: 1 },
    description: { type: 'string' },
    phases: {
      type: 'array',
      minItems: 1,
      items: { $ref: '#/definitions/phase' },
    },
  },
  definitions: {
    phase: {
      type: 'object',
      additionalProperties: false,
      required: ['phase_id', 'name', 'group_id', 'tasks'],
      properties: {
        phase_id: { type: 'string', minLength: 1 },
        name: { type: 'string', minLength: 1 },
        group_id: { type: 'string', minLength: 1 },
        description: { type: 'string' },
        priority: { type: 'integer', minimum: 0 },
        tasks: {
          type: 'array',
          minItems: 1,
          items: { $ref: '#/definitions/task' },
        },
      },
    },
    task: {
      type: 'object',
      additionalProperties: false,
      required: ['task_id', 'title', 'objective', 'lane_required', 'acceptance_mode', 'acceptance_criteria'],
      properties: {
        task_id: { type: 'string', minLength: 1 },
        title: { type: 'string', minLength: 1 },
        objective: { type: 'string', minLength: 1 },
        lane_required: { type: 'string', minLength: 1 },
        acceptance_mode: {
          type: 'string',
          enum: ['pm_audit', 'repo_pr_tests_proof', 'repo_tests_proof', 'manual'],
        },
        acceptance_criteria: {
          type: 'array',
          minItems: 1,
          items: { type: 'string', minLength: 1 },
        },
        reviewer: { type: 'string', minLength: 1 },
        depends_on: {
          type: 'array',
          uniqueItems: true,
          items: { type: 'string', minLength: 1 },
        },
        payload: jsonObjectSchema,
        payload_schema: jsonObjectSchema,
        ext_meta: jsonObjectSchema,
        max_retries: { type: 'integer', minimum: 0 },
      },
    },
  },
} as const;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasOwn(value: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function validateString(value: unknown, path: string, errors: string[]) {
  if (typeof value !== 'string' || value.length === 0) errors.push(`${path} must be a non-empty string`);
}

function validateOptionalObject(value: unknown, path: string, errors: string[]) {
  if (value !== undefined && !isPlainObject(value)) errors.push(`${path} must be an object`);
}

function validateAllowedKeys(value: Record<string, unknown>, allowed: Set<string>, path: string, errors: string[]) {
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) errors.push(`${path}.${key} is not allowed`);
  }
}

export function validateV8Blueprint(input: unknown): V8BlueprintValidationResult {
  const errors: string[] = [];
  if (!isPlainObject(input)) return { ok: false, errors: ['blueprint must be an object'] };

  validateAllowedKeys(input, new Set(['version', 'blueprint_id', 'name', 'description', 'phases']), 'blueprint', errors);
  validateString(input.version, 'version', errors);
  validateString(input.blueprint_id, 'blueprint_id', errors);
  validateString(input.name, 'name', errors);
  if (input.description !== undefined && typeof input.description !== 'string') errors.push('description must be a string');
  if (!Array.isArray(input.phases) || input.phases.length === 0) {
    errors.push('phases must be a non-empty array');
  } else {
    input.phases.forEach((phase, phaseIndex) => {
      const phasePath = `phases[${phaseIndex}]`;
      if (!isPlainObject(phase)) {
        errors.push(`${phasePath} must be an object`);
        return;
      }
      validateAllowedKeys(phase, new Set(['phase_id', 'name', 'group_id', 'description', 'priority', 'tasks']), phasePath, errors);
      validateString(phase.phase_id, `${phasePath}.phase_id`, errors);
      validateString(phase.name, `${phasePath}.name`, errors);
      validateString(phase.group_id, `${phasePath}.group_id`, errors);
      if (phase.description !== undefined && typeof phase.description !== 'string') errors.push(`${phasePath}.description must be a string`);
      if (phase.priority !== undefined && (!Number.isInteger(phase.priority) || (phase.priority as number) < 0)) {
        errors.push(`${phasePath}.priority must be a non-negative integer`);
      }
      if (!Array.isArray(phase.tasks) || phase.tasks.length === 0) {
        errors.push(`${phasePath}.tasks must be a non-empty array`);
        return;
      }
      phase.tasks.forEach((task, taskIndex) => {
        const taskPath = `${phasePath}.tasks[${taskIndex}]`;
        if (!isPlainObject(task)) {
          errors.push(`${taskPath} must be an object`);
          return;
        }
        validateAllowedKeys(
          task,
          new Set([
            'task_id',
            'title',
            'objective',
            'lane_required',
            'acceptance_mode',
            'acceptance_criteria',
            'reviewer',
            'depends_on',
            'payload',
            'payload_schema',
            'ext_meta',
            'max_retries',
          ]),
          taskPath,
          errors,
        );
        validateString(task.task_id, `${taskPath}.task_id`, errors);
        validateString(task.title, `${taskPath}.title`, errors);
        validateString(task.objective, `${taskPath}.objective`, errors);
        validateString(task.lane_required, `${taskPath}.lane_required`, errors);
        if (!['pm_audit', 'repo_pr_tests_proof', 'repo_tests_proof', 'manual'].includes(String(task.acceptance_mode))) {
          errors.push(`${taskPath}.acceptance_mode is not supported`);
        }
        if (!Array.isArray(task.acceptance_criteria) || task.acceptance_criteria.length === 0) {
          errors.push(`${taskPath}.acceptance_criteria must be a non-empty array`);
        } else {
          task.acceptance_criteria.forEach((criterion, criterionIndex) =>
            validateString(criterion, `${taskPath}.acceptance_criteria[${criterionIndex}]`, errors),
          );
        }
        if (task.reviewer !== undefined) validateString(task.reviewer, `${taskPath}.reviewer`, errors);
        if (task.depends_on !== undefined) {
          if (!Array.isArray(task.depends_on)) {
            errors.push(`${taskPath}.depends_on must be an array`);
          } else {
            const dependsOn = new Set<string>();
            task.depends_on.forEach((dependency, dependencyIndex) => {
              validateString(dependency, `${taskPath}.depends_on[${dependencyIndex}]`, errors);
              if (typeof dependency === 'string') dependsOn.add(dependency);
            });
            if (dependsOn.size !== task.depends_on.length) errors.push(`${taskPath}.depends_on must be unique`);
          }
        }
        validateOptionalObject(task.payload, `${taskPath}.payload`, errors);
        validateOptionalObject(task.payload_schema, `${taskPath}.payload_schema`, errors);
        validateOptionalObject(task.ext_meta, `${taskPath}.ext_meta`, errors);
        if (task.max_retries !== undefined && (!Number.isInteger(task.max_retries) || (task.max_retries as number) < 0)) {
          errors.push(`${taskPath}.max_retries must be a non-negative integer`);
        }
      });
    });
  }

  return errors.length > 0 ? { ok: false, errors } : { ok: true, value: input as unknown as V8Blueprint };
}

export function parseV8Blueprint(input: unknown): V8Blueprint {
  const result = validateV8Blueprint(input);
  if (result.ok === false) throw new Error(`Invalid V8 blueprint: ${result.errors.join('; ')}`);

  const phaseIds = new Set<string>();
  const groupIds = new Set<string>();
  const taskIds = new Set<string>();
  const dependencyRefs: Array<{ task_id: string; depends_on: string }> = [];

  for (const phase of result.value.phases) {
    if (phaseIds.has(phase.phase_id)) throw new Error(`Duplicate phase_id: ${phase.phase_id}`);
    phaseIds.add(phase.phase_id);
    if (groupIds.has(phase.group_id)) throw new Error(`Duplicate phase group_id: ${phase.group_id}`);
    groupIds.add(phase.group_id);

    for (const task of phase.tasks) {
      if (taskIds.has(task.task_id)) throw new Error(`Duplicate task_id: ${task.task_id}`);
      taskIds.add(task.task_id);
      for (const dependency of task.depends_on ?? []) {
        dependencyRefs.push({ task_id: task.task_id, depends_on: dependency });
      }
    }
  }

  for (const dependencyRef of dependencyRefs) {
    if (!taskIds.has(dependencyRef.depends_on)) {
      throw new Error(`Unknown depends_on task_id ${dependencyRef.depends_on} referenced by ${dependencyRef.task_id}`);
    }
  }

  return result.value;
}

export function stringifyV8BlueprintSchema(): string {
  return JSON.stringify(V8_BLUEPRINT_SCHEMA, null, 2);
}
