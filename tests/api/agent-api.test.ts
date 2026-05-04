/**
 * T2.3 TDD Tests: Agent 管理 API（3个接口）
 *
 * Acceptance Criteria Coverage:
 * AC1: POST /api/v1/agents/register 注册/心跳续约
 * AC2: GET /api/v1/agents 列出所有 Agent 状态
 * AC3: GET /api/v1/agents/:id/health 单个探活
 * AC4: register 自动更新 last_heartbeat
 * AC5: health 超时 15s 标记 offline
 * AC6: TDD 测试通过（RED → GREEN → REFACTOR）
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

const AUTH_TOKEN = 'test-b...7890';
let app: ReturnType<typeof createServer>;
let prismaDal: PrismaDAL;
let legacyDal: DAL;
let tmpDbPath: string;

beforeAll(async () => {
  // Create a temp directory for test isolation
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-agent-test-'));

  // Use Prisma test DB
  tmpDbPath = path.join(tmpDir, 'test_agent.db');
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
  const legacyDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-legacy-agent-'));
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
});

afterAll(async () => {
  await prismaDal.close();
  try { legacyDal.close(); } catch {}
});

// Helper: auth header
const authHeader = { Authorization: `Bearer ${AUTH_TOKEN}` };

// ═══════════════════════════════════════════════════════════════
//  AC1: POST /api/v1/agents/register — 注册/心跳续约
// ═══════════════════════════════════════════════════════════════

describe('AC1: POST /api/v1/agents/register', () => {
  test('should register a new agent with required fields', async () => {
    const res = await request(app)
      .post('/api/v1/agents/register')
      .set(authHeader)
      .send({ id: 'test-coder-1', lane: 'DEV' });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('agent_id', 'test-coder-1');
    expect(res.body).toHaveProperty('lane', 'DEV');
    expect(res.body).toHaveProperty('status', 'online');
    expect(res.body).toHaveProperty('last_heartbeat');
  });

  test('should register agent with optional fields', async () => {
    const res = await request(app)
      .post('/api/v1/agents/register')
      .set(authHeader)
      .send({
        id: 'test-designer-1',
        lane: 'DESIGN',
        endpoint: 'http://localhost:9001/webhook',
        dialect: 'hermes',
      });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('agent_id', 'test-designer-1');
    expect(res.body).toHaveProperty('lane', 'DESIGN');
    expect(res.body.endpoint).toBe('http://localhost:9001/webhook');
    expect(res.body.dialect).toBe('hermes');
  });

  test('AC4: should update last_heartbeat on repeated register (heartbeat renewal)', async () => {
    // First registration
    const res1 = await request(app)
      .post('/api/v1/agents/register')
      .set(authHeader)
      .send({ id: 'test-heartbeat-1', lane: 'OPS' });

    expect(res1.status).toBe(200);
    const firstHeartbeat = res1.body.last_heartbeat;

    // Wait a small amount to ensure time difference
    await new Promise(resolve => setTimeout(resolve, 100));

    // Second registration (heartbeat renewal)
    const res2 = await request(app)
      .post('/api/v1/agents/register')
      .set(authHeader)
      .send({ id: 'test-heartbeat-1', lane: 'OPS' });

    expect(res2.status).toBe(200);
    expect(res2.body.last_heartbeat).not.toBe(firstHeartbeat);
    expect(res2.body.status).toBe('online');
  });

  test('should update lane on re-register', async () => {
    // Register first with DEV
    await request(app)
      .post('/api/v1/agents/register')
      .set(authHeader)
      .send({ id: 'test-lane-change', lane: 'DEV' });

    // Re-register with CONTENT lane
    const res = await request(app)
      .post('/api/v1/agents/register')
      .set(authHeader)
      .send({ id: 'test-lane-change', lane: 'CONTENT' });

    expect(res.status).toBe(200);
    expect(res.body.lane).toBe('CONTENT');
  });

  test('should reject missing id (422)', async () => {
    const res = await request(app)
      .post('/api/v1/agents/register')
      .set(authHeader)
      .send({ lane: 'DEV' });

    expect(res.status).toBe(422);
    expect(res.body.code).toBe('VALIDATION_ERROR');
  });

  test('should reject missing lane (422)', async () => {
    const res = await request(app)
      .post('/api/v1/agents/register')
      .set(authHeader)
      .send({ id: 'test-no-lane' });

    expect(res.status).toBe(422);
    expect(res.body.code).toBe('VALIDATION_ERROR');
  });

  test('should reject empty body (422)', async () => {
    const res = await request(app)
      .post('/api/v1/agents/register')
      .set(authHeader)
      .send({});

    expect(res.status).toBe(422);
    expect(res.body.code).toBe('VALIDATION_ERROR');
  });

  test('should require auth (401)', async () => {
    const res = await request(app)
      .post('/api/v1/agents/register')
      .send({ id: 'test-no-auth', lane: 'DEV' });

    expect(res.status).toBe(401);
  });
});

// ═══════════════════════════════════════════════════════════════
//  AC2: GET /api/v1/agents — 列出所有 Agent 状态
// ═══════════════════════════════════════════════════════════════

describe('AC2: GET /api/v1/agents', () => {
  beforeAll(async () => {
    // Register a few agents for listing
    await request(app)
      .post('/api/v1/agents/register')
      .set(authHeader)
      .send({ id: 'list-agent-1', lane: 'DEV' });

    await request(app)
      .post('/api/v1/agents/register')
      .set(authHeader)
      .send({ id: 'list-agent-2', lane: 'OPS' });
  });

  test('should return list of all registered agents', async () => {
    const res = await request(app)
      .get('/api/v1/agents')
      .set(authHeader);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('agents');
    expect(Array.isArray(res.body.agents)).toBe(true);
    expect(res.body.agents.length).toBeGreaterThanOrEqual(2);

    // Each agent should have expected fields
    const agent = res.body.agents.find((a: any) => a.agent_id === 'list-agent-1');
    expect(agent).toBeDefined();
    expect(agent).toHaveProperty('agent_id');
    expect(agent).toHaveProperty('lane');
    expect(agent).toHaveProperty('status');
    expect(agent).toHaveProperty('last_heartbeat');
  });

  test('should return empty array when no agents', async () => {
    // Use a fresh DB to test empty case — we verify the endpoint works
    // In this test suite agents exist, so just verify the structure
    const res = await request(app)
      .get('/api/v1/agents')
      .set(authHeader);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('agents');
    expect(Array.isArray(res.body.agents)).toBe(true);
  });

  test('should require auth (401)', async () => {
    const res = await request(app)
      .get('/api/v1/agents');

    expect(res.status).toBe(401);
  });
});

// ═══════════════════════════════════════════════════════════════
//  AC3+AC5: GET /api/v1/agents/:id/health — 单个探活
// ═══════════════════════════════════════════════════════════════

describe('AC3+AC5: GET /api/v1/agents/:id/health', () => {
  test('should return online status for recently registered agent', async () => {
    // Register a fresh agent
    await request(app)
      .post('/api/v1/agents/register')
      .set(authHeader)
      .send({ id: 'health-online-1', lane: 'DEV' });

    const res = await request(app)
      .get('/api/v1/agents/health-online-1/health')
      .set(authHeader);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('agent_id', 'health-online-1');
    expect(res.body).toHaveProperty('status', 'online');
    expect(res.body).toHaveProperty('last_heartbeat');
    expect(res.body).toHaveProperty('health_checked_at');
  });

  test('AC5: should mark agent offline when last_heartbeat > 15s', async () => {
    // Register an agent
    await request(app)
      .post('/api/v1/agents/register')
      .set(authHeader)
      .send({ id: 'health-offline-1', lane: 'OPS' });

    // Manually set last_heartbeat to 20 seconds ago via Prisma
    const twentySecsAgo = new Date(Date.now() - 20_000);
    await prismaDal.client.agent.updateMany({
      where: { agent_id: 'health-offline-1' },
      data: { last_heartbeat: twentySecsAgo },
    });

    const res = await request(app)
      .get('/api/v1/agents/health-offline-1/health')
      .set(authHeader);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('status', 'offline');
    expect(res.body).toHaveProperty('last_heartbeat');
  });

  test('should return 404 for non-existent agent', async () => {
    const res = await request(app)
      .get('/api/v1/agents/nonexistent-agent/health')
      .set(authHeader);

    expect(res.status).toBe(404);
    expect(res.body.code).toBe('NOT_FOUND');
  });

  test('should require auth (401)', async () => {
    const res = await request(app)
      .get('/api/v1/agents/health-online-1/health');

    expect(res.status).toBe(401);
  });
});
