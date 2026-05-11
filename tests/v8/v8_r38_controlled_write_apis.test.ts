import { execFileSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import request from 'supertest';
import { PrismaClient } from '@prisma/client';
import { createServer } from '../../src/api/server';

const repoRoot = path.resolve(__dirname, '../..');
const TOKEN = 'valid-token';

function makeLegacyDalTrap() {
  return new Proxy({}, {
    get(_target, prop) {
      throw new Error(`Legacy DAL must not be touched by R38 controlled write APIs: ${String(prop)}`);
    },
  }) as any;
}

function flattened(value: unknown): string {
  return JSON.stringify(value);
}

function expectNoSecretLeak(value: unknown) {
  const text = flattened(value);
  expect(text).not.toMatch(/sk-r38-secret|ghp_r38secret|xoxb-r38|Bearer\s+r38-secret|123456:telegram-r38-secret|-1009876543210/);
  expect(text).not.toMatch(/bot_token|chat_id|database_url|DATABASE_URL|db_path|worker_credentials/);
}

describe('R38 controlled write APIs and audit events', () => {
  let tmpDir: string;
  let prisma: PrismaClient;
  let app: ReturnType<typeof createServer>;

  beforeEach(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-r38-controlled-write-'));
    const dbPath = path.join(tmpDir, 'r38.db');
    execFileSync('npm', ['run', 'db:init:test', '--', dbPath], {
      cwd: repoRoot,
      encoding: 'utf8',
      env: { ...process.env, DATABASE_URL: undefined },
    });
    prisma = new PrismaClient({ datasources: { db: { url: `file:${dbPath}` } } });
    app = createServer(makeLegacyDalTrap(), TOKEN, { client: prisma } as any);

    await prisma.project.create({ data: { id: 'r38-project-a', name: 'R38 Project A' } });
    await prisma.project.create({ data: { id: 'r38-project-b', name: 'R38 Project B' } });
    await prisma.task.create({
      data: {
        id: 'r38-task-created',
        project_id: 'r38-project-a',
        title: 'Created task',
        objective: 'Dispatch through controlled action',
        lane_required: 'DEV',
        status: 'created',
      },
    });
    await prisma.task.create({
      data: {
        id: 'r38-task-running',
        project_id: 'r38-project-a',
        title: 'Running task',
        objective: 'Invalid transition source',
        lane_required: 'DEV',
        status: 'running',
      },
    });
    await prisma.task.create({
      data: {
        id: 'r38-task-other-project',
        project_id: 'r38-project-b',
        title: 'Other project task',
        objective: 'Must remain isolated',
        lane_required: 'DEV',
        status: 'created',
      },
    });
  }, 30000);

  afterEach(async () => {
    await prisma.$disconnect();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test('controlled task dispatch is project-scoped, FSM-validated, and creates a sanitized audit event', async () => {
    const response = await request(app)
      .post('/api/v1/runtime/projects/r38-project-a/tasks/r38-task-created/dispatch')
      .set('Authorization', `Bearer ${TOKEN}`)
      .send({
        actor: 'pm-webui',
        reason: 'Manual dispatch Bearer r38-secret sk-r38-secret',
        idempotency_key: 'r38-dispatch-1',
      })
      .expect(200);

    expect(response.body.task.status).toBe('dispatched');
    expect(response.body.audit_event.action).toBe('task.dispatch');
    expectNoSecretLeak(response.body);

    await request(app)
      .post('/api/v1/runtime/projects/r38-project-b/tasks/r38-task-created/dispatch')
      .set('Authorization', `Bearer ${TOKEN}`)
      .send({ actor: 'pm-webui', reason: 'wrong project' })
      .expect(404);

    await request(app)
      .post('/api/v1/runtime/projects/r38-project-a/tasks/r38-task-running/dispatch')
      .set('Authorization', `Bearer ${TOKEN}`)
      .send({ actor: 'pm-webui', reason: 'invalid source' })
      .expect(409)
      .expect((res) => expect(res.body.code).toBe('ILLEGAL_TRANSITION'));

    const auditList = await request(app)
      .get('/api/v1/runtime/projects/r38-project-a/audit-events')
      .set('Authorization', `Bearer ${TOKEN}`)
      .expect(200);

    expect(auditList.body.audit_events).toHaveLength(1);
    expect(auditList.body.audit_events[0].target_id).toBe('r38-task-created');
    expectNoSecretLeak(auditList.body);

    const otherProjectAudit = await request(app)
      .get('/api/v1/runtime/projects/r38-project-b/audit-events')
      .set('Authorization', `Bearer ${TOKEN}`)
      .expect(200);
    expect(otherProjectAudit.body.audit_events).toEqual([]);
  });

  test('controlled settings patch allows low-risk fields, rejects high-risk fields, redacts, and audits', async () => {
    await request(app)
      .patch('/api/v1/runtime/projects/r38-project-a/settings')
      .set('Authorization', `Bearer ${TOKEN}`)
      .send({
        actor: 'pm-webui',
        reason: 'safe settings update with ghp_r38secret should redact',
        visible_language: 'en-US',
        display_name: 'R38 Console',
        docs_url: 'https://docs.example.com?n=sk-r38-secret',
        public_repo_url: 'https://github.com/example/repo',
        notification_quiet_mode: true,
      })
      .expect(200)
      .expect((res) => {
        expect(res.body.settings.visible_language).toBe('en-US');
        expect(res.body.audit_event.action).toBe('settings.update');
        expectNoSecretLeak(res.body);
      });

    const project = await prisma.project.findUniqueOrThrow({ where: { id: 'r38-project-a' } });
    const config = JSON.parse(project.channel_config || '{}');
    expect(config.visible_language).toBe('en-US');
    expect(config.display_name).toBe('R38 Console');

    await request(app)
      .patch('/api/v1/runtime/projects/r38-project-a/settings')
      .set('Authorization', `Bearer ${TOKEN}`)
      .send({
        actor: 'pm-webui',
        reason: 'try high risk',
        db_path: '/root/private/nexus.db',
        bot_token: '123456:telegram-r38-secret',
        chat_id: '-1009876543210',
        worker_credentials: { Authorization: 'Bearer r38-secret' },
      })
      .expect(400)
      .expect((res) => {
        expect(res.body.code).toBe('HIGH_RISK_SETTING_REJECTED');
        expectNoSecretLeak(res.body);
      });

    const auditList = await request(app)
      .get('/api/v1/runtime/projects/r38-project-a/audit-events?action=settings.update')
      .set('Authorization', `Bearer ${TOKEN}`)
      .expect(200);
    expect(auditList.body.audit_events).toHaveLength(1);
    expectNoSecretLeak(auditList.body);
  });
});
