import { execFileSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import request from 'supertest';
import { PrismaClient } from '@prisma/client';
import { createServer } from '../../src/api/server';

const repoRoot = path.resolve(__dirname, '../..');
const TOKEN = 'test-token';

function makeLegacyDalTrap() {
  return new Proxy({}, {
    get(_target, prop) {
      throw new Error(`Legacy DAL must not be touched by R37 WebUI Runtime read APIs: ${String(prop)}`);
    },
  }) as any;
}

function flattened(value: unknown): string {
  return JSON.stringify(value);
}

function expectNoSecretsOrRawProof(value: unknown) {
  const text = flattened(value);
  expect(text).not.toMatch(/sk-r37-secret|ghp_r37secret|Bearer\s+r37|xoxb-r37|123456:telegram-secret|-1009876543210/);
  expect(text).not.toMatch(/raw_proof|payload_json|delivery_json|proof_data|soul_prompt|tools_allowed|bot_token|chat_id|DATABASE_URL/);
}

describe('R37 WebUI Runtime read API gaps', () => {
  let tmpDir: string;
  let prisma: PrismaClient;
  let app: ReturnType<typeof createServer>;
  let projectA: any;
  let projectB: any;
  let groupA: any;
  let taskA: any;
  let taskB: any;
  let runA: any;

  beforeEach(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-r37-webui-runtime-api-'));
    const dbPath = path.join(tmpDir, 'runtime-read-api.db');
    execFileSync('npm', ['run', 'db:init:test', '--', dbPath], {
      cwd: repoRoot,
      encoding: 'utf8',
      env: { ...process.env, DATABASE_URL: undefined },
    });
    prisma = new PrismaClient({ datasources: { db: { url: `file:${dbPath}` } } });
    app = createServer(makeLegacyDalTrap(), TOKEN, { client: prisma } as any);

    projectA = await prisma.project.create({
      data: {
        id: 'r37-project-a',
        name: 'R37 Project A',
        channel_config: JSON.stringify({
          visible_language: 'zh-CN',
          repo_ref: '/root/private/nexus-dispatch',
          governance_ref: '/root/.hermes/projects/nexus-dispatch',
          directories: {
            repo: '/root/private/nexus-dispatch',
            docs: 'docs',
            proof: '/root/.hermes/projects/nexus-dispatch/docs/proofs',
          },
          bot_token: '123456:telegram-secret',
          chat_id: '-1009876543210',
          openai_token: 'sk-r37-secret',
        }),
      },
    });
    projectB = await prisma.project.create({ data: { id: 'r37-project-b', name: 'R37 Project B' } });
    groupA = await prisma.taskGroup.create({
      data: {
        id: 'r37-group-a-id',
        project_id: projectA.id,
        group_id: 'r37-phase-a',
        name: 'R37 Phase A',
        status: 'active',
        ext_meta: JSON.stringify({ phase_id: 'phase-a', blueprint_id: 'bp-r37' }),
      },
    });

    taskA = await prisma.task.create({
      data: {
        id: 'r37-task-a',
        project_id: projectA.id,
        title: 'R37 Runtime API task',
        objective: 'Expose WebUI read endpoint without DB bypass',
        lane_required: 'DEV',
        status: 'running',
        task_group_id: groupA.id,
        payload: JSON.stringify({ token: 'sk-r37-secret', note: 'backend raw payload' }),
        proof_data: JSON.stringify({ raw_proof: 'Bearer r37 secret proof', trace_id: 'trace-r37' }),
        ext_meta: JSON.stringify({ proof_summary: 'pytest focused slice passed', nextResponsible: 'Reviewer' }),
      },
    });
    taskB = await prisma.task.create({
      data: {
        id: 'r37-task-b',
        project_id: projectB.id,
        title: 'Other project hidden task',
        objective: 'Must not leak into project A responses',
        lane_required: 'DEV',
        status: 'blocked',
      },
    });
    await prisma.taskDependency.create({
      data: {
        project_id: projectA.id,
        task_id: taskA.id,
        depends_on_id: taskA.id,
        dependency_type: 'related',
      },
    });
    const agentA = await prisma.agent.create({
      data: {
        id: 'r37-agent-a-internal',
        agent_id: 'long-coder-1',
        project_id: projectA.id,
        endpoint: 'https://worker.example.com/hook?token=sk-r37-secret&github=ghp_r37secret',
        lane: 'DEV',
        dialect: 'hermes',
        soul_prompt: 'secret soul prompt',
        tools_allowed: JSON.stringify(['terminal', 'file', 'bot_token=123456:telegram-secret']),
        status: 'online',
        last_heartbeat: new Date(),
      },
    });
    runA = await prisma.run.create({
      data: {
        run_id: 'r37-run-a',
        project_id: projectA.id,
        task_id: taskA.id,
        agent_id: agentA.id,
        dispatch_id: 'dispatch-secret-r37',
        worker_run_id: 'worker-secret-r37',
        idempotency_key: 'r37-run-a-key',
        status: 'running',
        result_summary: 'worker accepted',
      },
    });
    await prisma.report.create({
      data: {
        id: 'r37-report-a',
        project_id: projectA.id,
        task_id: taskA.id,
        run_id: runA.run_id,
        message_type: 'agent_result',
        status: 'pending',
        summary: 'Proof 已存系统；验证通过',
        payload_json: JSON.stringify({ raw_proof: 'Bearer r37', token: 'sk-r37-secret' }),
        delivery_json: JSON.stringify({ chat_id: '-1009876543210', bot_token: '123456:telegram-secret' }),
      },
    });
    await prisma.artifact.create({
      data: {
        id: 'r37-artifact-a',
        project_id: projectA.id,
        task_id: taskA.id,
        run_id: runA.run_id,
        artifact_type: 'report_proof',
        payload: JSON.stringify({ raw_proof: 'Bearer r37', token: 'sk-r37-secret' }),
        payload_data: JSON.stringify({ raw_proof: 'Bearer r37' }),
        proof: JSON.stringify({ chat_id: '-1009876543210' }),
        path: `${projectA.id}:${runA.run_id}:r37-report-a`,
      },
    });
  }, 30000);

  afterEach(async () => {
    await prisma.$disconnect();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test('project-scoped WebUI MVP read endpoints hydrate pages without cross-project leakage or secret exposure', async () => {
    const endpoints = [
      `/api/v1/runtime/projects/${projectA.id}/summary`,
      `/api/v1/runtime/projects/${projectA.id}/tasks?include_graph=true`,
      `/api/v1/runtime/projects/${projectA.id}/groups?include_tasks=true`,
      `/api/v1/runtime/projects/${projectA.id}/dispatch/live`,
      `/api/v1/runtime/projects/${projectA.id}/reports?limit=10`,
      `/api/v1/runtime/projects/${projectA.id}/artifacts?limit=10`,
      `/api/v1/runtime/projects/${projectA.id}/settings`,
      `/api/v1/runtime/projects/${projectA.id}/directories`,
      `/api/v1/runtime/projects/${projectA.id}/observability`,
      `/api/v1/runtime/projects/${projectA.id}/agents`,
    ];

    for (const endpoint of endpoints) {
      const response = await request(app).get(endpoint).set('Authorization', `Bearer ${TOKEN}`).expect(200);
      expect(flattened(response.body)).toContain(projectA.id);
      expect(flattened(response.body)).not.toContain(projectB.id);
      expect(flattened(response.body)).not.toContain(taskB.id);
      expectNoSecretsOrRawProof(response.body);
    }

    await request(app)
      .get(`/api/v1/runtime/projects/${projectB.id}/tasks?include_graph=true`)
      .set('Authorization', `Bearer ${TOKEN}`)
      .expect(200)
      .expect((res) => {
        expect(res.body.tasks.map((task: any) => task.id)).toEqual([taskB.id]);
        expect(flattened(res.body)).not.toContain(taskA.id);
      });

    await request(app)
      .get('/api/v1/runtime/projects/missing-project/tasks')
      .set('Authorization', `Bearer ${TOKEN}`)
      .expect(404);
  });

  test('R37 WebUI Runtime read routes remain thin and do not bypass DB/service boundary', () => {
    const routesSource = fs.readFileSync(path.join(repoRoot, 'src/api/routes.ts'), 'utf8');
    const runtimeSection = routesSource.slice(
      routesSource.indexOf('V8-R2 Runtime API + FSM Controller boundary'),
      routesSource.indexOf('// ═══════════════════════════════════════════════════════════════\n  //  T2.1:'),
    );

    for (const serviceCall of [
      'getProjectSummary',
      'listTasksForWebUI',
      'listTaskGroupsForWebUI',
      'getDispatchLive',
      'listReportsForWebUI',
      'listArtifactsForWebUI',
      'getProjectSettingsForWebUI',
      'getProjectDirectoriesForWebUI',
      'getObservabilityForWebUI',
    ]) {
      expect(runtimeSection).toContain(`service.${serviceCall}`);
    }
    expect(runtimeSection).not.toMatch(/better-sqlite3|sqlite3|data\/nexus\.db|prisma\/data\/nexus\.db|\$queryRaw|\$executeRaw|\.findMany\(|\.findFirst\(|\.update\(|\.create\(/);
  });
});
