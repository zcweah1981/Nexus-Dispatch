import fs from 'fs';
import path from 'path';
import Ajv from 'ajv';

import {
  V8_BLUEPRINT_SCHEMA,
  validateV8Blueprint,
  parseV8Blueprint,
  type V8Blueprint,
} from '../../src/blueprints/v8_blueprint_schema';

const repoRoot = path.resolve(__dirname, '../..');

const validBlueprint: V8Blueprint = {
  version: 'v8-r3',
  blueprint_id: 'bp-nexus-v8-r3-contract',
  name: 'Nexus V8 R3 contract blueprint',
  phases: [
    {
      phase_id: 'r3-p1',
      name: 'R3 Phase 1',
      group_id: 'nexus-v8-r3-p1',
      priority: 10,
      tasks: [
        {
          task_id: 'nexus-v8-r3-p1-t1',
          title: 'Define blueprint schema',
          objective: 'Freeze the JSON contract for future thaw inputs',
          lane_required: 'DEV',
          acceptance_mode: 'pm_audit',
          acceptance_criteria: ['schema contract test passes'],
          reviewer: 'shun-designer-1',
          payload: { scope: 'schema-only' },
          ext_meta: { owner: 'long-coder-1' },
          max_retries: 2,
        },
        {
          task_id: 'nexus-v8-r3-p1-t2',
          title: 'Dependent task',
          objective: 'Prove same-phase depends_on contract',
          lane_required: 'DEV',
          acceptance_mode: 'pm_audit',
          acceptance_criteria: ['depends_on references a same-blueprint task_id'],
          depends_on: ['nexus-v8-r3-p1-t1'],
        },
      ],
    },
  ],
};

describe('V8-R3 Blueprint frozen JSON schema', () => {
  test('exports a draft-07 JSON schema with the canonical phases/groups/tasks contract', () => {
    expect(V8_BLUEPRINT_SCHEMA.$schema).toBe('http://json-schema.org/draft-07/schema#');
    expect(V8_BLUEPRINT_SCHEMA.title).toBe('Nexus Dispatch V8 Project Blueprint');
    expect(V8_BLUEPRINT_SCHEMA.additionalProperties).toBe(false);
    expect(V8_BLUEPRINT_SCHEMA.required).toEqual(['version', 'blueprint_id', 'name', 'phases']);

    const phaseSchema = V8_BLUEPRINT_SCHEMA.definitions.phase;
    const taskSchema = V8_BLUEPRINT_SCHEMA.definitions.task;

    expect(phaseSchema.required).toEqual(['phase_id', 'name', 'group_id', 'tasks']);
    expect(taskSchema.required).toEqual([
      'task_id',
      'title',
      'objective',
      'lane_required',
      'acceptance_mode',
      'acceptance_criteria',
    ]);
    expect(taskSchema.properties).not.toHaveProperty('status');
    expect(taskSchema.properties).not.toHaveProperty('project_id');
    expect(taskSchema.properties).not.toHaveProperty('run_id');
    expect(taskSchema.properties).not.toHaveProperty('proof_data');
    expect(taskSchema.additionalProperties).toBe(false);
  });

  test('validates canonical blueprints and rejects malformed or out-of-scope runtime fields', () => {
    expect(validateV8Blueprint(validBlueprint)).toEqual({ ok: true, value: validBlueprint });

    expect(validateV8Blueprint({ ...validBlueprint, phases: [] })).toMatchObject({ ok: false });
    expect(validateV8Blueprint({ ...validBlueprint, project_id: 'runtime-project' })).toMatchObject({ ok: false });
    expect(
      validateV8Blueprint({
        ...validBlueprint,
        phases: [
          {
            ...validBlueprint.phases[0],
            tasks: [{ ...validBlueprint.phases[0].tasks[0], status: 'created' }],
          },
        ],
      }),
    ).toMatchObject({ ok: false });
    expect(
      validateV8Blueprint({
        ...validBlueprint,
        phases: [
          {
            ...validBlueprint.phases[0],
            tasks: [{ ...validBlueprint.phases[0].tasks[0], acceptance_mode: 'auto_complete' }],
          },
        ],
      }),
    ).toMatchObject({ ok: false });
  });

  test('parseV8Blueprint enforces global uniqueness and dependency references inside the blueprint', () => {
    expect(parseV8Blueprint(validBlueprint)).toMatchObject({ blueprint_id: validBlueprint.blueprint_id });

    expect(() =>
      parseV8Blueprint({
        ...validBlueprint,
        phases: [
          validBlueprint.phases[0],
          { ...validBlueprint.phases[0], phase_id: 'r3-p2', name: 'Duplicate group' },
        ],
      }),
    ).toThrow(/Duplicate phase group_id/);

    expect(() =>
      parseV8Blueprint({
        ...validBlueprint,
        phases: [
          {
            ...validBlueprint.phases[0],
            tasks: [
              validBlueprint.phases[0].tasks[0],
              { ...validBlueprint.phases[0].tasks[0], title: 'Duplicate task ID' },
            ],
          },
        ],
      }),
    ).toThrow(/Duplicate task_id/);

    expect(() =>
      parseV8Blueprint({
        ...validBlueprint,
        phases: [
          {
            ...validBlueprint.phases[0],
            tasks: [{ ...validBlueprint.phases[0].tasks[1], depends_on: ['missing-task'] }],
          },
        ],
      }),
    ).toThrow(/Unknown depends_on task_id/);
  });

  test('schema artifact is JSON-serializable and Ajv-compatible as a frozen contract input', () => {
    const ajv = new Ajv({ allErrors: true });
    const validate = ajv.compile(V8_BLUEPRINT_SCHEMA);

    expect(validate(validBlueprint)).toBe(true);
    expect(JSON.parse(JSON.stringify(V8_BLUEPRINT_SCHEMA))).toEqual(V8_BLUEPRINT_SCHEMA);

    const source = fs.readFileSync(path.join(repoRoot, 'src/blueprints/v8_blueprint_schema.ts'), 'utf8');
    expect(source).not.toMatch(/better-sqlite3|sqlite3|data\/nexus\.db|prisma\/data\/nexus\.db|\$queryRaw|\$executeRaw|\.create\(|\.update\(/);
  });
});
