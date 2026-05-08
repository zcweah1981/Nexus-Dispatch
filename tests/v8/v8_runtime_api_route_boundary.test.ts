import { execFileSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import request from 'supertest';
import { PrismaClient } from '@prisma/client';
import { createServer } from '../../src/api/server';
import { ProjectRepository } from '../../src/repositories/v8';

const repoRoot = path.resolve(__dirname, '../..');

function makeLegacyDalTrap() {
  const trap = new Proxy(
    {},
    {
      get(_target, prop) {
        throw new Error(`Legacy DAL must not be touched by V8 Runtime API routes: ${String(prop)}`);
      },
    },
  );
  return trap as any;
}

describe('V8-R2 Runtime API route boundary', () => {
  let tmpDir: string;
  let prisma: PrismaClient;
  let app: ReturnType<typeof createServer>;

  beforeEach(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-v8-r2-route-boundary-'));
    const dbPath = path.join(tmpDir, 'runtime-routes.db');
    execFileSync('npm', ['run', 'db:init:test', '--', dbPath], {
      cwd: repoRoot,
      encoding: 'utf8',
      env: { ...process.env, DATABASE_URL: undefined },
    });
    prisma = new PrismaClient({ datasources: { db: { url: `file:${dbPath}` } } });
    app = createServer(makeLegacyDalTrap(), 'test-token', { client: prisma } as any);
  }, 30000);

  afterEach(async () => {
    await prisma.$disconnect();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test('projects/tasks/runs/reports Runtime routes call V8 services/repositories and stay project-scoped', async () => {
    const projectA = await request(app)
      .post('/api/v1/runtime/projects')
      .set('Authorization', 'Bearer test-token')
      .send({ name: 'route-boundary-a', channel_config: { description: 'V8 route boundary A' } })
      .expect(201);
    const projectB = await request(app)
      .post('/api/v1/runtime/projects')
      .set('Authorization', 'Bearer test-token')
      .send({ name: 'route-boundary-b' })
      .expect(201);

    await request(app)
      .get(`/api/v1/runtime/projects/${projectA.body.project.id}`)
      .set('Authorization', 'Bearer test-token')
      .expect(200)
      .expect((res) => expect(res.body.project).toMatchObject({ id: projectA.body.project.id, name: 'route-boundary-a' }));

    const taskA = await request(app)
      .post('/api/v1/runtime/tasks')
      .set('Authorization', 'Bearer test-token')
      .send({
        project_id: projectA.body.project.id,
        title: 'V8 route task A',
        objective: 'Create via service boundary',
        lane_required: 'DEV',
        payload: { scope: 'project-a' },
      })
      .expect(201);
    const taskB = await request(app)
      .post('/api/v1/runtime/tasks')
      .set('Authorization', 'Bearer test-token')
      .send({
        project_id: projectB.body.project.id,
        title: 'V8 route task B',
        objective: 'Cross-project isolation target',
        lane_required: 'DEV',
      })
      .expect(201);

    await request(app)
      .get(`/api/v1/runtime/tasks/${taskA.body.task.id}?project_id=${projectA.body.project.id}`)
      .set('Authorization', 'Bearer test-token')
      .expect(200)
      .expect((res) => expect(res.body.task).toMatchObject({ id: taskA.body.task.id, project_id: projectA.body.project.id }));
    await request(app)
      .get(`/api/v1/runtime/tasks/${taskA.body.task.id}?project_id=${projectB.body.project.id}`)
      .set('Authorization', 'Bearer test-token')
      .expect(404);

    await prisma.agent.create({
      data: {
        id: 'long-coder-1',
        agent_id: 'long-coder-1',
        project_id: projectA.body.project.id,
        endpoint: 'http://127.0.0.1/worker',
        lane: 'DEV',
        dialect: 'hermes',
        soul_prompt: '',
        tools_allowed: '[]',
        status: 'online',
      },
    });

    const run = await request(app)
      .post('/api/v1/runtime/runs')
      .set('Authorization', 'Bearer test-token')
      .send({
        project_id: projectA.body.project.id,
        task_id: taskA.body.task.id,
        agent_id: 'long-coder-1',
        idempotency_key: 'route-boundary-run-a',
      })
      .expect(201);
    await request(app)
      .post('/api/v1/runtime/runs')
      .set('Authorization', 'Bearer test-token')
      .send({
        project_id: projectB.body.project.id,
        task_id: taskA.body.task.id,
        agent_id: 'long-coder-1',
        idempotency_key: 'route-boundary-cross-project-run',
      })
      .expect(404);
    await request(app)
      .patch(`/api/v1/runtime/runs/${run.body.run.run_id}/status`)
      .set('Authorization', 'Bearer test-token')
      .send({ project_id: projectA.body.project.id, status: 'success', result_summary: 'route boundary pass' })
      .expect(200)
      .expect((res) => expect(res.body.run).toMatchObject({ run_id: run.body.run.run_id, project_id: projectA.body.project.id, status: 'success' }));

    const report = await request(app)
      .post('/api/v1/runtime/reports')
      .set('Authorization', 'Bearer test-token')
      .send({
        project_id: projectA.body.project.id,
        task_id: taskA.body.task.id,
        run_id: run.body.run.run_id,
        message_type: 'agent_result',
        payload_json: { result: 'ok' },
      })
      .expect(201);
    await request(app)
      .post('/api/v1/runtime/reports')
      .set('Authorization', 'Bearer test-token')
      .send({
        project_id: projectB.body.project.id,
        task_id: taskA.body.task.id,
        message_type: 'agent_result',
        payload_json: { result: 'cross-project should fail' },
      })
      .expect(404);
    await request(app)
      .patch(`/api/v1/runtime/reports/${report.body.report.id}/status`)
      .set('Authorization', 'Bearer test-token')
      .send({ project_id: projectA.body.project.id, status: 'sent', delivery_json: { proof: 'stored' } })
      .expect(200)
      .expect((res) => expect(res.body.report).toMatchObject({ id: report.body.report.id, project_id: projectA.body.project.id, status: 'sent' }));

    const persistedTaskB = await prisma.task.findFirst({ where: { id: taskB.body.task.id, project_id: projectB.body.project.id } });
    expect(persistedTaskB?.status).toBe('created');
  });

  test('Runtime route source stays thin: no direct SQL, no legacy DAL, and state changes go through services/controllers', () => {
    const routesSource = fs.readFileSync(path.join(repoRoot, 'src/api/routes.ts'), 'utf8');
    const serviceSource = fs.readFileSync(path.join(repoRoot, 'src/services/v8_runtime_api_service.ts'), 'utf8');
    const runtimeSection = routesSource.slice(
      routesSource.indexOf('V8-R2 Runtime API + FSM Controller boundary'),
      routesSource.indexOf('// ═══════════════════════════════════════════════════════════════\n  //  T2.1:'),
    );

    expect(runtimeSection).toContain('new V8RuntimeApiService');
    expect(runtimeSection).toContain('transitionTask(');
    expect(runtimeSection).not.toMatch(/\(dal as any\)|\.db\.|prepare\(|\$queryRaw|\$executeRaw|UPDATE\s+nexus_tasks|updateTaskStatus\(/i);
    expect(runtimeSection).not.toMatch(/prismaDal\.client\.(project|task|run|report)\.(create|update|updateMany|findUnique|findFirst|findMany)/);
    expect(serviceSource).toContain('ProjectRepository');
    expect(serviceSource).toContain('TaskRepository');
    expect(serviceSource).toContain('RunRepository');
    expect(serviceSource).toContain('ReportRepository');
    expect(serviceSource).not.toMatch(/better-sqlite3|sqlite3|data\/nexus\.db|prisma\/data\/nexus\.db|UPDATE\s+nexus_tasks/i);
  });
});
