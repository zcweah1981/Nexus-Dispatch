import { execFileSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import request from 'supertest';
import { PrismaClient } from '@prisma/client';
import { createServer } from '../../src/api/server';

const repoRoot = path.resolve(__dirname, '../..');
const TOKEN = 'r39-token';

function makeLegacyDalTrap() {
  return new Proxy({}, {
    get(_target, prop) {
      throw new Error(`Legacy DAL must not be touched by R39 release/proof/observability APIs: ${String(prop)}`);
    },
  }) as any;
}

function expectNoSecretLeak(value: unknown) {
  const text = JSON.stringify(value);
  expect(text).not.toMatch(/sk-r39-secret|ghp_r39secret|xoxb-r39-secret|Bearer\s+r39-secret|-1001234567890|123456:r39telegram/i);
  expect(text).not.toMatch(/bot_token|chat_id|database_url|DATABASE_URL|db_path|worker_credentials/i);
}

describe('R39-T4 release, proof, observability runtime APIs', () => {
  let tmpDir: string;
  let prisma: PrismaClient;
  let app: ReturnType<typeof createServer>;

  beforeEach(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-r39-t4-'));
    const dbPath = path.join(tmpDir, 'r39-t4.db');
    execFileSync('npm', ['run', 'db:init:test', '--', dbPath], {
      cwd: repoRoot,
      encoding: 'utf8',
      env: { ...process.env, DATABASE_URL: undefined },
    });
    prisma = new PrismaClient({ datasources: { db: { url: `file:${dbPath}` } } });
    app = createServer(makeLegacyDalTrap(), TOKEN, { client: prisma } as any);

    await prisma.project.create({ data: { id: 'r39-project-a', name: 'R39 Project A', channel_config: JSON.stringify({ bot_token: '123456:r39telegram', chat_id: '-1001234567890', visible_language: 'zh-CN' }) } });
    await prisma.project.create({ data: { id: 'r39-project-b', name: 'R39 Project B' } });

    await prisma.agent.create({ data: { id: 'r39-agent-long', project_id: 'r39-project-a', agent_id: 'long-r39', endpoint: 'https://worker.example.com/hook?token=sk-r39-secret', lane: 'DEV', dialect: 'hermes', soul_prompt: 'do work', tools_allowed: '[]', status: 'online' } });
    await prisma.agent.create({ data: { id: 'r39-agent-shun', project_id: 'r39-project-a', agent_id: 'shun-r39', endpoint: 'https://reviewer.example.com/hook', lane: 'REVIEW', dialect: 'hermes', soul_prompt: 'review', tools_allowed: '[]', status: 'offline' } });
    await prisma.agent.create({ data: { id: 'r39-agent-other', project_id: 'r39-project-b', agent_id: 'other-r39', endpoint: 'https://other.example.com', lane: 'DEV', dialect: 'hermes', soul_prompt: 'other', tools_allowed: '[]', status: 'online' } });

    await prisma.task.create({ data: { id: 'r39-task-completed', project_id: 'r39-project-a', title: 'Completed release task', objective: 'done', lane_required: 'DEV', status: 'completed', ext_meta: JSON.stringify({ proof_summary: 'npm test passed with Bearer r39-secret' }) } });
    await prisma.task.create({ data: { id: 'r39-task-blocked', project_id: 'r39-project-a', title: 'Blocked release task', objective: 'blocked', lane_required: 'DEV', status: 'blocked' } });
    await prisma.task.create({ data: { id: 'r39-task-other', project_id: 'r39-project-b', title: 'Other project task', objective: 'hidden', lane_required: 'DEV', status: 'completed' } });

    await prisma.run.create({ data: { run_id: 'r39-run-success', project_id: 'r39-project-a', task_id: 'r39-task-completed', agent_id: 'r39-agent-long', dispatch_id: 'dispatch-secret', worker_run_id: 'worker-secret', idempotency_key: 'r39-run-success', status: 'success', result_summary: 'GREEN proof ghp_r39secret', ended_at: new Date() } });
    await prisma.run.create({ data: { run_id: 'r39-run-failed', project_id: 'r39-project-a', task_id: 'r39-task-blocked', agent_id: 'r39-agent-long', idempotency_key: 'r39-run-failed', status: 'failed', error_stack: 'xoxb-r39-secret failure', ended_at: new Date() } });
    await prisma.run.create({ data: { run_id: 'r39-run-other', project_id: 'r39-project-b', task_id: 'r39-task-other', agent_id: 'r39-agent-other', idempotency_key: 'r39-run-other', status: 'success', result_summary: 'other hidden', ended_at: new Date() } });

    await prisma.artifact.create({ data: { id: 'r39-artifact-proof', project_id: 'r39-project-a', task_id: 'r39-task-completed', run_id: 'r39-run-success', artifact_type: 'runtime_proof', path: '/root/private/proof.json', payload: JSON.stringify({ token: 'sk-r39-secret', result: 'passed' }), payload_data: JSON.stringify({ command: 'npm test', status: 'passed', secret: 'ghp_r39secret' }), proof: JSON.stringify({ summary: 'focused tests passed', chat_id: '-1001234567890' }), metadata_json: JSON.stringify({ report_id: 'report-secret' }) } });
    await prisma.artifact.create({ data: { id: 'r39-artifact-other', project_id: 'r39-project-b', task_id: 'r39-task-other', run_id: 'r39-run-other', artifact_type: 'runtime_proof', path: 'other-proof', payload: JSON.stringify({ result: 'hidden' }) } });

    await prisma.report.create({ data: { id: 'r39-report-a', project_id: 'r39-project-a', task_id: 'r39-task-completed', run_id: 'r39-run-success', message_type: 'agent_result', status: 'sent', summary: 'Release proof summary sk-r39-secret', payload_json: JSON.stringify({ raw: 'secret', bot_token: '123456:r39telegram' }) } });
  }, 30000);

  afterEach(async () => {
    await prisma.$disconnect();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('returns project-scoped release readiness and leak scan summaries without secrets', async () => {
    const readiness = await request(app)
      .get('/api/v1/runtime/projects/r39-project-a/release/readiness')
      .set('Authorization', `Bearer ${TOKEN}`)
      .expect(200);

    expect(readiness.body.release_readiness).toMatchObject({ project_id: 'r39-project-a', ready: false });
    expect(readiness.body.release_readiness.blockers).toEqual(expect.arrayContaining([expect.objectContaining({ type: 'blocked_tasks', count: 1 })]));
    expect(JSON.stringify(readiness.body)).not.toContain('r39-project-b');
    expectNoSecretLeak(readiness.body);

    const leakScan = await request(app)
      .get('/api/v1/runtime/projects/r39-project-a/leak-scan/summary')
      .set('Authorization', `Bearer ${TOKEN}`)
      .expect(200);

    expect(leakScan.body.leak_scan_summary).toMatchObject({ project_id: 'r39-project-a', project_scoped: true, raw_secret_values_exposed: false });
    expect(leakScan.body.leak_scan_summary.findings_by_source.artifacts).toBeGreaterThanOrEqual(1);
    expectNoSecretLeak(leakScan.body);
  });

  it('searches proof artifacts/reports with filters while redacting payloads and isolating projects', async () => {
    const proofs = await request(app)
      .get('/api/v1/runtime/projects/r39-project-a/proofs?query=focused&artifact_type=runtime_proof')
      .set('Authorization', `Bearer ${TOKEN}`)
      .expect(200);

    expect(proofs.body).toMatchObject({ project_id: 'r39-project-a' });
    expect(proofs.body.proofs).toHaveLength(1);
    expect(proofs.body.proofs[0]).toMatchObject({ artifact_type: 'runtime_proof', task_id: 'r39-task-completed', proof_summary: expect.stringContaining('focused') });
    expect(JSON.stringify(proofs.body)).not.toContain('r39-artifact-other');
    expectNoSecretLeak(proofs.body);
  });

  it('returns observability metrics and agent performance scoped to one project', async () => {
    const metrics = await request(app)
      .get('/api/v1/runtime/projects/r39-project-a/observability/metrics')
      .set('Authorization', `Bearer ${TOKEN}`)
      .expect(200);

    expect(metrics.body.metrics).toMatchObject({ project_id: 'r39-project-a', project_scoped: true });
    expect(metrics.body.metrics.task_counts_by_status.blocked).toBe(1);
    expect(metrics.body.metrics.run_counts_by_status.failed).toBe(1);
    expect(metrics.body.metrics.proof_counts_by_type.runtime_proof).toBe(1);
    expectNoSecretLeak(metrics.body);

    const performance = await request(app)
      .get('/api/v1/runtime/projects/r39-project-a/agents/performance')
      .set('Authorization', `Bearer ${TOKEN}`)
      .expect(200);

    expect(performance.body.agent_performance).toEqual(expect.arrayContaining([
      expect.objectContaining({ agent_id: 'long-r39', total_runs: 2, success_runs: 1, failed_runs: 1 }),
      expect.objectContaining({ agent_id: 'shun-r39', total_runs: 0 }),
    ]));
    expect(JSON.stringify(performance.body)).not.toContain('other-r39');
    expectNoSecretLeak(performance.body);
  });
});
