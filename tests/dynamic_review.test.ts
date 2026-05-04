/**
 * T3.3: 动态审核派单引擎 — TDD 测试套件 (9 条测试)
 *
 * 验收标准：
 *   AC1: evaluate_task() 按 acceptance_mode 分流 (pm_audit vs auto)
 *   AC2: pm_audit -> _spawn_review_task() 生成 review task
 *   AC3: _resolve_default_reviewer() 三级路由 (task -> FSM -> fallback)
 *   AC4: review pass -> 原任务 completed -> DAG 解锁下游
 *   AC5: review fail -> 原任务 failed / retry_ready 重新派发
 *   AC6: 通知由被派 Agent 自己的 bot 发送，禁止 Daemon/PM bot 代发
 *   AC7: accept/reject state guards (非 review_spawned 状态拒绝)
 */

import request from 'supertest';
import { createServer, stateEmitter } from '../src/api/server';
import DAL from '../src/db/dal';
import { PrismaDAL } from '../src/db/prisma_dal';
import * as path from 'path';
import * as fs from 'fs';

const AUTH_TOKEN = 'test-t33-token';

const TEST_DB_DIR = path.join(__dirname, '..', 'prisma', 'data');

describe('T3.3: 动态审核派单引擎', () => {
  let app: any;
  let dal: DAL;
  let prismaDal: PrismaDAL;
  let testDbPath: string;
  let projectId: string;
  let agentId: string;

  beforeAll(async () => {
    // 1. Legacy DAL (backward-compat routes)
    dal = new DAL(':memory:');
    dal.initSchema(`
      CREATE TABLE IF NOT EXISTS nexus_projects (
        id TEXT PRIMARY KEY, name TEXT NOT NULL, status TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS nexus_workers (
        id TEXT PRIMARY KEY, lane TEXT NOT NULL, status TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS nexus_tasks (
        id TEXT PRIMARY KEY, project_id TEXT NOT NULL, title TEXT NOT NULL,
        objective TEXT NOT NULL, lane TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'created',
        max_retries INTEGER NOT NULL DEFAULT 3, retry_count INTEGER NOT NULL DEFAULT 0,
        payload_schema TEXT, ext_meta TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (project_id) REFERENCES nexus_projects(id)
      );
      CREATE TABLE IF NOT EXISTS nexus_runs (
        run_id TEXT PRIMARY KEY, task_id TEXT NOT NULL, worker_id TEXT NOT NULL,
        idempotency_key TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'running',
        error_stack TEXT, started_at DATETIME DEFAULT CURRENT_TIMESTAMP, ended_at DATETIME,
        FOREIGN KEY (task_id) REFERENCES nexus_tasks(id),
        FOREIGN KEY (worker_id) REFERENCES nexus_workers(id)
      );
    `);

    // 2. Copy existing test DB with V7.5 schema
    testDbPath = path.join(TEST_DB_DIR, 'test_dynamic_review_t33.db');
    const sourceDb = path.join(TEST_DB_DIR, 'test_dal_v2.db');
    if (fs.existsSync(sourceDb)) {
      fs.copyFileSync(sourceDb, testDbPath);
    } else {
      const prodDb = path.join(TEST_DB_DIR, 'nexus.db');
      if (fs.existsSync(prodDb)) {
        fs.copyFileSync(prodDb, testDbPath);
      } else {
        throw new Error('No source DB available for test setup');
      }
    }

    prismaDal = new PrismaDAL(`file:${testDbPath}`);
    await prismaDal.initPragmas();

    // 3. Seed project + agent
    projectId = 'proj-t33-test';
    agentId = 'agent-t33-dev';
    await prismaDal._createProjectAndAgent(projectId, agentId);

    // 4. Seed a reviewer agent for review tasks (use direct Prisma insert so id == agent_id)
    await (prismaDal as any).prisma.agent.upsert({
      where: { id: 'pm-orchestrator-1' },
      update: {},
      create: {
        id: 'pm-orchestrator-1',
        agent_id: 'pm-orchestrator-1',
        lane: 'PM',
        endpoint: 'http://localhost:9999',
        dialect: 'hermes',
        soul_prompt: '',
        tools_allowed: '[]',
        status: 'online',
      },
    });

    app = createServer(dal, AUTH_TOKEN, prismaDal);
  });

  afterAll(async () => {
    await prismaDal.close();
    dal.close();
    try { fs.unlinkSync(testDbPath); } catch {}
  });

  // ─── Helper: create a task via API ──────────────────────────────
  async function createTask(overrides: Record<string, any> = {}) {
    const defaults = {
      project_id: projectId,
      title: 'T33 Test Task',
      objective: 'Test task for T3.3 dynamic review engine',
      lane_required: 'DEV',
      max_retries: 3,
    };
    const body = { ...defaults, ...overrides };
    const res = await request(app)
      .post('/api/v1/tasks')
      .set('Authorization', `Bearer ${AUTH_TOKEN}`)
      .send(body);
    return res.body.task;
  }

  // ─── Helper: set task status directly via Prisma ────────────────
  async function setTaskStatus(taskId: string, status: string) {
    await prismaDal.updateTaskStatus(taskId, status);
  }

  // ─── Helper: create a run for a task ────────────────────────────
  async function createRun(taskId: string, runAgentId: string = agentId) {
    const run = await (prismaDal as any).prisma.run.create({
      data: {
        task_id: taskId,
        agent_id: runAgentId,
        idempotency_key: `test-${taskId}-${Date.now()}`,
        status: 'running',
      },
    });
    return run;
  }

  // ─── Helper: submit proof via API ──────────────────────────────
  async function submitProof(taskId: string, runId: string) {
    return await request(app)
      .post(`/api/v1/tasks/${taskId}/submit_proof_v2`)
      .set('Authorization', `Bearer ${AUTH_TOKEN}`)
      .send({
        run_id: runId,
        artifact_type: 'json_proof',
        payload: { git_sha: 'abc123', test_passed: true },
      });
  }

  const authHeader = { Authorization: `Bearer ${AUTH_TOKEN}` };

  // ═══════════════════════════════════════════════════════════════
  //  AC1: evaluate_task() 按 acceptance_mode 分流
  // ═══════════════════════════════════════════════════════════════
  describe('AC1: evaluate_task() routes by acceptance_mode', () => {
    it('AC1.1: pm_audit mode -> task transitions to review_spawned (not completed)', async () => {
      const task = await createTask({
        title: 'AC1.1 pm_audit task',
        acceptance_mode: 'pm_audit',
        reviewer: 'pm-orchestrator-1',
      });
      await setTaskStatus(task.id, 'dispatched');
      const run = await createRun(task.id);

      const res = await submitProof(task.id, run.run_id);

      expect(res.status).toBe(201);
      expect(res.body).toHaveProperty('review_spawned', true);
      expect(res.body).toHaveProperty('review_task_id');

      // Verify original task is now review_spawned
      const updated = await prismaDal.getTask(task.id);
      expect(updated?.status).toBe('review_spawned');
    });

    it('AC1.2: non-pm_audit mode (auto_verify) -> task transitions directly to completed', async () => {
      const task = await createTask({
        title: 'AC1.2 auto_verify task',
        acceptance_mode: 'auto_verify',
      });
      await setTaskStatus(task.id, 'dispatched');
      const run = await createRun(task.id);

      const res = await submitProof(task.id, run.run_id);

      expect(res.status).toBe(201);
      expect(res.body).toHaveProperty('review_spawned', false);

      // Verify task auto-completed
      const updated = await prismaDal.getTask(task.id);
      expect(updated?.status).toBe('completed');
    });
  });

  // ═══════════════════════════════════════════════════════════════
  //  AC2: _spawn_review_task() creates review task + run
  // ═══════════════════════════════════════════════════════════════
  describe('AC2: _spawn_review_task() creates review task', () => {
    it('AC2.1: review task title prefixed with [Review], assigned to reviewer', async () => {
      const task = await createTask({
        title: 'AC2.1 Source Task',
        acceptance_mode: 'pm_audit',
        reviewer: 'pm-orchestrator-1',
      });
      await setTaskStatus(task.id, 'dispatched');
      const run = await createRun(task.id);

      const res = await submitProof(task.id, run.run_id);
      expect(res.status).toBe(201);

      const reviewTaskId = res.body.review_task_id;
      const reviewTask = await prismaDal.getTask(reviewTaskId);
      expect(reviewTask).toBeDefined();
      expect(reviewTask?.title).toContain('[Review]');
      expect(reviewTask?.title).toContain('AC2.1 Source Task');
      expect(reviewTask?.status).toBe('dispatched');
      expect(reviewTask?.reviewer).toBe('pm-orchestrator-1');
    });
  });

  // ═══════════════════════════════════════════════════════════════
  //  AC3: _resolve_default_reviewer() 三级路由
  // ═══════════════════════════════════════════════════════════════
  describe('AC3: _resolve_default_reviewer() three-tier routing', () => {
    it('AC3.1: Level 1 — uses task.reviewer when explicitly set', async () => {
      const task = await createTask({
        title: 'AC3.1 Explicit Reviewer',
        acceptance_mode: 'pm_audit',
        reviewer: 'pm-orchestrator-1',
      });
      await setTaskStatus(task.id, 'dispatched');
      const run = await createRun(task.id);

      const res = await submitProof(task.id, run.run_id);
      expect(res.status).toBe(201);

      const reviewTask = await prismaDal.getTask(res.body.review_task_id);
      expect(reviewTask?.reviewer).toBe('pm-orchestrator-1');
    });

    it('AC3.2: Level 2 — falls back to FSM controller default_reviewer', async () => {
      // Seed FSM controller with default_reviewer
      await (prismaDal as any).prisma.fSMController.upsert({
        where: { controller_id: 'fsm-task-v1' },
        update: {
          name: 'Task FSM',
          entity_type: 'task',
          states_json: JSON.stringify(['created', 'dispatched', 'completed']),
          transitions_json: JSON.stringify([]),
          initial_state: 'created',
        },
        create: {
          controller_id: 'fsm-task-v1',
          name: 'Task FSM',
          entity_type: 'task',
          states_json: JSON.stringify(['created', 'dispatched', 'completed']),
          transitions_json: JSON.stringify([]),
          initial_state: 'created',
        },
      });

      // Update controller to add default_reviewer via the config update route
      await request(app)
        .put('/api/v1/controllers/fsm-task-v1/config')
        .set(authHeader)
        .send({ default_reviewer: 'agent-t33-dev' })
        .expect(200);

      // Ensure agent-t33-dev exists as reviewer target (id == agent_id for FK compat)
      await (prismaDal as any).prisma.agent.upsert({
        where: { id: 'agent-t33-dev' },
        update: {},
        create: {
          id: 'agent-t33-dev',
          agent_id: 'agent-t33-dev',
          lane: 'DEV',
          endpoint: 'http://localhost:9000',
          dialect: 'hermes',
          soul_prompt: '',
          tools_allowed: '[]',
          status: 'online',
        },
      });

      const task = await createTask({
        title: 'AC3.2 FSM Fallback',
        acceptance_mode: 'pm_audit',
        // No reviewer set — should fall back to FSM controller
      });
      // Clear reviewer field
      await (prismaDal as any).prisma.task.update({
        where: { id: task.id },
        data: { reviewer: null },
      });

      await setTaskStatus(task.id, 'dispatched');
      const run = await createRun(task.id);

      const res = await submitProof(task.id, run.run_id);
      expect(res.status).toBe(201);

      const reviewTask = await prismaDal.getTask(res.body.review_task_id);
      expect(reviewTask?.reviewer).toBe('agent-t33-dev');
    });

    it('AC3.3: Level 3 — falls back to hardcoded pm-orchestrator-1', async () => {
      // Remove FSM controller so Level 2 fails
      await (prismaDal as any).prisma.fSMController.deleteMany({
        where: { controller_id: 'fsm-task-v1' },
      });

      const task = await createTask({
        title: 'AC3.3 System Fallback',
        acceptance_mode: 'pm_audit',
        // No reviewer, no FSM controller
      });
      await (prismaDal as any).prisma.task.update({
        where: { id: task.id },
        data: { reviewer: null },
      });

      await setTaskStatus(task.id, 'dispatched');
      const run = await createRun(task.id);

      const res = await submitProof(task.id, run.run_id);
      expect(res.status).toBe(201);

      const reviewTask = await prismaDal.getTask(res.body.review_task_id);
      expect(reviewTask?.reviewer).toBe('pm-orchestrator-1');
    });
  });

  // ═══════════════════════════════════════════════════════════════
  //  AC4: review pass -> completed -> SSE event
  // ═══════════════════════════════════════════════════════════════
  describe('AC4: review pass -> task completed', () => {
    it('AC4.1: accept on review_spawned task -> completed + proof_data + SSE', async () => {
      // Setup: create task in review_spawned state
      const task = await createTask({
        title: 'AC4.1 Accept Test',
        acceptance_mode: 'pm_audit',
        reviewer: 'pm-orchestrator-1',
      });
      await setTaskStatus(task.id, 'dispatched');
      const run = await createRun(task.id);
      await submitProof(task.id, run.run_id);

      // Verify it's in review_spawned
      let current = await prismaDal.getTask(task.id);
      expect(current?.status).toBe('review_spawned');

      // Listen for SSE event
      const eventPromise = new Promise<any>((resolve) => {
        const handler = (event: any) => {
          if (event.type === 'task_accepted' && event.data?.task_id === task.id) {
            stateEmitter.off('state_change', handler);
            resolve(event);
          }
        };
        stateEmitter.on('state_change', handler);
      });

      // Accept the task
      const res = await request(app)
        .post(`/api/v1/tasks/${task.id}/accept`)
        .set(authHeader)
        .send({
          reviewer_id: 'pm-orchestrator-1',
          note: 'Looks good',
        });

      expect(res.status).toBe(200);
      expect(res.body.task.status).toBe('completed');

      // Verify proof_data contains acceptance info
      const proofData = JSON.parse(res.body.task.proof_data);
      expect(proofData.accepted).toBe(true);
      expect(proofData.reviewer_id).toBe('pm-orchestrator-1');

      // Verify SSE event was emitted
      const event = await Promise.race([
        eventPromise,
        new Promise<null>((r) => setTimeout(() => r(null), 3000)),
      ]);
      expect(event).not.toBeNull();
      expect(event.type).toBe('task_accepted');
    });
  });

  // ═══════════════════════════════════════════════════════════════
  //  AC5: review fail -> failed / retry_ready -> 重新派发
  // ═══════════════════════════════════════════════════════════════
  describe('AC5: review fail -> task failed / retry', () => {
    it('AC5.1: reject on review_spawned task -> failed when max retries reached', async () => {
      const task = await createTask({
        title: 'AC5.1 Reject Max Retries',
        acceptance_mode: 'pm_audit',
        reviewer: 'pm-orchestrator-1',
        max_retries: 0, // no retries allowed
      });
      await setTaskStatus(task.id, 'dispatched');
      const run = await createRun(task.id);
      await submitProof(task.id, run.run_id);

      let current = await prismaDal.getTask(task.id);
      expect(current?.status).toBe('review_spawned');

      const res = await request(app)
        .post(`/api/v1/tasks/${task.id}/reject`)
        .set(authHeader)
        .send({
          reviewer_id: 'pm-orchestrator-1',
          reason: 'Code quality issues',
        });

      expect(res.status).toBe(200);
      expect(res.body.task.status).toBe('failed');

      const proofData = JSON.parse(res.body.task.proof_data);
      expect(proofData.accepted).toBe(false);
      expect(proofData.reason).toBe('Code quality issues');
    });

    it('AC5.2: reject with retries remaining -> task back to created (retry_ready)', async () => {
      const task = await createTask({
        title: 'AC5.2 Retry Ready',
        acceptance_mode: 'pm_audit',
        reviewer: 'pm-orchestrator-1',
        max_retries: 3,
      });
      await setTaskStatus(task.id, 'dispatched');
      const run = await createRun(task.id);
      await submitProof(task.id, run.run_id);

      const res = await request(app)
        .post(`/api/v1/tasks/${task.id}/reject`)
        .set(authHeader)
        .send({
          reviewer_id: 'pm-orchestrator-1',
          reason: 'Needs improvement',
        });

      expect(res.status).toBe(200);
      // When retries remain, task goes back to 'created' for re-dispatch
      expect(res.body.task.status).toBe('created');
      // Verify retry_count was incremented
      expect(res.body.task.retry_count).toBe(1);
    });
  });

  // ═══════════════════════════════════════════════════════════════
  //  AC6+AC7: state guards + notification boundary
  // ═══════════════════════════════════════════════════════════════
  describe('AC6+AC7: accept/reject state guards', () => {
    it('AC7.1: accept on non-review_spawned task -> 400 BAD_REQUEST', async () => {
      const task = await createTask({ title: 'AC7.1 Guard Test' });
      // Task is in 'created' status, not review_spawned

      const res = await request(app)
        .post(`/api/v1/tasks/${task.id}/accept`)
        .set(authHeader)
        .send({ reviewer_id: 'pm-orchestrator-1' });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe('BAD_REQUEST');
    });

    it('AC7.2: reject on non-review_spawned task -> 400 BAD_REQUEST', async () => {
      const task = await createTask({ title: 'AC7.2 Guard Test' });

      const res = await request(app)
        .post(`/api/v1/tasks/${task.id}/reject`)
        .set(authHeader)
        .send({ reviewer_id: 'pm-orchestrator-1', reason: 'bad' });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe('BAD_REQUEST');
    });
  });
});
