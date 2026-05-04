/**
 * T2.4 TDD Tests: 项目蓝图 API（4个接口）
 *
 * Acceptance Criteria Coverage:
 * AC1: POST /api/v1/projects/init 项目初始化（骨架+建档）
 * AC2: GET /api/v1/projects/:id 查询项目状态
 * AC3: POST /api/v1/blueprints 存入大盘规划
 * AC4: GET /api/v1/blueprints/:projectId/next_phase 获取下一 Phase
 * AC5: TDD 测试通过（RED → GREEN → REFACTOR）
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

const AUTH_TOKEN = 'test-blueprint-token-67890';
let app: ReturnType<typeof createServer>;
let prismaDal: PrismaDAL;
let legacyDal: DAL;
let tmpDbPath: string;
let tmpPrismaDir: string;

beforeAll(async () => {
  // Create a temp directory for test isolation
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-bp-test-'));
  tmpPrismaDir = tmpDir;

  // Use Prisma test DB
  tmpDbPath = path.join(tmpDir, 'test_bp.db');
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

  // Legacy DAL for server compat (unused by our new endpoints but needed by createServer)
  const legacyDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-legacy-'));
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
//  AC1: POST /api/v1/projects/init — 项目初始化（骨架+建档）
// ═══════════════════════════════════════════════════════════════

describe('AC1: POST /api/v1/projects/init', () => {
  test('should create a new project with valid name', async () => {
    const res = await request(app)
      .post('/api/v1/projects/init')
      .set(authHeader)
      .send({ name: 'Test Blueprint Project' });

    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('id');
    expect(res.body).toHaveProperty('name', 'Test Blueprint Project');
    expect(res.body).toHaveProperty('status', 'active');
  });

  test('should create project with optional description', async () => {
    const res = await request(app)
      .post('/api/v1/projects/init')
      .set(authHeader)
      .send({ name: 'Project With Description', description: 'A test project for blueprints' });

    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('id');
    expect(res.body.name).toBe('Project With Description');
    expect(res.body.description).toBe('A test project for blueprints');
  });

  test('should reject missing name (422)', async () => {
    const res = await request(app)
      .post('/api/v1/projects/init')
      .set(authHeader)
      .send({});

    expect(res.status).toBe(422);
    expect(res.body.code).toBe('VALIDATION_ERROR');
  });

  test('should reject empty name (422)', async () => {
    const res = await request(app)
      .post('/api/v1/projects/init')
      .set(authHeader)
      .send({ name: '' });

    expect(res.status).toBe(422);
    expect(res.body.code).toBe('VALIDATION_ERROR');
  });

  test('should reject duplicate project name (409)', async () => {
    // Create first
    await request(app)
      .post('/api/v1/projects/init')
      .set(authHeader)
      .send({ name: 'UniqueProjectName' });

    // Try duplicate
    const res = await request(app)
      .post('/api/v1/projects/init')
      .set(authHeader)
      .send({ name: 'UniqueProjectName' });

    expect(res.status).toBe(409);
    expect(res.body.code).toBe('BAD_REQUEST');
  });

  test('should require auth (401)', async () => {
    const res = await request(app)
      .post('/api/v1/projects/init')
      .send({ name: 'No Auth Project' });

    expect(res.status).toBe(401);
  });
});

// ═══════════════════════════════════════════════════════════════
//  AC2: GET /api/v1/projects/:id — 查询项目状态
// ═══════════════════════════════════════════════════════════════

describe('AC2: GET /api/v1/projects/:id', () => {
  let projectId: string;

  beforeAll(async () => {
    // Create a project to query
    const res = await request(app)
      .post('/api/v1/projects/init')
      .set(authHeader)
      .send({ name: 'Queryable Project' });
    projectId = res.body.id;
  });

  test('should return project details for valid id', async () => {
    const res = await request(app)
      .get(`/api/v1/projects/${projectId}`)
      .set(authHeader);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('id', projectId);
    expect(res.body).toHaveProperty('name', 'Queryable Project');
    expect(res.body).toHaveProperty('status', 'active');
    expect(res.body).toHaveProperty('created_at');
  });

  test('should return 404 for non-existent project', async () => {
    const res = await request(app)
      .get('/api/v1/projects/nonexistent-id-12345')
      .set(authHeader);

    expect(res.status).toBe(404);
    expect(res.body.code).toBe('NOT_FOUND');
  });

  test('should require auth (401)', async () => {
    const res = await request(app)
      .get(`/api/v1/projects/${projectId}`);

    expect(res.status).toBe(401);
  });
});

// ═══════════════════════════════════════════════════════════════
//  AC3: POST /api/v1/blueprints — 存入大盘规划
// ═══════════════════════════════════════════════════════════════

describe('AC3: POST /api/v1/blueprints', () => {
  let projectId: string;

  beforeAll(async () => {
    const res = await request(app)
      .post('/api/v1/projects/init')
      .set(authHeader)
      .send({ name: 'Blueprint Target Project' });
    projectId = res.body.id;
  });

  test('should create a blueprint for an existing project', async () => {
    const blueprintData = {
      project_id: projectId,
      name: 'Nexus V7.5 Master Blueprint',
      blueprint_id: 'bp-nexus-v75-test',
      version: '1.0',
      schema_json: {
        phases: [
          { name: 'Phase 1: Foundation', tasks: ['t1', 't2'] },
          { name: 'Phase 2: Core', tasks: ['t3', 't4'] },
          { name: 'Phase 3: Polish', tasks: ['t5'] },
        ],
      },
    };

    const res = await request(app)
      .post('/api/v1/blueprints')
      .set(authHeader)
      .send(blueprintData);

    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('id');
    expect(res.body).toHaveProperty('blueprint_id', 'bp-nexus-v75-test');
    expect(res.body).toHaveProperty('name', 'Nexus V7.5 Master Blueprint');
    expect(res.body).toHaveProperty('project_id', projectId);
    expect(res.body).toHaveProperty('status', 'draft');
  });

  test('should reject missing required fields (422)', async () => {
    const res = await request(app)
      .post('/api/v1/blueprints')
      .set(authHeader)
      .send({ project_id: projectId });

    expect(res.status).toBe(422);
    expect(res.body.code).toBe('VALIDATION_ERROR');
  });

  test('should reject blueprint for non-existent project (404)', async () => {
    const res = await request(app)
      .post('/api/v1/blueprints')
      .set(authHeader)
      .send({
        project_id: 'nonexistent-project-id',
        name: 'Ghost Blueprint',
        blueprint_id: 'bp-ghost',
        schema_json: { phases: [] },
      });

    expect(res.status).toBe(404);
    expect(res.body.code).toBe('NOT_FOUND');
  });

  test('should reject duplicate blueprint_id (409)', async () => {
    // First blueprint already created above
    const res = await request(app)
      .post('/api/v1/blueprints')
      .set(authHeader)
      .send({
        project_id: projectId,
        name: 'Duplicate Blueprint',
        blueprint_id: 'bp-nexus-v75-test',
        schema_json: { phases: [] },
      });

    expect(res.status).toBe(409);
    expect(res.body.code).toBe('BAD_REQUEST');
  });

  test('should require auth (401)', async () => {
    const res = await request(app)
      .post('/api/v1/blueprints')
      .send({
        project_id: projectId,
        name: 'No Auth Blueprint',
        blueprint_id: 'bp-noauth',
        schema_json: {},
      });

    expect(res.status).toBe(401);
  });
});

// ═══════════════════════════════════════════════════════════════
//  AC4: GET /api/v1/blueprints/:projectId/next_phase
// ═══════════════════════════════════════════════════════════════

describe('AC4: GET /api/v1/blueprints/:projectId/next_phase', () => {
  let projectId: string;
  let blueprintId: string;

  beforeAll(async () => {
    // Create a project and a multi-phase blueprint
    const projRes = await request(app)
      .post('/api/v1/projects/init')
      .set(authHeader)
      .send({ name: 'NextPhase Test Project' });
    projectId = projRes.body.id;

    const bpRes = await request(app)
      .post('/api/v1/blueprints')
      .set(authHeader)
      .send({
        project_id: projectId,
        name: 'Phase Test Blueprint',
        blueprint_id: 'bp-phase-test',
        schema_json: {
          phases: [
            { name: 'Phase 1: Foundation', tasks: ['t1', 't2'], status: 'completed' },
            { name: 'Phase 2: Core', tasks: ['t3', 't4'], status: 'active' },
            { name: 'Phase 3: Polish', tasks: ['t5'], status: 'pending' },
          ],
        },
      });
    blueprintId = bpRes.body.blueprint_id;
  });

  test('should return the next incomplete phase (Phase 2)', async () => {
    const res = await request(app)
      .get(`/api/v1/blueprints/${projectId}/next_phase`)
      .set(authHeader);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('phase');
    expect(res.body.phase.name).toBe('Phase 2: Core');
    expect(res.body.phase.status).toBe('active');
    expect(res.body.phase.tasks).toEqual(['t3', 't4']);
    expect(res.body).toHaveProperty('phase_index', 1);
    expect(res.body).toHaveProperty('total_phases', 3);
  });

  test('should return 404 when project has no blueprints', async () => {
    const emptyProj = await request(app)
      .post('/api/v1/projects/init')
      .set(authHeader)
      .send({ name: 'Empty Blueprint Project' });

    const res = await request(app)
      .get(`/api/v1/blueprints/${emptyProj.body.id}/next_phase`)
      .set(authHeader);

    expect(res.status).toBe(404);
    expect(res.body.code).toBe('NOT_FOUND');
  });

  test('should return 204 when all phases completed', async () => {
    // Create project with all completed phases
    const allDoneProj = await request(app)
      .post('/api/v1/projects/init')
      .set(authHeader)
      .send({ name: 'All Done Project' });

    await request(app)
      .post('/api/v1/blueprints')
      .set(authHeader)
      .send({
        project_id: allDoneProj.body.id,
        name: 'All Done Blueprint',
        blueprint_id: 'bp-all-done',
        schema_json: {
          phases: [
            { name: 'Phase 1', tasks: ['t1'], status: 'completed' },
            { name: 'Phase 2', tasks: ['t2'], status: 'completed' },
          ],
        },
      });

    const res = await request(app)
      .get(`/api/v1/blueprints/${allDoneProj.body.id}/next_phase`)
      .set(authHeader);

    expect(res.status).toBe(204);
  });

  test('should return 404 for non-existent project', async () => {
    const res = await request(app)
      .get('/api/v1/blueprints/nonexistent-id/next_phase')
      .set(authHeader);

    expect(res.status).toBe(404);
    expect(res.body.code).toBe('NOT_FOUND');
  });

  test('should require auth (401)', async () => {
    const res = await request(app)
      .get(`/api/v1/blueprints/${projectId}/next_phase`);

    expect(res.status).toBe(401);
  });
});
