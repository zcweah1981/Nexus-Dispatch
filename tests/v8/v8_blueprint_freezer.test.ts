import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { PrismaClient } from '@prisma/client';
import { freezeV8Blueprint } from '../../src/engine/v8_blueprint_freezer';
import { FreezerEngine } from '../../src/engine/freezer';
import { PrismaDAL } from '../../src/db/prisma_dal';
import type { V8Blueprint } from '../../src/blueprints/v8_blueprint_schema';

const repoRoot = path.resolve(__dirname, '../..');

const validBlueprint: V8Blueprint = {
  version: 'v8-r3',
  blueprint_id: 'bp-v8-freeze-contract',
  name: 'V8 freeze blueprint contract',
  phases: [
    {
      phase_id: 'r3-p1',
      name: 'R3 Phase 1',
      group_id: 'v8-freeze-p1',
      tasks: [
        {
          task_id: 'v8-freeze-p1-t1',
          title: 'Frozen task should not be active yet',
          objective: 'Remain inside blueprint JSON until an explicit thaw phase',
          lane_required: 'DEV',
          acceptance_mode: 'pm_audit',
          acceptance_criteria: ['freeze stores blueprint only'],
          reviewer: 'shun-designer-1',
        },
      ],
    },
  ],
};

describe('V8-R3-T2 freeze blueprint without active task pollution', () => {
  let tmpDir: string;
  let prisma: PrismaClient;
  let projectId: string;

  beforeEach(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-v8-r3-freeze-'));
    const dbPath = path.join(tmpDir, 'freeze-test.db');
    execFileSync('npm', ['run', 'db:init:test', '--', dbPath], {
      cwd: repoRoot,
      encoding: 'utf8',
      env: { ...process.env, DATABASE_URL: undefined },
    });
    prisma = new PrismaClient({ datasources: { db: { url: `file:${dbPath}` } } });
    const project = await prisma.project.create({ data: { name: `freeze-project-${Date.now()}` } });
    projectId = project.id;
  }, 30000);

  afterEach(async () => {
    await prisma.$disconnect();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test('freeze stores parsed blueprint as non-active and creates no TaskGroup or Task rows before thaw', async () => {
    const result = await freezeV8Blueprint({ prisma, project_id: projectId, blueprint: validBlueprint });

    expect(result.status).toBe('frozen');
    expect(result.phase_count).toBe(1);
    expect(result.task_count).toBe(1);

    const storedBlueprint = await prisma.projectBlueprint.findFirst({
      where: { project_id: projectId, blueprint_id: validBlueprint.blueprint_id },
    });
    expect(storedBlueprint).toMatchObject({
      project_id: projectId,
      blueprint_id: validBlueprint.blueprint_id,
      name: validBlueprint.name,
      version: validBlueprint.version,
      status: 'frozen',
    });
    expect(JSON.parse(storedBlueprint!.schema_json)).toEqual(validBlueprint);

    await expect(prisma.taskGroup.findMany({ where: { project_id: projectId } })).resolves.toEqual([]);
    await expect(prisma.task.findMany({ where: { project_id: projectId } })).resolves.toEqual([]);
  });

  test('legacy freezer tick cannot thaw a merely frozen blueprint into active tasks', async () => {
    await freezeV8Blueprint({ prisma, project_id: projectId, blueprint: validBlueprint });

    const dal = new PrismaDAL(`file:${path.join(tmpDir, 'freeze-test.db')}`);
    await dal.initPragmas();
    const freezer = new FreezerEngine(dal);
    try {
      const result = await freezer.thaw_next_phase(projectId, validBlueprint.phases[0].group_id);
      expect(result).toEqual([]);
      await expect(prisma.taskGroup.findMany({ where: { project_id: projectId } })).resolves.toEqual([]);
      await expect(prisma.task.findMany({ where: { project_id: projectId } })).resolves.toEqual([]);
    } finally {
      await dal.close();
    }
  });

  test('freeze is project-scoped and rejects cross-project reuse of the same blueprint_id', async () => {
    const otherProject = await prisma.project.create({ data: { name: `other-freeze-project-${Date.now()}` } });

    await freezeV8Blueprint({ prisma, project_id: projectId, blueprint: validBlueprint });

    await expect(
      freezeV8Blueprint({ prisma, project_id: otherProject.id, blueprint: validBlueprint }),
    ).rejects.toThrow(/already belongs to another project/);

    await expect(prisma.task.findMany({ where: { project_id: otherProject.id } })).resolves.toEqual([]);
  });

  test('freeze validates the frozen V8 blueprint schema before any DB write', async () => {
    const malformed = {
      ...validBlueprint,
      blueprint_id: 'bp-v8-freeze-malformed',
      phases: [
        {
          ...validBlueprint.phases[0],
          tasks: [
            {
              ...validBlueprint.phases[0].tasks[0],
              status: 'dispatched',
            },
          ],
        },
      ],
    };

    await expect(freezeV8Blueprint({ prisma, project_id: projectId, blueprint: malformed })).rejects.toThrow(
      /Invalid V8 blueprint/,
    );

    await expect(prisma.projectBlueprint.findMany({ where: { project_id: projectId } })).resolves.toEqual([]);
    await expect(prisma.task.findMany({ where: { project_id: projectId } })).resolves.toEqual([]);
  });
});
