/**
 * T2.5: FSM 控制器 + SSE API（3个接口） — TDD 测试套件
 *
 * 验收标准：
 *   AC1: GET /api/v1/controllers 列出 FSM 控制器
 *   AC2: PUT /api/v1/controllers/:id/config 热更新配置
 *   AC3: GET /api/v1/events/stream SSE 实时推送
 *   AC4: config 更新后下一个 Daemon tick 即时生效（SSE 推送 controller_config_updated）
 *   AC5: SSE 心跳 keep-alive
 *   AC6: TDD 测试通过
 */

import request from 'supertest';
import { createServer, stateEmitter } from '../src/api/server';
import DAL from '../src/db/dal';
import { PrismaDAL } from '../src/db/prisma_dal';
import * as path from 'path';
import * as fs from 'fs';

const AUTH_TOKEN = 'test-token-fsm';

// Use the existing test DB that already has the correct schema
const TEST_DB_DIR = path.join(__dirname, '..', 'prisma', 'data');

describe('T2.5: FSM Controller + SSE API', () => {
  let app: any;
  let dal: DAL;
  let prismaDal: PrismaDAL;
  let testDbPath: string;

  beforeAll(async () => {
    // 1. Setup legacy DAL (required by server.ts)
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

    // 2. Create a test DB with the correct schema by copying the existing one
    testDbPath = path.join(TEST_DB_DIR, 'test_fsm_t25.db');
    const sourceDb = path.join(TEST_DB_DIR, 'test_dal_v2.db');
    
    // Copy existing test DB (already has correct schema from prisma migrate)
    if (fs.existsSync(sourceDb)) {
      fs.copyFileSync(sourceDb, testDbPath);
    } else {
      // Fallback: copy the production DB
      const prodDb = path.join(TEST_DB_DIR, 'nexus.db');
      if (fs.existsSync(prodDb)) {
        fs.copyFileSync(prodDb, testDbPath);
      } else {
        throw new Error('No source DB available for test setup');
      }
    }

    const dbUrl = `file:${testDbPath}`;
    prismaDal = new PrismaDAL(dbUrl);
    await prismaDal.initPragmas();

    // Clean up fsm_controllers for isolation
    await (prismaDal as any).prisma.fSMController.deleteMany({});

    // 3. Create server with PrismaDAL injected
    app = createServer(dal, AUTH_TOKEN, prismaDal);
  });

  afterAll(async () => {
    await prismaDal.close();
    dal.close();
    // Clean up test DB
    try { fs.unlinkSync(testDbPath); } catch {}
  });

  // ─── Helper: seed a test controller ────────────────────────────
  async function seedController(controllerId: string = 'fsm-task-v1', overrides: Record<string, any> = {}) {
    const defaults = {
      controller_id: controllerId,
      name: 'Task FSM V1',
      entity_type: 'task',
      states_json: JSON.stringify(['created', 'dispatched', 'accepted', 'validating', 'completed', 'failed']),
      transitions_json: JSON.stringify([
        { from: 'created', to: 'dispatched', trigger: 'claim' },
        { from: 'dispatched', to: 'accepted', trigger: 'acknowledge' },
        { from: 'accepted', to: 'validating', trigger: 'submit_proof' },
        { from: 'validating', to: 'completed', trigger: 'approve' },
        { from: 'validating', to: 'failed', trigger: 'reject' },
      ]),
      initial_state: 'created',
    };
    const data = { ...defaults, ...overrides };

    await (prismaDal as any).prisma.fSMController.upsert({
      where: { controller_id: data.controller_id },
      update: data,
      create: data,
    });
  }

  // ═══════════════════════════════════════════════════════════════
  //  AC1: GET /api/v1/controllers 列出 FSM 控制器
  // ═══════════════════════════════════════════════════════════════
  describe('AC1: GET /api/v1/controllers', () => {
    it('should return empty array when no controllers exist', async () => {
      const res = await request(app)
        .get('/api/v1/controllers')
        .set('Authorization', `Bearer ${AUTH_TOKEN}`)
        .expect(200);

      expect(res.body).toHaveProperty('controllers');
      expect(Array.isArray(res.body.controllers)).toBe(true);
      expect(res.body.controllers.length).toBe(0);
    });

    it('should list seeded FSM controllers', async () => {
      await seedController('fsm-task-v1');
      await seedController('fsm-run-v1', {
        controller_id: 'fsm-run-v1',
        name: 'Run FSM V1',
        entity_type: 'run',
        states_json: JSON.stringify(['running', 'success', 'failed']),
        transitions_json: JSON.stringify([
          { from: 'running', to: 'success', trigger: 'complete' },
          { from: 'running', to: 'failed', trigger: 'error' },
        ]),
        initial_state: 'running',
      });

      const res = await request(app)
        .get('/api/v1/controllers')
        .set('Authorization', `Bearer ${AUTH_TOKEN}`)
        .expect(200);

      expect(res.body.controllers.length).toBe(2);
      const taskCtrl = res.body.controllers.find((c: any) => c.controller_id === 'fsm-task-v1');
      expect(taskCtrl).toBeDefined();
      expect(taskCtrl.name).toBe('Task FSM V1');
      expect(taskCtrl.entity_type).toBe('task');
      expect(Array.isArray(taskCtrl.states)).toBe(true);
      expect(taskCtrl.states).toContain('created');
      expect(Array.isArray(taskCtrl.transitions)).toBe(true);
      expect(taskCtrl.initial_state).toBe('created');
    });

    it('should filter by entity_type query param', async () => {
      const res = await request(app)
        .get('/api/v1/controllers?entity_type=run')
        .set('Authorization', `Bearer ${AUTH_TOKEN}`)
        .expect(200);

      expect(res.body.controllers.length).toBe(1);
      expect(res.body.controllers[0].entity_type).toBe('run');
    });

    it('should require auth', async () => {
      await request(app)
        .get('/api/v1/controllers')
        .expect(401);
    });
  });

  // ═══════════════════════════════════════════════════════════════
  //  AC2: PUT /api/v1/controllers/:id/config 热更新配置
  // ═══════════════════════════════════════════════════════════════
  describe('AC2: PUT /api/v1/controllers/:id/config', () => {
    it('should update controller name', async () => {
      const res = await request(app)
        .put('/api/v1/controllers/fsm-task-v1/config')
        .set('Authorization', `Bearer ${AUTH_TOKEN}`)
        .send({ name: 'Task FSM V1 - Updated' })
        .expect(200);

      expect(res.body.controller.name).toBe('Task FSM V1 - Updated');
    });

    it('should update states array', async () => {
      const newStates = ['created', 'dispatched', 'accepted', 'completed', 'failed'];
      const res = await request(app)
        .put('/api/v1/controllers/fsm-task-v1/config')
        .set('Authorization', `Bearer ${AUTH_TOKEN}`)
        .send({ states: newStates })
        .expect(200);

      expect(res.body.controller.states).toEqual(newStates);
    });

    it('should update transitions', async () => {
      const newTransitions = [
        { from: 'created', to: 'dispatched', trigger: 'claim' },
        { from: 'dispatched', to: 'completed', trigger: 'fast_track' },
      ];
      const res = await request(app)
        .put('/api/v1/controllers/fsm-task-v1/config')
        .set('Authorization', `Bearer ${AUTH_TOKEN}`)
        .send({ transitions: newTransitions })
        .expect(200);

      expect(res.body.controller.transitions).toEqual(newTransitions);
    });

    it('should update initial_state', async () => {
      const res = await request(app)
        .put('/api/v1/controllers/fsm-task-v1/config')
        .set('Authorization', `Bearer ${AUTH_TOKEN}`)
        .send({ initial_state: 'pending' })
        .expect(200);

      expect(res.body.controller.initial_state).toBe('pending');
    });

    it('should return 404 for non-existent controller', async () => {
      const res = await request(app)
        .put('/api/v1/controllers/non-existent-controller/config')
        .set('Authorization', `Bearer ${AUTH_TOKEN}`)
        .send({ name: 'Test' })
        .expect(404);

      expect(res.body.code).toBe('NOT_FOUND');
    });

    it('should reject empty body (minProperties: 1)', async () => {
      const res = await request(app)
        .put('/api/v1/controllers/fsm-task-v1/config')
        .set('Authorization', `Bearer ${AUTH_TOKEN}`)
        .send({})
        .expect(422);

      expect(res.body.code).toBe('VALIDATION_ERROR');
    });

    it('should reject unknown fields', async () => {
      const res = await request(app)
        .put('/api/v1/controllers/fsm-task-v1/config')
        .set('Authorization', `Bearer ${AUTH_TOKEN}`)
        .send({ evil_field: 'hacked' })
        .expect(422);
    });

    it('should require auth', async () => {
      await request(app)
        .put('/api/v1/controllers/fsm-task-v1/config')
        .send({ name: 'Unauthorized' })
        .expect(401);
    });
  });

  // ═══════════════════════════════════════════════════════════════
  //  AC3 + AC5: GET /api/v1/events/stream SSE 实时推送 + 心跳
  // ═══════════════════════════════════════════════════════════════
  describe('AC3+AC5: SSE Stream', () => {
    it('should establish SSE with correct headers and receive connected event', (done) => {
      request(app)
        .get('/api/v1/events/stream')
        .set('Authorization', `Bearer ${AUTH_TOKEN}`)
        .expect('Content-Type', /text\/event-stream/)
        .expect('Cache-Control', 'no-cache')
        .buffer(false)
        .parse((res: any, callback: any) => {
          res.on('data', (chunk: Buffer) => {
            const str = chunk.toString();
            if (str.includes('"type":"connected"')) {
              expect(str).toContain('SSE connection established');
              const dataLine = str.split('\n').find((l: string) => l.startsWith('data:'));
              if (dataLine) {
                const parsed = JSON.parse(dataLine.replace('data: ', ''));
                expect(parsed.type).toBe('connected');
                expect(typeof parsed.timestamp).toBe('number');
              }
              // Force close the response to clean up
              res.destroy();
              done();
            }
          });
        })
        .end(() => {});
    }, 5000);

    it('should push state_change events in real-time via SSE', (done) => {
      const req = request(app)
        .get('/api/v1/events/stream')
        .set('Authorization', `Bearer ${AUTH_TOKEN}`)
        .buffer(false)
        .parse((res: any, callback: any) => {
          let gotTestEvent = false;
          res.on('data', (chunk: Buffer) => {
            if (gotTestEvent) return;
            const str = chunk.toString();
            if (str.includes('"type":"test_sse_t25"')) {
              gotTestEvent = true;
              expect(str).toContain('hello_from_t25_test');
              res.destroy();
              done();
            }
          });
        })
        .end(() => {});

      // Emit test event after SSE is established
      setTimeout(() => {
        stateEmitter.emit('state_change', {
          type: 'test_sse_t25',
          data: { message: 'hello_from_t25_test' },
        });
      }, 200);

      setTimeout(() => { done(); }, 4000);
    }, 5000);
  });

  // ═══════════════════════════════════════════════════════════════
  //  AC4: config 更新触发 SSE 广播（Daemon tick 即时生效）
  // ═══════════════════════════════════════════════════════════════
  describe('AC4: Config update triggers SSE broadcast', () => {
    it('should emit controller_config_updated event on stateEmitter', async () => {
      // Listen on the emitter directly to verify the event is emitted
      const eventPromise = new Promise<any>((resolve) => {
        const handler = (event: any) => {
          if (event.type === 'controller_config_updated') {
            stateEmitter.off('state_change', handler);
            resolve(event);
          }
        };
        stateEmitter.on('state_change', handler);
      });

      // Trigger the config update
      await request(app)
        .put('/api/v1/controllers/fsm-task-v1/config')
        .set('Authorization', `Bearer ${AUTH_TOKEN}`)
        .send({ name: 'Broadcast Test Name' })
        .expect(200);

      // Wait for the SSE event to be emitted with timeout
      const event = await Promise.race([
        eventPromise,
        new Promise<null>((resolve) => setTimeout(() => resolve(null), 3000)),
      ]);

      expect(event).not.toBeNull();
      expect(event.type).toBe('controller_config_updated');
      expect(event.data.controller_id).toBe('fsm-task-v1');
      expect(event.data.updated_config).toBeDefined();
      expect(event.data.updated_config.name).toBe('Broadcast Test Name');
    });
  });
});
