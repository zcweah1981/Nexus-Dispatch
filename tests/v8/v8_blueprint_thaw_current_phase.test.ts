import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import request from 'supertest';
import { PrismaClient } from '@prisma/client';
import { createServer } from '../../src/api/server';
import DAL from '../../src/db/dal';
import { PrismaDAL } from '../../src/db/prisma_dal';
import { freezeV8Blueprint } from '../../src/engine/v8_blueprint_freezer';
import { thawV8CurrentPhase } from '../../src/engine/v8_blueprint_thaw';
import type { V8Blueprint } from '../../src/blueprints/v8_blueprint_schema';

const repoRoot = path.resolve(__dirname, '../..');
const TOKEN = 'valid-token';

function makeBlueprint(): V8Blueprint {
  return {
    version: 'v8-r3',
    blueprint_id: `bp-v8-thaw-${Date.now()}`,
    name: 'V8 thaw current phase contract',
    phases: [
      {
        phase_id: 'r3-p1',
        name: 'R3 Phase 1',
        group_id: 'v8-thaw-p1',
        priority: 10,
        tasks: [
          {
            task_id: 'v8-thaw-p1-t1',
            title: 'Implement thaw service',
            objective: 'Create task group and first task only when explicit thaw is called',
            lane_required: 'DEV',
            acceptance_mode: 'pm_audit',
            acceptance_criteria: ['group and task are generated from frozen blueprint'],
            reviewer: 'shun-designer-1',
            payload: { scope: 'current-phase' },
            ext_meta: { blueprint_task: true },
            max_retries: 2,
          },
          {
            task_id: 'v8-thaw-p1-t2',
            title: 'Verify thaw idempotency',
            objective: 'Second thaw call must not duplicate task rows',
            lane_required: 'DEV',
            acceptance_mode: 'manual',
            acceptance_criteria: ['idempotent task generation'],
            depends_on: ['v8-thaw-p1-t1'],
          },
        ],
      },
      {
        phase_id: 'r3-p2',
        name: 'R3 Phase 2',
        group_id: 'v8-thaw-p2',
        tasks: [
          {
            task_id: 'v8-thaw-p2-t1',
            title: 'Out of scope next phase',
            objective: 'Must remain frozen during current phase thaw',
            lane_required: 'DEV',
            acceptance_mode: 'manual',
            acceptance_criteria: ['not thawed yet'],
          },
        ],
      },
    ],
  };
}

describe('V8-R3-T3 thaw current phase/group', () => {
  let tmpDir: string;
  let dbPath: string;
  let prisma: PrismaClient;
  let projectId: string;
  let blueprint: V8Blueprint;

  beforeEach(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-v8-r3-thaw-'));
    dbPath = path.join(tmpDir, 'thaw-test.db');
    execFileSync('npm', ['run', 'db:init:test', '--', dbPath], {
      cwd: repoRoot,
      encoding: 'utf8',
      env: { ...process.env, DATABASE_URL: undefined },
    });
    prisma = new PrismaClient({ datasources: { db: { url: `file:${dbPath}` } } });
    const project = await prisma.project.create({ data: { name: `thaw-project-${Date.now()}` } });
    projectId = project.id;
    blueprint = makeBlueprint();
    await freezeV8Blueprint({ prisma, project_id: projectId, blueprint });
  }, 30000);

  afterEach(async () => {
    await prisma.$disconnect();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test('service thaws exactly the requested current phase into one TaskGroup, tasks, and project-scoped dependencies', async () => {
    const result = await thawV8CurrentPhase({ prisma, project_id: projectId, blueprint_id: blueprint.blueprint_id, phase_id: 'r3-p1' });

    expect(result).toMatchObject({
      project_id: projectId,
      blueprint_id: blueprint.blueprint_id,
      phase_id: 'r3-p1',
      group_id: 'v8-thaw-p1',
      status: 'thawed',
      created_group: true,
      created_task_ids: ['v8-thaw-p1-t1', 'v8-thaw-p1-t2'],
      skipped_task_ids: [],
    });

    const group = await prisma.taskGroup.findFirst({ where: { project_id: projectId, group_id: 'v8-thaw-p1' } });
    expect(group).toMatchObject({ name: 'R3 Phase 1', status: 'active', priority: 10 });
    expect(JSON.parse(group!.ext_meta!)).toMatchObject({ blueprint_id: blueprint.blueprint_id, phase_id: 'r3-p1' });

    const tasks = await prisma.task.findMany({ where: { project_id: projectId }, orderBy: { id: 'asc' } });
    expect(tasks.map((task) => task.id)).toEqual(['v8-thaw-p1-t1', 'v8-thaw-p1-t2']);
    expect(tasks.every((task) => task.task_group_id === group!.id)).toBe(true);
    expect(tasks.map((task) => task.status)).toEqual(['created', 'created']);
    expect(tasks[0]).toMatchObject({
      title: 'Implement thaw service',
      objective: 'Create task group and first task only when explicit thaw is called',
      lane_required: 'DEV',
      reviewer: 'shun-designer-1',
      acceptance_mode: 'pm_audit',
      max_retries: 2,
    });
    expect(JSON.parse(tasks[0].payload!)).toEqual({ scope: 'current-phase' });
    expect(JSON.parse(tasks[0].ext_meta!)).toMatchObject({ blueprint_task: true, blueprint_id: blueprint.blueprint_id, phase_id: 'r3-p1' });
    expect(JSON.parse(tasks[0].acceptance_criteria!)).toEqual(['group and task are generated from frozen blueprint']);

    const deps = await prisma.taskDependency.findMany({ where: { project_id: projectId } });
    expect(deps).toHaveLength(1);
    expect(deps[0]).toMatchObject({ task_id: 'v8-thaw-p1-t2', depends_on_id: 'v8-thaw-p1-t1', dependency_type: 'blocks' });

    await expect(prisma.taskGroup.findFirst({ where: { project_id: projectId, group_id: 'v8-thaw-p2' } })).resolves.toBeNull();
    await expect(prisma.task.findFirst({ where: { project_id: projectId, id: 'v8-thaw-p2-t1' } })).resolves.toBeNull();
  });

  test('service is idempotent and refuses cross-project or unknown phase thaw', async () => {
    await thawV8CurrentPhase({ prisma, project_id: projectId, blueprint_id: blueprint.blueprint_id, phase_id: 'r3-p1' });
    const second = await thawV8CurrentPhase({ prisma, project_id: projectId, blueprint_id: blueprint.blueprint_id, phase_id: 'r3-p1' });

    expect(second.created_group).toBe(false);
    expect(second.created_task_ids).toEqual([]);
    expect(second.skipped_task_ids).toEqual(['v8-thaw-p1-t1', 'v8-thaw-p1-t2']);
    await expect(prisma.task.count({ where: { project_id: projectId } })).resolves.toBe(2);
    await expect(prisma.taskDependency.count({ where: { project_id: projectId } })).resolves.toBe(1);

    const otherProject = await prisma.project.create({ data: { name: `other-thaw-project-${Date.now()}` } });
    await expect(
      thawV8CurrentPhase({ prisma, project_id: otherProject.id, blueprint_id: blueprint.blueprint_id, phase_id: 'r3-p1' }),
    ).rejects.toMatchObject({ statusCode: 404, code: 'NOT_FOUND' });

    await expect(
      thawV8CurrentPhase({ prisma, project_id: projectId, blueprint_id: blueprint.blueprint_id, phase_id: 'missing-phase' }),
    ).rejects.toMatchObject({ statusCode: 404, code: 'NOT_FOUND' });
  });

  test('service allows different projects to thaw same group_id from separate blueprints without global unique collisions', async () => {
    await thawV8CurrentPhase({ prisma, project_id: projectId, blueprint_id: blueprint.blueprint_id, phase_id: 'r3-p1' });

    const otherProject = await prisma.project.create({ data: { name: `same-group-project-${Date.now()}` } });
    const otherBlueprint = makeBlueprint();
    otherBlueprint.blueprint_id = `${blueprint.blueprint_id}-other-project`;
    otherBlueprint.phases[0].tasks[0].task_id = 'other-project-thaw-p1-t1';
    otherBlueprint.phases[0].tasks[1].task_id = 'other-project-thaw-p1-t2';
    otherBlueprint.phases[0].tasks[1].depends_on = ['other-project-thaw-p1-t1'];
    otherBlueprint.phases[1].tasks[0].task_id = 'other-project-thaw-p2-t1';
    await freezeV8Blueprint({ prisma, project_id: otherProject.id, blueprint: otherBlueprint });

    const result = await thawV8CurrentPhase({
      prisma,
      project_id: otherProject.id,
      blueprint_id: otherBlueprint.blueprint_id,
      group_id: 'v8-thaw-p1',
    });

    expect(result).toMatchObject({
      project_id: otherProject.id,
      blueprint_id: otherBlueprint.blueprint_id,
      group_id: 'v8-thaw-p1',
      created_group: true,
      created_task_ids: ['other-project-thaw-p1-t1', 'other-project-thaw-p1-t2'],
    });
    await expect(prisma.taskGroup.count({ where: { group_id: 'v8-thaw-p1' } })).resolves.toBe(2);
    await expect(prisma.taskGroup.count({ where: { project_id: projectId, group_id: 'v8-thaw-p1' } })).resolves.toBe(1);
    await expect(prisma.taskGroup.count({ where: { project_id: otherProject.id, group_id: 'v8-thaw-p1' } })).resolves.toBe(1);
  });


  test('service blocks later phase thaw until previous group is complete and has sent group summary proof', async () => {
    await thawV8CurrentPhase({ prisma, project_id: projectId, blueprint_id: blueprint.blueprint_id, phase_id: 'r3-p1' });

    await expect(
      thawV8CurrentPhase({ prisma, project_id: projectId, blueprint_id: blueprint.blueprint_id, phase_id: 'r3-p2' }),
    ).rejects.toMatchObject({ statusCode: 409, code: 'GROUP_SUMMARY_PROOF_REQUIRED' });

    const group = await prisma.taskGroup.findFirstOrThrow({ where: { project_id: projectId, group_id: 'v8-thaw-p1' } });
    await prisma.task.updateMany({ where: { project_id: projectId, task_group_id: group.id }, data: { status: 'completed' } });
    await prisma.taskGroup.update({ where: { id: group.id }, data: { status: 'archived' } });

    await expect(
      thawV8CurrentPhase({ prisma, project_id: projectId, blueprint_id: blueprint.blueprint_id, phase_id: 'r3-p2' }),
    ).rejects.toMatchObject({ statusCode: 409, code: 'GROUP_SUMMARY_PROOF_REQUIRED' });

    await prisma.report.create({
      data: {
        project_id: projectId,
        message_type: 'group_summary',
        status: 'sent',
        summary: 'R3 Phase 1 summary proof sent',
        payload_json: JSON.stringify({ group_id: 'v8-thaw-p1', task_group_id: group.id, completed_tasks: 2 }),
      },
    });

    const result = await thawV8CurrentPhase({ prisma, project_id: projectId, blueprint_id: blueprint.blueprint_id, phase_id: 'r3-p2' });
    expect(result).toMatchObject({
      phase_id: 'r3-p2',
      group_id: 'v8-thaw-p2',
      created_task_ids: ['v8-thaw-p2-t1'],
    });
  });

  test('Runtime API thaws current phase through service boundary and keeps route thin', async () => {
    const legacyDal = new DAL(path.join(tmpDir, 'legacy-api.db'));
    const prismaDal = new PrismaDAL(`file:${dbPath}`);
    await prismaDal.initPragmas();
    const app = createServer(legacyDal, TOKEN, prismaDal);

    try {
      const response = await request(app)
        .post('/api/v1/runtime/blueprints/thaw-current-phase')
        .set('Authorization', `Bearer ${TOKEN}`)
        .send({ project_id: projectId, blueprint_id: blueprint.blueprint_id, phase_id: 'r3-p1' })
        .expect(201);

      expect(response.body.result).toMatchObject({
        project_id: projectId,
        blueprint_id: blueprint.blueprint_id,
        phase_id: 'r3-p1',
        group_id: 'v8-thaw-p1',
        created_task_ids: ['v8-thaw-p1-t1', 'v8-thaw-p1-t2'],
      });

      const routeSource = fs.readFileSync(path.join(repoRoot, 'src/api/routes.ts'), 'utf8');
      const routeSection = routeSource.slice(
        routeSource.indexOf("router.post('/runtime/blueprints/thaw-current-phase'"),
        routeSource.indexOf("router.post('/runtime/runs'"),
      );
      expect(routeSection).toContain('service.thawCurrentPhase');
      expect(routeSection).not.toMatch(/prisma\.task\.create|prisma\.taskGroup\.create|taskDependency\.create|better-sqlite3|sqlite3|data\/nexus\.db|\$queryRaw|\$executeRaw/);
    } finally {
      await prismaDal.close();
      legacyDal.close();
    }
  });
});
