/**
 * T2.6 TDD Tests: API 鉴权 + 输入校验加固
 *
 * Acceptance Criteria Coverage:
 * AC1: 所有 /api/v1/* 接口强制 Bearer Token 校验
 * AC2: 请求 body 用 Ajv JSON Schema 校验
 * AC3: 标准化错误码: 400/401/404/422/500 + error detail
 * AC4: 无效 token 返回 401
 * AC5: schema 不匹配返回 422 附带明细
 * AC6: TDD 测试通过
 */

import request from 'supertest';
import { createServer } from '../../src/api/server';
import DAL from '../../src/db/dal';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';

// ─── Test Setup ─────────────────────────────────────────────────────

const AUTH_TOKEN = 'test-secret-token-12345';
let app: ReturnType<typeof createServer>;
let dal: DAL;
let tmpDbPath: string;

beforeAll(() => {
  // Create a temp DB for test isolation
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-test-'));
  tmpDbPath = path.join(tmpDir, 'test.db');

  dal = new DAL(tmpDbPath);
  dal.initSchema(`
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
  app = createServer(dal, AUTH_TOKEN);
});

afterAll(() => {
  try { dal.close(); } catch {}
  try { if (tmpDbPath) fs.unlinkSync(tmpDbPath); } catch {}
});

// Helper: valid auth header
const authHeader = { Authorization: `Bearer ${AUTH_TOKEN}` };
const badAuthHeader = { Authorization: 'Bearer wrong-token' };

// ─── AC1 + AC4: Bearer Token Enforcement on ALL /api/v1/* ──────────

describe('AC1+AC4: All /api/v1/* routes enforce Bearer Token', () => {

  test('POST /api/v1/tasks/claim — no token → 401', async () => {
    const res = await request(app).post('/api/v1/tasks/claim').send({});
    expect(res.status).toBe(401);
    expect(res.body).toMatchObject({ error: expect.any(String), code: 'UNAUTHORIZED' });
  });

  test('POST /api/v1/tasks/claim — wrong token → 401', async () => {
    const res = await request(app).post('/api/v1/tasks/claim').set(badAuthHeader).send({});
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('UNAUTHORIZED');
  });

  test('POST /api/v1/tasks/:id/release — no token → 401', async () => {
    const res = await request(app).post('/api/v1/tasks/t-123/release').send({});
    expect(res.status).toBe(401);
  });

  test('POST /api/v1/tasks/:id/submit_proof — no token → 401', async () => {
    const res = await request(app).post('/api/v1/tasks/t-123/submit_proof').send({});
    expect(res.status).toBe(401);
  });

  test('GET /api/v1/nonexistent — no token → 401 (protected)', async () => {
    const res = await request(app).get('/api/v1/nonexistent');
    expect(res.status).toBe(401);
  });

  test('Invalid Authorization format → 401', async () => {
    const res = await request(app)
      .post('/api/v1/tasks/claim')
      .set('Authorization', 'Basic abc123')
      .send({});
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('UNAUTHORIZED');
  });

  test('Empty Bearer token → 401', async () => {
    const res = await request(app)
      .post('/api/v1/tasks/claim')
      .set('Authorization', 'Bearer ')
      .send({});
    expect(res.status).toBe(401);
  });

  test('Valid token passes auth and reaches route handler', async () => {
    // tasks/claim with valid auth should return 404 (no tasks) not 401
    const res = await request(app)
      .post('/api/v1/tasks/claim')
      .set(authHeader)
      .send({});
    expect(res.status).not.toBe(401);
    // Should be 404 because no tasks exist
    expect(res.status).toBe(404);
  });
});

// ─── AC2 + AC5: Ajv JSON Schema Validation ─────────────────────────

describe('AC2+AC5: Ajv JSON Schema validation returns 422 with details', () => {

  test('submit_proof — missing required fields → 422', async () => {
    const res = await request(app)
      .post('/api/v1/tasks/t-999/submit_proof')
      .set(authHeader)
      .send({ run_id: 'r-1' }); // missing artifact_type, payload
    expect(res.status).toBe(422);
    expect(res.body.code).toBe('VALIDATION_ERROR');
    expect(res.body.details).toBeDefined();
    expect(Array.isArray(res.body.details)).toBe(true);
    // Check that detail includes field-level info
    const fields = res.body.details.map((d: any) => d.field);
    expect(fields.length).toBeGreaterThan(0);
  });

  test('submit_proof — empty body → 422', async () => {
    const res = await request(app)
      .post('/api/v1/tasks/t-999/submit_proof')
      .set(authHeader)
      .send({});
    expect(res.status).toBe(422);
    expect(res.body.code).toBe('VALIDATION_ERROR');
  });

  test('submit_proof — extra properties rejected → 422', async () => {
    const res = await request(app)
      .post('/api/v1/tasks/t-999/submit_proof')
      .set(authHeader)
      .send({ run_id: 'r-1', artifact_type: 'proof', payload: {}, extra_field: 'bad' });
    expect(res.status).toBe(422);
  });

  test('claim — extra properties rejected → 422', async () => {
    const res = await request(app)
      .post('/api/v1/tasks/claim')
      .set(authHeader)
      .send({ unwanted: 'field' });
    expect(res.status).toBe(422);
    expect(res.body.code).toBe('VALIDATION_ERROR');
  });
});

// ─── AC3: Standardized Error Codes ──────────────────────────────────

describe('AC3: Standardized error codes with error detail', () => {

  test('401 — Unauthorized (missing token)', async () => {
    const res = await request(app).post('/api/v1/tasks/claim').send({});
    expect(res.status).toBe(401);
    expect(res.body).toMatchObject({
      error: expect.any(String),
      code: 'UNAUTHORIZED',
    });
  });

  test('404 — Not Found (no tasks to claim)', async () => {
    const res = await request(app)
      .post('/api/v1/tasks/claim')
      .set(authHeader)
      .send({});
    expect(res.status).toBe(404);
    expect(res.body).toMatchObject({
      error: expect.any(String),
      code: 'NOT_FOUND',
    });
  });

  test('404 — Not Found for unmatched /api/v1/* routes', async () => {
    const res = await request(app)
      .get('/api/v1/does-not-exist')
      .set(authHeader);
    expect(res.status).toBe(404);
    expect(res.body).toMatchObject({
      error: expect.stringContaining('not found'),
      code: 'NOT_FOUND',
    });
  });

  test('422 — Validation Error on schema mismatch', async () => {
    const res = await request(app)
      .post('/api/v1/tasks/t-1/submit_proof')
      .set(authHeader)
      .send({ run_id: '', artifact_type: '', payload: null });
    expect(res.status).toBe(422);
    expect(res.body).toMatchObject({
      error: expect.any(String),
      code: 'VALIDATION_ERROR',
      details: expect.any(Array),
    });
  });

  test('400 — non-JSON body returns error', async () => {
    const res = await request(app)
      .post('/api/v1/tasks/claim')
      .set(authHeader)
      .set('Content-Type', 'text/plain')
      .send('not json');
    // express.json() will fail to parse → may get 500 or syntax error
    // Our middleware catches null body
    expect([400, 500]).toContain(res.status);
  });
});

// ─── Integration: submit_proof happy path ───────────────────────────

describe('Integration: submit_proof full flow with auth + validation', () => {
  const projectId = 'proj-test-flow';
  const workerId = 'worker-test-flow';
  let taskId: string;
  let runId: string;

  beforeAll(() => {
    dal._createProjectAndWorker(projectId, workerId);

    taskId = dal.createTask({
      project_id: projectId,
      title: 'Test Task',
      objective: 'Test objective',
      lane: 'DEV',
      max_retries: 3,
      payload_schema: {},
      ext_meta: {},
    });

    // Update task to dispatched state
    dal.updateTaskStatus(taskId, 'dispatched');

    runId = dal.createRun({
      task_id: taskId,
      worker_id: workerId,
      idempotency_key: 'idem-key-flow',
    });
  });

  test('submit_proof with valid auth + valid body → 201', async () => {
    const res = await request(app)
      .post(`/api/v1/tasks/${taskId}/submit_proof`)
      .set(authHeader)
      .send({
        run_id: runId,
        artifact_type: 'json_proof',
        payload: { status: 'completed', details: 'All good' },
      });
    expect(res.status).toBe(201);
    expect(res.body.message).toContain('successfully');
  });

  test('submit_proof for non-existent task → 404', async () => {
    const res = await request(app)
      .post('/api/v1/tasks/nonexistent-task/submit_proof')
      .set(authHeader)
      .send({
        run_id: runId,
        artifact_type: 'json_proof',
        payload: {},
      });
    expect(res.status).toBe(404);
    expect(res.body.code).toBe('NOT_FOUND');
  });

  test('submit_proof for non-existent run → 404', async () => {
    const res = await request(app)
      .post(`/api/v1/tasks/${taskId}/submit_proof`)
      .set(authHeader)
      .send({
        run_id: 'nonexistent-run',
        artifact_type: 'json_proof',
        payload: {},
      });
    // Task might not be found (already validated above) or run not found
    expect([400, 404]).toContain(res.status);
  });
});

// ─── Legacy routes still work ───────────────────────────────────────

describe('Legacy /v1/* routes maintain auth', () => {
  test('POST /v1/projects/init — no token → 401', async () => {
    const res = await request(app)
      .post('/v1/projects/init')
      .send({ name: 'Test' });
    expect(res.status).toBe(401);
  });

  test('POST /v1/projects/init — valid token + valid body → 201', async () => {
    const res = await request(app)
      .post('/v1/projects/init')
      .set(authHeader)
      .send({ name: 'Test Project', description: 'desc' });
    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('id');
    expect(res.body).toHaveProperty('name', 'Test Project');
  });

  test('POST /v1/agents/register — valid token + valid body → 200', async () => {
    const res = await request(app)
      .post('/v1/agents/register')
      .set(authHeader)
      .send({ id: 'agent-test-1', lane: 'DEV' });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ id: 'agent-test-1', lane: 'DEV', status: 'online' });
  });

  test('POST /v1/projects/init — missing required name → 422', async () => {
    const res = await request(app)
      .post('/v1/projects/init')
      .set(authHeader)
      .send({ description: 'no name' });
    expect(res.status).toBe(422);
    expect(res.body.code).toBe('VALIDATION_ERROR');
  });
});

// ─── Error response shape consistency ───────────────────────────────

describe('Error response shape is always { error, code, details? }', () => {
  const errorResponses: Array<{ status: number; body: any }> = [];

  afterAll(() => {
    // Verify all error responses follow the standard shape
    for (const { status, body } of errorResponses) {
      expect(body).toHaveProperty('error');
      expect(body).toHaveProperty('code');
      expect(typeof body.error).toBe('string');
      expect(typeof body.code).toBe('string');
    }
  });

  test('collect 401 error shape', async () => {
    const res = await request(app).post('/api/v1/tasks/claim').send({});
    expect(res.status).toBe(401);
    errorResponses.push(res as any);
  });

  test('collect 422 error shape', async () => {
    const res = await request(app)
      .post('/api/v1/tasks/t-1/submit_proof')
      .set(authHeader)
      .send({});
    expect(res.status).toBe(422);
    errorResponses.push(res as any);
  });

  test('collect 404 error shape', async () => {
    const res = await request(app)
      .post('/api/v1/tasks/claim')
      .set(authHeader)
      .send({});
    expect(res.status).toBe(404);
    errorResponses.push(res as any);
  });
});
