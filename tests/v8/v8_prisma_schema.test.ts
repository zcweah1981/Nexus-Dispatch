import fs from 'fs';
import path from 'path';

const repoRoot = path.resolve(__dirname, '../..');
const prismaSchemaPath = path.join(repoRoot, 'prisma/schema.prisma');
const legacyBoundaryPath = path.join(repoRoot, 'docs/v8/prisma-schema-boundary.md');

function modelBlock(schema: string, modelName: string): string {
  const match = schema.match(new RegExp(`model\\s+${modelName}\\s+\\{[\\s\\S]*?\\n\\}`));
  if (!match) {
    throw new Error(`Missing Prisma model ${modelName}`);
  }
  return match[0];
}

function mappedTable(schema: string, modelName: string): string | null {
  const block = modelBlock(schema, modelName);
  return block.match(/@@map\("([^"]+)"\)/)?.[1] ?? null;
}

describe('V8-R1 Prisma schema contract', () => {
  const schema = fs.readFileSync(prismaSchemaPath, 'utf8');

  test('defines the V8 core entity set in the single Prisma schema', () => {
    const expectedTables: Record<string, string> = {
      Project: 'nexus_projects',
      Agent: 'nexus_agents',
      FSMController: 'fsm_controllers',
      ProjectBlueprint: 'project_blueprints',
      TaskGroup: 'task_groups',
      Task: 'nexus_tasks',
      TaskDependency: 'task_dependencies',
      Run: 'nexus_runs',
      Artifact: 'nexus_artifacts',
      Review: 'reviews',
      Report: 'reports',
      ProjectCronjob: 'project_cronjobs',
    };

    for (const [model, table] of Object.entries(expectedTables)) {
      expect(mappedTable(schema, model)).toBe(table);
    }
  });

  test('uses explicit task_group_id as the unified task grouping field', () => {
    const task = modelBlock(schema, 'Task');
    expect(task).toMatch(/task_group_id\s+String\?/);
    expect(task).toContain('@relation(fields: [task_group_id], references: [id]');
    expect(task).toContain('@@index([task_group_id])');
    expect(task).not.toMatch(/\bgroup_id\s+String\?/);
  });

  test('V8 reports, reviews, cronjobs, runs, artifacts are project-scoped and traceable', () => {
    for (const model of ['Review', 'Report', 'ProjectCronjob']) {
      const block = modelBlock(schema, model);
      expect(block).toMatch(/project_id\s+String/);
      expect(block).toContain('@@index([project_id');
    }

    const run = modelBlock(schema, 'Run');
    expect(run).toMatch(/project_id\s+String\?/);
    expect(run).toContain('dispatch_id');
    expect(run).toContain('worker_run_id');

    const artifact = modelBlock(schema, 'Artifact');
    expect(artifact).toMatch(/project_id\s+String\?/);
    expect(artifact).toContain('task_id');
    expect(artifact).toContain('payload_data');
  });

  test('documents legacy DAL boundary and forbids legacy as V8 mainline', () => {
    const boundary = fs.readFileSync(legacyBoundaryPath, 'utf8');
    expect(boundary).toContain('V8 主线只以 Prisma schema / Prisma Client 为数据层契约');
    expect(boundary).toContain('legacy DAL');
    expect(boundary).toContain('不得参与 V8 新主线');
    expect(boundary).toContain('task_group_id');
  });
});
