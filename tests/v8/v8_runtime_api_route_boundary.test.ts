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

    const artifact = await request(app)
      .post('/api/v1/runtime/artifacts')
      .set('Authorization', 'Bearer test-token')
      .send({
        project_id: projectA.body.project.id,
        task_id: taskA.body.task.id,
        run_id: run.body.run.run_id,
        artifact_type: 'report_proof',
        payload: { report_id: 'route-report-1', status: 'sent' },
        proof: { channel: 'telegram', message_id: 'msg-1' },
        path: `${projectA.body.project.id}:${run.body.run.run_id}:route-report-1`,
      })
      .expect(201);
    expect(artifact.body.artifact).toMatchObject({
      project_id: projectA.body.project.id,
      task_id: taskA.body.task.id,
      run_id: run.body.run.run_id,
      artifact_type: 'report_proof',
    });
    await request(app)
      .post('/api/v1/runtime/artifacts')
      .set('Authorization', 'Bearer test-token')
      .send({
        project_id: projectB.body.project.id,
        task_id: taskA.body.task.id,
        run_id: run.body.run.run_id,
        artifact_type: 'report_proof',
        payload: { report_id: 'cross-project-artifact' },
      })
      .expect(404);

    const cronjob = await request(app)
      .post('/api/v1/runtime/projects/cronjobs')
      .set('Authorization', 'Bearer test-token')
      .send({
        project_id: projectA.body.project.id,
        cronjob_id: 'route-cron-sync',
        name: 'Route Cron Sync',
        schedule: '*/10 * * * *',
        status: 'active',
        owner_agent_id: 'long-coder-1',
        config_json: { prompt: 'sync selected project only' },
      })
      .expect(201);
    expect(cronjob.body.cronjob).toMatchObject({
      project_id: projectA.body.project.id,
      cronjob_id: 'route-cron-sync',
      status: 'active',
    });
    await request(app)
      .post('/api/v1/runtime/projects/cronjobs')
      .set('Authorization', 'Bearer test-token')
      .send({
        project_id: projectB.body.project.id,
        cronjob_id: 'route-cron-sync',
        name: 'Route Cron Sync B',
        schedule: '0 * * * *',
      })
      .expect(201);
    await request(app)
      .get(`/api/v1/runtime/projects/${projectA.body.project.id}/cronjobs`)
      .set('Authorization', 'Bearer test-token')
      .expect(200)
      .expect((res) => {
        expect(res.body.cronjobs).toHaveLength(1);
        expect(res.body.cronjobs[0]).toMatchObject({ project_id: projectA.body.project.id, cronjob_id: 'route-cron-sync' });
      });
    await request(app)
      .patch(`/api/v1/runtime/projects/${projectA.body.project.id}/cronjobs/route-cron-sync/status`)
      .set('Authorization', 'Bearer test-token')
      .send({ status: 'paused' })
      .expect(200)
      .expect((res) => expect(res.body.cronjob).toMatchObject({ project_id: projectA.body.project.id, cronjob_id: 'route-cron-sync', status: 'paused' }));
    await request(app)
      .patch(`/api/v1/runtime/projects/${projectB.body.project.id}/cronjobs/${cronjob.body.cronjob.id}/status`)
      .set('Authorization', 'Bearer test-token')
      .send({ status: 'active' })
      .expect(404);
    await request(app)
      .post('/api/v1/runtime/projects/cronjobs')
      .set('Authorization', 'Bearer test-token')
      .send({ project_id: 'missing-project', cronjob_id: 'missing', name: 'Missing', schedule: '* * * * *' })
      .expect(404);

    await request(app)
      .post('/api/v1/runtime/projects/cronjobs')
      .set('Authorization', 'Bearer test-token')
      .send({
        project_id: projectA.body.project.id,
        cronjob_id: 'manual-cron',
        name: 'Manual Cron',
        schedule: '0 0 * * *',
        status: 'active',
        enabled_policy: 'manual',
      })
      .expect(201)
      .expect((res) => expect(res.body.cronjob).toMatchObject({ enabled_policy: 'manual' }));
    await request(app)
      .post('/api/v1/runtime/projects/cronjobs')
      .set('Authorization', 'Bearer test-token')
      .send({
        project_id: projectA.body.project.id,
        cronjob_id: 'project-active-cron',
        name: 'Project Active Cron',
        schedule: '*/15 * * * *',
        status: 'active',
        enabled_policy: 'project_active',
      })
      .expect(201);
    await request(app)
      .get(`/api/v1/runtime/projects/${projectA.body.project.id}/cronjobs?eligible=true`)
      .set('Authorization', 'Bearer test-token')
      .expect(200)
      .expect((res) => {
        const ids = res.body.cronjobs.map((item: any) => item.cronjob_id);
        expect(ids).toContain('project-active-cron');
        expect(ids).not.toContain('manual-cron');
      });
    await request(app)
      .post('/api/v1/runtime/projects/cronjobs')
      .set('Authorization', 'Bearer test-token')
      .send({
        project_id: projectA.body.project.id,
        cronjob_id: 'bad-policy-cron',
        name: 'Bad Policy Cron',
        schedule: '* * * * *',
        enabled_policy: 'telegram_session',
      })
      .expect(422);

    const report = await request(app)
      .post('/api/v1/runtime/reports')
      .set('Authorization', 'Bearer test-token')
      .send({
        project_id: projectA.body.project.id,
        task_id: taskA.body.task.id,
        run_id: run.body.run.run_id,
        message_type: 'agent_result',
        payload_json: { result: 'ok' },
        dedupe_key: 'route-boundary-result-once',
      })
      .expect(201);
    const duplicateReport = await request(app)
      .post('/api/v1/runtime/reports')
      .set('Authorization', 'Bearer test-token')
      .send({
        project_id: projectA.body.project.id,
        task_id: taskA.body.task.id,
        run_id: run.body.run.run_id,
        message_type: 'agent_result',
        payload_json: { result: 'duplicate should be suppressed' },
        dedupe_key: 'route-boundary-result-once',
      })
      .expect(201);
    expect(duplicateReport.body.report.id).toBe(report.body.report.id);
    await expect(prisma.report.count({ where: { project_id: projectA.body.project.id, dedupe_key: 'route-boundary-result-once' } })).resolves.toBe(1);
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
      .expect(409);
    await request(app)
      .patch(`/api/v1/runtime/reports/${report.body.report.id}/status`)
      .set('Authorization', 'Bearer test-token')
      .send({ project_id: projectA.body.project.id, status: 'sending', delivery_json: { channel: 'telegram' } })
      .expect(200)
      .expect((res) => expect(res.body.report).toMatchObject({ id: report.body.report.id, project_id: projectA.body.project.id, status: 'sending' }));
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
    expect(serviceSource).toContain('ArtifactRepository');
    expect(serviceSource).toContain('ProjectCronjobRepository');
    expect(serviceSource).toContain('ReportRepository');
    expect(serviceSource).not.toMatch(/better-sqlite3|sqlite3|data\/nexus\.db|prisma\/data\/nexus\.db|UPDATE\s+nexus_tasks/i);
  });
});
