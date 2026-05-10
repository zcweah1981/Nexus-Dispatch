import { execFileSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import request from 'supertest';
import { PrismaClient } from '@prisma/client';
import { createServer } from '../../src/api/server';
import type { V8Blueprint } from '../../src/blueprints/v8_blueprint_schema';

const repoRoot = path.resolve(__dirname, '../..');
const TOKEN = 'test-token';

function makeLegacyDalTrap() {
  return new Proxy({}, {
    get(_target, prop) {
      throw new Error(`Legacy DAL must not be touched by R9 V8 E2E Runtime API: ${String(prop)}`);
    },
  }) as any;
}

function makeBlueprint(): V8Blueprint {
  return {
    version: 'v8-r9',
    blueprint_id: `bp-r9-e2e-${Date.now()}`,
    name: 'R9 project agent blueprint thaw E2E',
    phases: [
      {
        phase_id: 'r9-p1',
        name: 'R9 Phase 1',
        group_id: 'r9-p1-group',
        priority: 10,
        tasks: [
          {
            task_id: 'r9-p1-t1',
            title: 'R9 implement first task',
            objective: 'Verify thawed task is created through V8 Runtime API flow',
            lane_required: 'DEV',
            acceptance_mode: 'manual',
            acceptance_criteria: ['task is thawed as created in project scope'],
            reviewer: 'shun-reviewer-r9',
            payload: { step: 'first' },
          },
          {
            task_id: 'r9-p1-t2',
            title: 'R9 implement dependent task',
            objective: 'Verify thaw creates project-scoped dependency',
            lane_required: 'DEV',
            acceptance_mode: 'manual',
            acceptance_criteria: ['dependency is project scoped'],
            depends_on: ['r9-p1-t1'],
          },
        ],
      },
    ],
  };
}

describe('V8-R9-T1 project -> agents -> blueprint -> thaw E2E', () => {
  let tmpDir: string;
  let prisma: PrismaClient;
  let app: ReturnType<typeof createServer>;

  beforeEach(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-v8-r9-e2e-'));
    const dbPath = path.join(tmpDir, 'r9-e2e.db');
    execFileSync('npm', ['run', 'db:init:test', '--', dbPath], {
      cwd: repoRoot,
      encoding: 'utf8',
      env: { ...process.env, DATABASE_URL: undefined },
    });
    prisma = new PrismaClient({ datasources: { db: { url: `file:${dbPath}` } } });
    app = createServer(makeLegacyDalTrap(), TOKEN, { client: prisma } as any);
  }, 30000);

  afterEach(async () => {
    await prisma.$disconnect();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test('creates project, registers project-scoped agents, freezes blueprint, and thaws current phase through V8 Runtime API only', async () => {
    const project = await request(app)
      .post('/api/v1/runtime/projects')
      .set('Authorization', `Bearer ${TOKEN}`)
      .send({ id: 'r9-e2e-project', name: 'R9 E2E Project', channel_config: { telegram_topic: 'hidden-proof-only' } })
      .expect(201);

    const projectId = project.body.project.id;
    expect(projectId).toBe('r9-e2e-project');

    await request(app)
      .post(`/api/v1/runtime/projects/${projectId}/agents`)
      .set('Authorization', `Bearer ${TOKEN}`)
      .send({
        agent_id: 'long-coder-r9',
        lane: 'DEV',
        endpoint: 'http://127.0.0.1:18080/long',
        dialect: 'hermes',
        soul_prompt: 'Execute only dispatched DEV work',
        tools_allowed: ['terminal', 'file'],
        status: 'online',
      })
      .expect(201)
      .expect((res) => expect(res.body.agent).toMatchObject({ project_id: projectId, agent_id: 'long-coder-r9', status: 'online' }));

    await request(app)
      .post(`/api/v1/runtime/projects/${projectId}/agents`)
      .set('Authorization', `Bearer ${TOKEN}`)
      .send({
        agent_id: 'shun-reviewer-r9',
        lane: 'REVIEW',
        endpoint: 'http://127.0.0.1:18080/shun',
        dialect: 'hermes',
        soul_prompt: 'Review only assigned R9 work',
        tools_allowed: ['terminal'],
        status: 'online',
      })
      .expect(201);

    const listedAgents = await request(app)
      .get(`/api/v1/runtime/projects/${projectId}/agents?status=online`)
      .set('Authorization', `Bearer ${TOKEN}`)
      .expect(200);
    expect(listedAgents.body.agents.map((agent: any) => agent.agent_id).sort()).toEqual(['long-coder-r9', 'shun-reviewer-r9']);

    const otherProject = await request(app)
      .post('/api/v1/runtime/projects')
      .set('Authorization', `Bearer ${TOKEN}`)
      .send({ id: 'r9-other-project', name: 'R9 Other Project' })
      .expect(201);
    await request(app)
      .get(`/api/v1/runtime/projects/${otherProject.body.project.id}/agents?status=online`)
      .set('Authorization', `Bearer ${TOKEN}`)
      .expect(200)
      .expect((res) => expect(res.body.agents).toEqual([]));

    const blueprint = makeBlueprint();
    const freeze = await request(app)
      .post('/api/v1/runtime/blueprints/freeze')
      .set('Authorization', `Bearer ${TOKEN}`)
      .send({ project_id: projectId, blueprint })
      .expect(201);
    expect(freeze.body.result).toMatchObject({ project_id: projectId, blueprint_id: blueprint.blueprint_id, status: 'frozen', phase_count: 1, task_count: 2 });

    await expect(prisma.task.count({ where: { project_id: projectId } })).resolves.toBe(0);

    const thaw = await request(app)
      .post('/api/v1/runtime/blueprints/thaw-current-phase')
      .set('Authorization', `Bearer ${TOKEN}`)
      .send({ project_id: projectId, blueprint_id: blueprint.blueprint_id, phase_id: 'r9-p1' })
      .expect(201);
    expect(thaw.body.result).toMatchObject({
      project_id: projectId,
      blueprint_id: blueprint.blueprint_id,
      phase_id: 'r9-p1',
      group_id: 'r9-p1-group',
      created_task_ids: ['r9-p1-t1', 'r9-p1-t2'],
      dependency_count: 1,
    });

    const group = await prisma.taskGroup.findFirstOrThrow({ where: { project_id: projectId, group_id: 'r9-p1-group' } });
    expect(group.status).toBe('active');

    const tasks = await prisma.task.findMany({ where: { project_id: projectId }, orderBy: { id: 'asc' } });
    expect(tasks.map((task) => ({ id: task.id, status: task.status, group: task.task_group_id }))).toEqual([
      { id: 'r9-p1-t1', status: 'created', group: group.id },
      { id: 'r9-p1-t2', status: 'created', group: group.id },
    ]);
    expect(tasks[0].acceptance_mode).toBe('manual');
    expect(tasks[0].reviewer).toBe('shun-reviewer-r9');
    expect(JSON.parse(tasks[0].payload!)).toEqual({ step: 'first' });

    const deps = await prisma.taskDependency.findMany({ where: { project_id: projectId } });
    expect(deps).toHaveLength(1);
    expect(deps[0]).toMatchObject({ task_id: 'r9-p1-t2', depends_on_id: 'r9-p1-t1' });

    await request(app)
      .post('/api/v1/runtime/blueprints/thaw-current-phase')
      .set('Authorization', `Bearer ${TOKEN}`)
      .send({ project_id: otherProject.body.project.id, blueprint_id: blueprint.blueprint_id, phase_id: 'r9-p1' })
      .expect(404);
  });

  test('R9 Runtime route sections stay thin and do not use legacy DAL/direct SQLite writes', () => {
    const routeSource = fs.readFileSync(path.join(repoRoot, 'src/api/routes.ts'), 'utf8');
    const r9Section = routeSource.slice(
      routeSource.indexOf("router.post('/runtime/projects/:projectId/agents'"),
      routeSource.indexOf("router.post('/runtime/tasks'"),
    );
    expect(r9Section).toContain('service.registerAgent');
    expect(r9Section).toContain('service.freezeBlueprint');
    expect(r9Section).not.toMatch(/prismaDal|new PrismaDAL|new DAL|better-sqlite3|sqlite3|data\/nexus\.db|prisma\/data\/nexus\.db|\$queryRaw|\$executeRaw|prisma\.agent\.create|prisma\.projectBlueprint\.create/);
  });
});
