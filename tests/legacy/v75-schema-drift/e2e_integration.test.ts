import request from 'supertest';
import { createServer, stateEmitter } from '../src/api/server';
import DAL from '../src/db/dal';
import { PrismaDAL } from '../src/db/prisma_dal';
import Daemon from '../src/daemon/main';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';

const AUTH_TOKEN = 'test-e2e-token';

jest.setTimeout(60000);

describe('Phase 5: E2E 集成测试 (nd-v75-t51)', () => {
  let app: any;
  let prismaDal: PrismaDAL;
  let legacyDal: DAL;
  let daemon: Daemon;
  let tmpDbPath: string;
  let tmpDir: string;
  let projectId: string;
  let pmAgentId = 'pm-orchestrator-1';
  let devAgentId = 'dev-agent-1';

  beforeAll(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-e2e-'));
    tmpDbPath = path.join(tmpDir, 'e2e.db');
    process.env.DATABASE_URL = `file:${tmpDbPath}`;

    prismaDal = new PrismaDAL(`file:${tmpDbPath}`);
    await prismaDal.initPragmas();

    // Push schema
    const { execSync } = require('child_process');
    execSync(`npx prisma db push --skip-generate --accept-data-loss`, {
      cwd: '/opt/projects/nexus-dispatch',
      env: { ...process.env, DATABASE_URL: `file:${tmpDbPath}` },
      stdio: 'pipe',
    });

    legacyDal = new DAL(path.join(tmpDir, 'legacy.db'));
    legacyDal.initSchema(`
      CREATE TABLE IF NOT EXISTS nexus_projects (id TEXT PRIMARY KEY, name TEXT);
      CREATE TABLE IF NOT EXISTS nexus_tasks (id TEXT PRIMARY KEY, status TEXT);
    `);

    app = createServer(legacyDal, AUTH_TOKEN, prismaDal);

    // Setup Agent Notifications
    process.env.AGENT_NOTIFICATIONS = JSON.stringify({
      [pmAgentId]: { bot_token: 'pm_token', chat_id: 'group_1' },
      [devAgentId]: { bot_token: 'dev_token', chat_id: 'group_1' }
    });

    daemon = new Daemon({
      apiUrl: 'http://localhost:8000/api/v1',
      authToken: AUTH_TOKEN,
      tickInterval: 100,
      recoveryTimeoutMinutes: 0.001,
    });

    (daemon as any).apiClient = {
      get: async (url: string) => {
        const res = await request(app).get('/api/v1' + url).set('Authorization', `Bearer ${AUTH_TOKEN}`);
        return { data: res.body };
      },
      post: async (url: string, body: any) => {
        const res = await request(app).post('/api/v1' + url).set('Authorization', `Bearer ${AUTH_TOKEN}`).send(body);
        return { data: res.body, status: res.status };
      },
      patch: async (url: string, body: any) => {
        const res = await request(app).patch('/api/v1' + url).set('Authorization', `Bearer ${AUTH_TOKEN}`).send(body);
        return { data: res.body, status: res.status };
      }
    };

    const axios = require('axios');
    axios.post = jest.fn(async (url: string, body: any) => {
      if (url.includes('telegram.org')) return { data: { ok: true } };
      return { status: 202, data: { message: 'Accepted' } };
    });

    await prismaDal.registerAgent({ id: pmAgentId, lane: 'ORCHESTRATOR', endpoint: 'http://pm.local:9999', dialect: 'openclaw' });
    await prismaDal.registerAgent({ id: devAgentId, lane: 'DEV', endpoint: 'http://dev-agent.local:9000', dialect: 'openclaw' });
    
    await prismaDal.client.fSMController.create({
      data: {
        controller_id: 'fsm-task-v1',
        name: 'Task FSM',
        entity_type: 'task',
        states_json: '[]',
        transitions_json: '[]',
        initial_state: 'created',
        config_json: JSON.stringify({ default_reviewer: pmAgentId })
      }
    });

    const projRes = await request(app).post('/api/v1/projects/init').set('Authorization', `Bearer ${AUTH_TOKEN}`).send({ name: 'E2E Project' });
    projectId = projRes.body.id;
  });

  afterAll(async () => {
    await prismaDal.close();
    legacyDal.close();
  });

  test('完整闭环 + AC-Flow-4 (Blueprint Completion)', async () => {
    const bpId = 'bp-e2e-1';
    await request(app).post('/api/v1/blueprints').set('Authorization', `Bearer ${AUTH_TOKEN}`).send({
      project_id: projectId,
      blueprint_id: bpId,
      name: 'E2E Blueprint',
      schema_json: {
        phases: [
          {
            phase_id: 'p1',
            group_id: 'p1-group',
            name: 'Phase 1',
            tasks: [
              { title: 'P1-Task1', objective: 'obj1', lane_required: 'DEV', acceptance_mode: 'pm_audit' }
            ]
          }
        ]
      }
    });

    await prismaDal.client.projectBlueprint.update({ where: { blueprint_id: bpId }, data: { status: 'active' } });
    
    const group1 = await prismaDal.createTaskGroup({ group_id: 'p1-group', name: 'Phase 1' });
    const t1 = await prismaDal.createTask({
      project_id: projectId,
      task_group_id: group1.id,
      title: 'P1-Task1',
      objective: 'obj1',
      lane_required: 'DEV',
      acceptance_mode: 'pm_audit',
      status: 'created'
    });

    await daemon.tick();
    
    let task1 = await prismaDal.getTask(t1.id);
    expect(task1?.status).toBe('dispatched');

    const runs = await prismaDal.client.run.findMany({ where: { task_id: t1.id } });
    await request(app).post(`/api/v1/tasks/${t1.id}/submit_proof_v2`).set('Authorization', `Bearer ${AUTH_TOKEN}`).send({
      run_id: runs[0].run_id,
      artifact_type: 'test_artifact',
      payload: { data: 'proof' }
    });

    await request(app).post(`/api/v1/tasks/${t1.id}/accept`).set('Authorization', `Bearer ${AUTH_TOKEN}`).send({
      reviewer_id: pmAgentId,
      note: 'Accept'
    });

    task1 = await prismaDal.getTask(t1.id);
    expect(task1?.status).toBe('completed');

    await (daemon as any).runFreezerTick();
    const updatedGroup1 = await prismaDal.getTaskGroup('p1-group');
    expect(updatedGroup1?.status).toBe('archived');
  });

  test('AC-Flow-2: 超时任务回收', async () => {
    // Clear other tasks to avoid interference
    await prismaDal.client.task.deleteMany({ where: { title: 'Timeout Task' } });

    const task = await prismaDal.createTask({ project_id: projectId, title: 'Timeout Task', objective: 'obj', lane_required: 'DEV', status: 'dispatched' });
    
    const agent = await prismaDal.client.agent.findUnique({ where: { agent_id: devAgentId } });
    await prismaDal.client.run.create({
      data: {
        task_id: task.id,
        agent_id: agent!.id,
        idempotency_key: 'timeout-run',
        status: 'running',
        started_at: new Date(Date.now() - 3600000)
      }
    });

    const result = await daemon.tick();
    expect(result.recovered).toBeGreaterThanOrEqual(1);

    const updatedTask = await prismaDal.getTask(task.id);
    expect(updatedTask?.status).toBe('created');
  });

  test('AC-Flow-3: 审核 fail -> retry_ready -> 重派成功', async () => {
    // Clear other tasks to avoid interference
    await prismaDal.client.task.deleteMany({ where: { title: 'Retry Task' } });

    const task = await prismaDal.createTask({ project_id: projectId, title: 'Retry Task', objective: 'obj', lane_required: 'DEV', status: 'dispatched', acceptance_mode: 'pm_audit', max_retries: 2 });
    const agent = await prismaDal.client.agent.findUnique({ where: { agent_id: devAgentId } });
    const run = await prismaDal.client.run.create({
      data: { 
        task_id: task.id, 
        agent_id: agent!.id, 
        idempotency_key: 'retry-run', 
        status: 'running' 
      }
    });
    
    await request(app).post(`/api/v1/tasks/${task.id}/submit_proof_v2`).set('Authorization', `Bearer ${AUTH_TOKEN}`).send({
      run_id: run.run_id, artifact_type: 'test', payload: {}
    });

    await request(app).post(`/api/v1/tasks/${task.id}/reject`).set('Authorization', `Bearer ${AUTH_TOKEN}`).send({
      reviewer_id: pmAgentId, reason: 'Bad'
    });

    const retriedTask = await prismaDal.getTask(task.id);
    expect(retriedTask?.status).toBe('created');
    expect(retriedTask?.retry_count).toBe(1);

    await daemon.tick();
    const finalTask = await prismaDal.getTask(task.id);
    expect(finalTask?.status).toBe('dispatched');
  });
});
