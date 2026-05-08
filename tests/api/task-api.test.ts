/**
 * T2.1 TDD Tests: 任务管理 API（5个接口）
 *
 * Acceptance Criteria Coverage:
 * AC1: POST /api/v1/tasks 创建任务
 * AC2: GET /api/v1/tasks/pending 获取可派发任务（含 DAG 依赖检查）
 * AC3: GET /api/v1/tasks/:id 单任务详情
 * AC4: PATCH /api/v1/tasks/:id/status 状态更新
 * AC5: POST /api/v1/tasks/batch 批量注入（冷冻库解冻用）
 * AC6: 每个接口 TDD 测试通过
 *
 * 全部接口在 /api/v1 前缀下，受 bearerAuth 中间件保护。
 * 数据层使用 PrismaDAL (Prisma ORM + SQLite)。
 */

import request from 'supertest';
import { createServer } from '../../src/api/server';
import { PrismaDAL } from '../../src/db/prisma_dal';
import DAL from '../../src/db/dal';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

// ─── Test Setup ─────────────────────────────────────────────────────

const AUTH_TOKEN = 'test-task-api-token';
let app: ReturnType<typeof createServer>;
let prismaDal: PrismaDAL;
let legacyDal: DAL;
let tmpDbPath: string;
let testProjectId: string;
let testGroupId: string;

beforeAll(async () => {
  // Create a temp directory for test isolation
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-task-test-'));

  // Use Prisma test DB
  tmpDbPath = path.join(tmpDir, 'test_task_api.db');
  process.env.DATABASE_URL = `file:${tmpDbPath}`;

  // Initialize PrismaDAL with test DB
  prismaDal = new PrismaDAL(`file:${tmpDbPath}`);
  await prismaDal.initPragmas();

  // Push schema to test DB
  const { execSync } = require('child_process');
  execSync(
    `npx prisma db push --skip-generate --accept-data-loss 2>&1`,
    {
      cwd: '/opt/projects/nexus-dispatch',
      env: { ...process.env, DATABASE_URL: `file:${tmpDbPath}` },
      stdio: 'pipe',
    }
  );

  // Legacy DAL for server compat (needed by createServer)
  const legacyDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-legacy-task-'));
  const legacyPath = path.join(legacyDir, 'legacy.db');
  legacyDal = new DAL(legacyPath);
  legacyDal.initSchema(`
    CREATE TABLE IF NOT EXISTS nexus_projects (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, description TEXT, status TEXT DEFAULT 'active'
    );
    CREATE TABLE IF NOT EXISTS nexus_tasks (
      id TEXT PRIMARY KEY, project_id TEXT NOT NULL, title TEXT NOT NULL, objective TEXT,
      lane TEXT, status TEXT DEFAULT 'created', max_retries INTEGER DEFAULT 3,
      retry_count INTEGER DEFAULT 0, payload_schema TEXT, ext_meta TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS nexus_runs (
      run_id TEXT PRIMARY KEY, task_id TEXT NOT NULL, worker_id TEXT NOT NULL,
      idempotency_key TEXT UNIQUE, status TEXT DEFAULT 'running',
      error_stack TEXT, started_at DATETIME DEFAULT CURRENT_TIMESTAMP, ended_at DATETIME
    );
    CREATE TABLE IF NOT EXISTS nexus_workers (
      id TEXT PRIMARY KEY, lane TEXT NOT NULL, status TEXT DEFAULT 'online',
      last_heartbeat DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS nexus_artifacts (
      id TEXT PRIMARY KEY, run_id TEXT NOT NULL, artifact_type TEXT NOT NULL,
      payload_data TEXT NOT NULL, created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  app = createServer(legacyDal, AUTH_TOKEN, prismaDal);

  // Seed: create a project and task group for testing
  const project = await prismaDal.createProject({ name: 'TaskAPITestProject' });
  testProjectId = project.id;

  const group = await prismaDal.createTaskGroup({
    group_id: 'test-p1',
    name: 'Test Phase 1',
    description: 'Test task group',
  });
  testGroupId = group.id;
}, 30000);

afterAll(async () => {
  await prismaDal.close();
  try { legacyDal.close(); } catch {}
});

// Helper: auth header
const authHeader = { Authorization: `Bearer ${AUTH_TOKEN}` };

// ═══════════════════════════════════════════════════════════════
//  AC1: POST /api/v1/tasks — 创建任务
// ═══════════════════════════════════════════════════════════════

describe('AC1: POST /api/v1/tasks — 创建任务', () => {
  test('should create a task with required fields', async () => {
    const res = await request(app)
      .post('/api/v1/tasks')
      .set(authHeader)
      .send({
        project_id: testProjectId,
        title: 'T2.1: Implement task API',
        objective: 'Build 5 REST endpoints for task management',
        lane_required: 'DEV',
      });

    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('task');
    expect(res.body.task).toHaveProperty('id');
    expect(res.body.task.title).toBe('T2.1: Implement task API');
    expect(res.body.task.status).toBe('created');
    expect(res.body.task.project_id).toBe(testProjectId);
    expect(res.body.task.lane_required).toBe('DEV');
  });

  test('should create task with all optional fields', async () => {
    const res = await request(app)
      .post('/api/v1/tasks')
      .set(authHeader)
      .send({
        project_id: testProjectId,
        title: 'Full task test',
        objective: 'Test all optional fields',
        lane_required: 'DESIGN',
        task_group_id: 'test-p1',
        payload: { context: 'dispatch data' },
        payload_schema: { type: 'object' },
        acceptance_criteria: ['AC1: code compiles', 'AC2: tests pass'],
        reviewer: 'pm-orchestrator-1',
        acceptance_mode: 'pm_audit',
        max_retries: 5,
      });

    expect(res.status).toBe(201);
    expect(res.body.task).toHaveProperty('id');
    expect(res.body.task.title).toBe('Full task test');
    expect(res.body.task.task_group_id).toBe(testGroupId);
    expect(res.body.task.reviewer).toBe('pm-orchestrator-1');
    expect(res.body.task.acceptance_mode).toBe('pm_audit');
    expect(res.body.task.max_retries).toBe(5);
  });

  test('should reject missing project_id (422)', async () => {
    const res = await request(app)
      .post('/api/v1/tasks')
      .set(authHeader)
      .send({
        title: 'No project',
        objective: 'Missing project_id',
        lane_required: 'DEV',
      });

    expect(res.status).toBe(422);
    expect(res.body.code).toBe('VALIDATION_ERROR');
  });

  test('should reject non-existent project (404)', async () => {
    const res = await request(app)
      .post('/api/v1/tasks')
      .set(authHeader)
      .send({
        project_id: 'nonexistent-project-id',
        title: 'Ghost task',
        objective: 'Should fail',
        lane_required: 'DEV',
      });

    expect(res.status).toBe(404);
    expect(res.body.code).toBe('NOT_FOUND');
  });

  test('should reject non-existent task_group_id (404)', async () => {
    const res = await request(app)
      .post('/api/v1/tasks')
      .set(authHeader)
      .send({
        project_id: testProjectId,
        title: 'Bad group',
        objective: 'Non-existent group',
        lane_required: 'DEV',
        task_group_id: 'nonexistent-group-id',
      });

    expect(res.status).toBe(404);
    expect(res.body.code).toBe('NOT_FOUND');
  });

  test('should require auth (401)', async () => {
    const res = await request(app)
      .post('/api/v1/tasks')
      .send({
        project_id: testProjectId,
        title: 'Unauthorized',
        objective: 'No auth',
        lane_required: 'DEV',
      });

    expect(res.status).toBe(401);
  });
});

// ═══════════════════════════════════════════════════════════════
//  AC2: GET /api/v1/tasks/pending — 获取可派发任务（含 DAG 依赖检查）
// ═══════════════════════════════════════════════════════════════

describe('AC2: GET /api/v1/tasks/pending — DAG 依赖检查', () => {
  let dagProjectId: string;
  let taskIdA: string;
  let taskIdB: string;
  let taskIdC: string; // depends on A

  beforeAll(async () => {
    // Create a separate project for DAG tests to avoid interference from AC1
    const dagProject = await prismaDal.createProject({ name: 'DAGTestProject' });
    dagProjectId = dagProject.id;

    // Create tasks: A (no deps), B (no deps), C (depends on A)
    const taskA = await prismaDal.createTask({
      project_id: dagProjectId,
      title: 'Task A - no deps',
      objective: 'Independent task',
      lane_required: 'DEV',
      status: 'created',
    });
    taskIdA = taskA.id;

    const taskB = await prismaDal.createTask({
      project_id: dagProjectId,
      title: 'Task B - no deps',
      objective: 'Another independent task',
      lane_required: 'OPS',
      status: 'created',
    });
    taskIdB = taskB.id;

    const taskC = await prismaDal.createTask({
      project_id: dagProjectId,
      title: 'Task C - depends on A',
      objective: 'Should not appear until A completed',
      lane_required: 'DEV',
      status: 'created',
    });
    taskIdC = taskC.id;

    // Create dependency: C depends on A
    await prismaDal.client.taskDependency.create({
      data: {
        project_id: dagProjectId,
        task_id: taskC.id,
        depends_on_id: taskA.id,
        dependency_type: 'blocks',
      },
    });
  });

  test('should return tasks with no deps as dispatchable', async () => {
    const res = await request(app)
      .get(`/api/v1/tasks/pending?project_id=${dagProjectId}`)
      .set(authHeader);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('tasks');
    expect(res.body).toHaveProperty('total');

    // A and B should be dispatchable (no deps) = 2 tasks
    // C should NOT be dispatchable (depends on A, not yet completed)
    expect(res.body.total).toBe(2);
    const taskIds = res.body.tasks.map((t: any) => t.id);
    expect(taskIds).toContain(taskIdA);
    expect(taskIds).toContain(taskIdB);
    expect(taskIds).not.toContain(taskIdC);
  });

  test('should filter by project_id', async () => {
    const res = await request(app)
      .get(`/api/v1/tasks/pending?project_id=${dagProjectId}`)
      .set(authHeader);

    expect(res.status).toBe(200);
    expect(res.body.tasks.length).toBeGreaterThanOrEqual(2);
    res.body.tasks.forEach((t: any) => {
      expect(t.project_id).toBe(dagProjectId);
    });
  });

  test('should filter by lane', async () => {
    const res = await request(app)
      .get(`/api/v1/tasks/pending?project_id=${dagProjectId}&lane=OPS`)
      .set(authHeader);

    expect(res.status).toBe(200);
    expect(res.body.tasks.length).toBeGreaterThanOrEqual(1);
    res.body.tasks.forEach((t: any) => {
      expect(t.lane_required).toBe('OPS');
    });
  });

  test('should return C after A is completed (DAG unblock)', async () => {
    // Complete task A
    await prismaDal.client.task.update({
      where: { id: taskIdA },
      data: { status: 'completed' },
    });

    const res = await request(app)
      .get(`/api/v1/tasks/pending?project_id=${dagProjectId}`)
      .set(authHeader);

    expect(res.status).toBe(200);
    const taskIds = res.body.tasks.map((t: any) => t.id);
    // Now C should be dispatchable since A is completed
    expect(taskIds).toContain(taskIdC);
  });

  test('should reject task creation when dependencies point to another project', async () => {
    const projectA = await prismaDal.createProject({ name: 'CrossDepApiProjectA' });
    const projectB = await prismaDal.createProject({ name: 'CrossDepApiProjectB' });
    const foreignTask = await prismaDal.createTask({
      project_id: projectB.id,
      title: 'Foreign dependency target',
      objective: 'Must remain invisible to project A',
      lane_required: 'DEV',
      status: 'completed',
    });

    const res = await request(app)
      .post('/api/v1/tasks')
      .set(authHeader)
      .send({
        project_id: projectA.id,
        title: 'Project A task with illegal dependency',
        objective: 'Should be rejected before dependency write',
        lane_required: 'DEV',
        dependencies: [foreignTask.id],
      });

    expect(res.status).toBe(400);
    expect(JSON.stringify(res.body)).toMatch(/same project/);
    await expect(
      prismaDal.client.taskDependency.findMany({ where: { project_id: projectA.id } }),
    ).resolves.toHaveLength(0);
  });


  test('should return empty tasks array when no created tasks', async () => {
    // Create a fresh project with no tasks
    const emptyProject = await prismaDal.createProject({ name: 'EmptyProject4Pending' });

    const res = await request(app)
      .get(`/api/v1/tasks/pending?project_id=${emptyProject.id}`)
      .set(authHeader);

    expect(res.status).toBe(200);
    expect(res.body.tasks).toEqual([]);
    expect(res.body.total).toBe(0);
  });

  test('should require auth (401)', async () => {
    const res = await request(app)
      .get('/api/v1/tasks/pending');

    expect(res.status).toBe(401);
  });
});

// ═══════════════════════════════════════════════════════════════
//  AC3: GET /api/v1/tasks/:id — 单任务详情
// ═══════════════════════════════════════════════════════════════

describe('AC3: GET /api/v1/tasks/:id — 单任务详情', () => {
  let createdTaskId: string;

  beforeAll(async () => {
    const task = await prismaDal.createTask({
      project_id: testProjectId,
      title: 'Detail test task',
      objective: 'Testing task detail endpoint',
      lane_required: 'DEV',
      status: 'created',
      reviewer: 'pm-1',
      acceptance_mode: 'pm_audit',
    });
    createdTaskId = task.id;
  });

  test('should return task details by ID', async () => {
    const res = await request(app)
      .get(`/api/v1/tasks/${createdTaskId}`)
      .set(authHeader);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('task');
    expect(res.body.task.id).toBe(createdTaskId);
    expect(res.body.task.title).toBe('Detail test task');
    expect(res.body.task.objective).toBe('Testing task detail endpoint');
    expect(res.body.task.lane_required).toBe('DEV');
    expect(res.body.task.reviewer).toBe('pm-1');
    expect(res.body.task.acceptance_mode).toBe('pm_audit');
  });

  test('should filter by project_id', async () => {
    const res = await request(app)
      .get(`/api/v1/tasks/${createdTaskId}?project_id=${testProjectId}`)
      .set(authHeader);

    expect(res.status).toBe(200);
    expect(res.body.task.id).toBe(createdTaskId);
  });

  test('should return 404 when project_id mismatch', async () => {
    const res = await request(app)
      .get(`/api/v1/tasks/${createdTaskId}?project_id=wrong-project-id`)
      .set(authHeader);

    expect(res.status).toBe(404);
    expect(res.body.code).toBe('NOT_FOUND');
  });

  test('should return 404 for non-existent task', async () => {
    const res = await request(app)
      .get('/api/v1/tasks/nonexistent-task-id')
      .set(authHeader);

    expect(res.status).toBe(404);
    expect(res.body.code).toBe('NOT_FOUND');
  });

  test('should require auth (401)', async () => {
    const res = await request(app)
      .get(`/api/v1/tasks/${createdTaskId}`);

    expect(res.status).toBe(401);
  });
});

// ═══════════════════════════════════════════════════════════════
//  AC4: PATCH /api/v1/tasks/:id/status — 状态更新
// ═══════════════════════════════════════════════════════════════

describe('AC4: PATCH /api/v1/tasks/:id/status — 状态更新', () => {
  let statusTaskId: string;

  beforeAll(async () => {
    const task = await prismaDal.createTask({
      project_id: testProjectId,
      title: 'Status update task',
      objective: 'Testing status transitions',
      lane_required: 'DEV',
      status: 'created',
    });
    statusTaskId = task.id;
  });

  test('should update task from created → dispatched', async () => {
    const res = await request(app)
      .patch(`/api/v1/tasks/${statusTaskId}/status`)
      .set(authHeader)
      .send({ status: 'dispatched' });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('task');
    expect(res.body.task.status).toBe('dispatched');
  });

  test('should update task from dispatched → accepted', async () => {
    const res = await request(app)
      .patch(`/api/v1/tasks/${statusTaskId}/status`)
      .set(authHeader)
      .send({ status: 'accepted' });

    expect(res.status).toBe(200);
    expect(res.body.task.status).toBe('accepted');
  });

  test('should update with proof_data and ext_meta', async () => {
    const res = await request(app)
      .patch(`/api/v1/tasks/${statusTaskId}/status`)
      .set(authHeader)
      .send({
        status: 'completed',
        proof_data: JSON.stringify({ git_sha: 'abc123' }),
        ext_meta: JSON.stringify({ duration_sec: 120 }),
      });

    expect(res.status).toBe(200);
    expect(res.body.task.status).toBe('completed');
    expect(res.body.task.proof_data).toBeTruthy();
    expect(res.body.task.ext_meta).toBeTruthy();
  });

  test('should update to failed status', async () => {
    const failTask = await prismaDal.createTask({
      project_id: testProjectId,
      title: 'Failing task',
      objective: 'Should fail',
      lane_required: 'DEV',
      status: 'dispatched',
    });

    const res = await request(app)
      .patch(`/api/v1/tasks/${failTask.id}/status`)
      .set(authHeader)
      .send({ status: 'failed' });

    expect(res.status).toBe(200);
    expect(res.body.task.status).toBe('failed');
  });

  test('should reject invalid status enum (422)', async () => {
    const res = await request(app)
      .patch(`/api/v1/tasks/${statusTaskId}/status`)
      .set(authHeader)
      .send({ status: 'invalid_status' });

    expect(res.status).toBe(422);
    expect(res.body.code).toBe('VALIDATION_ERROR');
  });

  test('should return 404 for non-existent task', async () => {
    const res = await request(app)
      .patch('/api/v1/tasks/nonexistent-id/status')
      .set(authHeader)
      .send({ status: 'dispatched' });

    expect(res.status).toBe(404);
    expect(res.body.code).toBe('NOT_FOUND');
  });

  test('should require auth (401)', async () => {
    const res = await request(app)
      .patch(`/api/v1/tasks/${statusTaskId}/status`)
      .send({ status: 'dispatched' });

    expect(res.status).toBe(401);
  });
});

// ═══════════════════════════════════════════════════════════════
//  AC5: POST /api/v1/tasks/batch — 批量注入
// ═══════════════════════════════════════════════════════════════

describe('AC5: POST /api/v1/tasks/batch — 批量注入', () => {
  test('should batch inject tasks into a task group', async () => {
    const res = await request(app)
      .post('/api/v1/tasks/batch')
      .set(authHeader)
      .send({
        project_id: testProjectId,
        group_id: 'test-p1',
        tasks: [
          {
            title: 'Batch task 1',
            objective: 'First batch task',
            lane_required: 'DEV',
          },
          {
            title: 'Batch task 2',
            objective: 'Second batch task',
            lane_required: 'DESIGN',
            reviewer: 'pm-1',
            acceptance_mode: 'pm_audit',
          },
          {
            title: 'Batch task 3',
            objective: 'Third with criteria',
            lane_required: 'OPS',
            acceptance_criteria: ['Test AC1', 'Test AC2'],
          },
        ],
      });

    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('injected', 3);
    expect(res.body).toHaveProperty('task_ids');
    expect(res.body.task_ids).toHaveLength(3);
    expect(res.body.project_id).toBe(testProjectId);
    expect(res.body.group_id).toBe('test-p1');

    // Verify each task exists in DB
    for (const id of res.body.task_ids) {
      const task = await prismaDal.getTask(id);
      expect(task).toBeTruthy();
      expect(task!.status).toBe('created');
    }
  });

  test('should reject non-existent project (404)', async () => {
    const res = await request(app)
      .post('/api/v1/tasks/batch')
      .set(authHeader)
      .send({
        project_id: 'nonexistent-project',
        group_id: 'test-p1',
        tasks: [
          { title: 'Task', objective: 'Obj', lane_required: 'DEV' },
        ],
      });

    expect(res.status).toBe(404);
    expect(res.body.code).toBe('NOT_FOUND');
  });

  test('should reject non-existent group (404)', async () => {
    const res = await request(app)
      .post('/api/v1/tasks/batch')
      .set(authHeader)
      .send({
        project_id: testProjectId,
        group_id: 'nonexistent-group',
        tasks: [
          { title: 'Task', objective: 'Obj', lane_required: 'DEV' },
        ],
      });

    expect(res.status).toBe(404);
    expect(res.body.code).toBe('NOT_FOUND');
  });

  test('should reject empty tasks array (422)', async () => {
    const res = await request(app)
      .post('/api/v1/tasks/batch')
      .set(authHeader)
      .send({
        project_id: testProjectId,
        group_id: 'test-p1',
        tasks: [],
      });

    expect(res.status).toBe(422);
    expect(res.body.code).toBe('VALIDATION_ERROR');
  });

  test('should reject missing required fields in task (422)', async () => {
    const res = await request(app)
      .post('/api/v1/tasks/batch')
      .set(authHeader)
      .send({
        project_id: testProjectId,
        group_id: 'test-p1',
        tasks: [
          { title: 'Missing objective and lane' },
        ],
      });

    expect(res.status).toBe(422);
    expect(res.body.code).toBe('VALIDATION_ERROR');
  });

  test('should require auth (401)', async () => {
    const res = await request(app)
      .post('/api/v1/tasks/batch')
      .send({
        project_id: testProjectId,
        group_id: 'test-p1',
        tasks: [{ title: 'T', objective: 'O', lane_required: 'DEV' }],
      });

    expect(res.status).toBe(401);
  });
});
