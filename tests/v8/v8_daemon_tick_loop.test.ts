import { execFileSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { PrismaClient } from '@prisma/client';
import { V8DaemonTickLoop } from '../../src/daemon/v8_tick_loop';

const repoRoot = path.resolve(__dirname, '../..');

async function seedProject(prisma: PrismaClient, projectId: string) {
  await prisma.project.create({ data: { id: projectId, name: projectId, status: 'active' } });
}

describe('V8-R4 daemon tick loop five-step rebuild', () => {
  let tmpDir: string;
  let prisma: PrismaClient;

  beforeEach(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-v8-r4-daemon-'));
    const dbPath = path.join(tmpDir, 'daemon.db');
    execFileSync('npm', ['run', 'db:init:test', '--', dbPath], {
      cwd: repoRoot,
      encoding: 'utf8',
      env: { ...process.env, DATABASE_URL: undefined },
    });
    prisma = new PrismaClient({ datasources: { db: { url: `file:${dbPath}` } } });
  }, 30000);

  afterEach(async () => {
    await prisma.$disconnect();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test('tick executes claim/dispatch/ingest/review/closeout in order through V8 services and project scope', async () => {
    const projectId = 'project-r4-daemon';
    const otherProjectId = 'project-r4-other';
    await seedProject(prisma, projectId);
    await seedProject(prisma, otherProjectId);

    const group = await prisma.taskGroup.create({
      data: { project_id: projectId, group_id: 'r4-g1', name: 'R4 group', status: 'active' },
    });
    await prisma.agent.create({
      data: {
        id: 'agent-dev',
        agent_id: 'long-coder-1',
        project_id: projectId,
        endpoint: 'mock://long',
        lane: 'DEV',
        dialect: 'hermes',
        soul_prompt: '',
        tools_allowed: '[]',
        status: 'online',
      },
    });
    await prisma.agent.create({
      data: {
        id: 'agent-review',
        agent_id: 'shun-designer-1',
        project_id: projectId,
        endpoint: 'mock://shun',
        lane: 'REVIEW',
        dialect: 'hermes',
        soul_prompt: '',
        tools_allowed: '[]',
        status: 'online',
      },
    });

    await prisma.task.create({
      data: {
        id: 'task-r4-main',
        project_id: projectId,
        task_group_id: group.id,
        title: 'Implement daemon five steps',
        objective: 'Use V8 service/FSM path',
        lane_required: 'DEV',
        status: 'created',
        acceptance_mode: 'pm_audit',
        reviewer: 'shun-designer-1',
      },
    });
    await prisma.task.create({
      data: {
        id: 'task-other-project',
        project_id: otherProjectId,
        title: 'Do not touch',
        objective: 'Cross-project isolation sentinel',
        lane_required: 'DEV',
        status: 'created',
      },
    });

    const workerResults: any[] = [
      {
        project_id: projectId,
        task_id: 'task-r4-main',
        worker_run_id: 'worker-r4-main-1',
        summary: 'implementation proof ready',
        proof: { tests: ['focused daemon test'], result: 'passed' },
      },
    ];
    const observedSteps: string[] = [];
    const daemon = new V8DaemonTickLoop({
      prisma,
      project_id: projectId,
      workerClient: {
        dispatch: async (payload) => {
          observedSteps.push(`dispatch:${payload.task.id}:${payload.agent.agent_id}`);
          workerResults[0].lease_token = payload.lease.lease_token;
          return { worker_run_id: 'worker-r4-main-1' };
        },
        drainResults: async () => workerResults.splice(0),
      },
      stepObserver: (step) => observedSteps.push(`step:${step}`),
    });

    const result = await daemon.tick();

    expect(result.steps.map((step) => step.name)).toEqual(['claim', 'dispatch', 'ingest', 'review', 'closeout']);
    expect(observedSteps.filter((entry) => entry.startsWith('step:'))).toEqual([
      'step:claim',
      'step:dispatch',
      'step:ingest',
      'step:review',
      'step:closeout',
    ]);
    expect(observedSteps).toContain('dispatch:task-r4-main:long-coder-1');

    const dispatchReport = await prisma.report.findFirstOrThrow({
      where: { project_id: projectId, task_id: 'task-r4-main', message_type: 'agent_dispatch' },
    });
    expect(dispatchReport.status).toBe('sent');
    expect(dispatchReport.run_id).toBeTruthy();
    expect(JSON.parse(dispatchReport.payload_json)).toMatchObject({
      project_id: projectId,
      task_id: 'task-r4-main',
      endpoint: 'mock://long',
      agent_id: 'long-coder-1',
    });

    const dispatchArtifact = await prisma.artifact.findFirstOrThrow({
      where: { project_id: projectId, task_id: 'task-r4-main', artifact_type: 'worker_dispatch_proof' },
    });
    expect(dispatchArtifact.run_id).toBe(dispatchReport.run_id);
    expect(JSON.parse(dispatchArtifact.payload_data || '{}')).toMatchObject({
      project_id: projectId,
      task_id: 'task-r4-main',
      endpoint: 'mock://long',
      worker_run_id: 'worker-r4-main-1',
    });

    const mainTask = await prisma.task.findFirstOrThrow({ where: { id: 'task-r4-main', project_id: projectId } });
    expect(mainTask.status).toBe('review_pending');
    expect(JSON.parse(mainTask.proof_data || '{}')).toMatchObject({ event: 'request_review', project_id: projectId });

    const run = await prisma.run.findFirstOrThrow({ where: { project_id: projectId, task_id: 'task-r4-main' } });
    expect(run.status).toBe('success');
    expect(run.agent_id).toBe('agent-dev');
    expect(run.worker_run_id).toBe('worker-r4-main-1');

    const completionReport = await prisma.report.findFirstOrThrow({
      where: { project_id: projectId, task_id: 'task-r4-main', message_type: 'agent_result' },
    });
    expect(completionReport.status).toBe('pending');
    expect(JSON.parse(completionReport.payload_json)).toMatchObject({ project_id: projectId, task_id: 'task-r4-main' });

    const review = await prisma.review.findFirstOrThrow({ where: { project_id: projectId, original_task_id: 'task-r4-main' } });
    expect(review.status).toBe('created');
    expect(review.reviewer_agent_id).toBe('shun-designer-1');
    expect(review.review_task_id).toBeTruthy();

    const reviewTask = await prisma.task.findFirstOrThrow({ where: { id: review.review_task_id!, project_id: projectId } });
    expect(reviewTask.status).toBe('created');
    expect(reviewTask.lane_required).toBe('REVIEW');

    const otherTask = await prisma.task.findFirstOrThrow({ where: { id: 'task-other-project', project_id: otherProjectId } });
    expect(otherTask.status).toBe('created');
  });

  test('default OpenAI-compatible worker client posts dispatch to registered endpoint and records proof', async () => {
    const projectId = 'project-r4-openai-dispatch';
    await seedProject(prisma, projectId);
    await prisma.agent.create({
      data: {
        id: 'agent-openai-dev',
        agent_id: 'long-coder-1',
        project_id: projectId,
        endpoint: 'https://worker.example/v1/chat/completions',
        lane: 'DEV',
        dialect: 'gpt-4o-compatible',
        soul_prompt: 'You are Long.',
        tools_allowed: '[]',
        status: 'online',
      },
    });
    await prisma.task.create({
      data: {
        id: 'task-openai-dispatch',
        project_id: projectId,
        title: 'Dispatch through OpenAI-compatible endpoint',
        objective: 'Call registered endpoint and capture run proof',
        lane_required: 'DEV',
        status: 'created',
        acceptance_mode: 'standard',
      },
    });

    const calls: any[] = [];
    const daemon = new V8DaemonTickLoop({
      prisma,
      project_id: projectId,
      workerFetch: async (url, init) => {
        calls.push({ url, init, body: JSON.parse(String(init?.body)) });
        return {
          ok: true,
          status: 200,
          json: async () => ({ id: 'chatcmpl-openai-worker-run-1' }),
          text: async () => '',
        };
      },
    });

    const result = await daemon.tick();

    expect(result.dispatched_task_ids).toEqual(['task-openai-dispatch']);
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe('https://worker.example/v1/chat/completions');
    expect(calls[0].body).toMatchObject({
      model: 'gpt-4o-compatible',
      metadata: { project_id: projectId, task_id: 'task-openai-dispatch', agent_id: 'long-coder-1' },
    });
    expect(calls[0].body.messages[1].content).toContain('task-openai-dispatch');

    const run = await prisma.run.findFirstOrThrow({ where: { project_id: projectId, task_id: 'task-openai-dispatch' } });
    expect(run.status).toBe('running');
    expect(run.worker_run_id).toBe('chatcmpl-openai-worker-run-1');
    expect(run.result_summary).toContain('lease_token');

    const dispatchReport = await prisma.report.findFirstOrThrow({
      where: { project_id: projectId, task_id: 'task-openai-dispatch', message_type: 'agent_dispatch' },
    });
    expect(dispatchReport.status).toBe('sent');
    expect(JSON.parse(dispatchReport.payload_json)).toMatchObject({
      endpoint: 'https://worker.example/v1/chat/completions',
      worker_run_id: 'chatcmpl-openai-worker-run-1',
    });

    const dispatchArtifact = await prisma.artifact.findFirstOrThrow({
      where: { project_id: projectId, task_id: 'task-openai-dispatch', artifact_type: 'worker_dispatch_proof' },
    });
    expect(dispatchArtifact.run_id).toBe(run.run_id);
    expect(JSON.parse(dispatchArtifact.payload_data || '{}')).toMatchObject({
      run_id: run.run_id,
      endpoint: 'https://worker.example/v1/chat/completions',
      worker_run_id: 'chatcmpl-openai-worker-run-1',
    });
  });

  test('closeout archives completed project group and writes sent group summary without touching other projects', async () => {
    const projectId = 'project-r4-closeout';
    const otherProjectId = 'project-r4-closeout-other';
    await seedProject(prisma, projectId);
    await seedProject(prisma, otherProjectId);

    const group = await prisma.taskGroup.create({
      data: { project_id: projectId, group_id: 'r4-closeout', name: 'Closeout group', status: 'active' },
    });
    const otherGroup = await prisma.taskGroup.create({
      data: { project_id: otherProjectId, group_id: 'r4-closeout', name: 'Other group', status: 'active' },
    });
    await prisma.task.create({
      data: {
        id: 'task-completed-a',
        project_id: projectId,
        task_group_id: group.id,
        title: 'Done A',
        objective: 'A',
        lane_required: 'DEV',
        status: 'completed',
      },
    });
    await prisma.task.create({
      data: {
        id: 'task-other-active',
        project_id: otherProjectId,
        task_group_id: otherGroup.id,
        title: 'Other active',
        objective: 'Other',
        lane_required: 'DEV',
        status: 'created',
      },
    });

    const daemon = new V8DaemonTickLoop({ prisma, project_id: projectId });
    const result = await daemon.tick();

    expect(result.closeout.archived_group_ids).toEqual(['r4-closeout']);
    const archived = await prisma.taskGroup.findFirstOrThrow({ where: { id: group.id, project_id: projectId } });
    expect(archived.status).toBe('archived');
    expect(JSON.parse(archived.ext_meta || '{}')).toMatchObject({ closeout_source: 'v8_daemon_tick_loop', completed: 1 });

    const summary = await prisma.report.findFirstOrThrow({
      where: { project_id: projectId, message_type: 'group_summary', status: 'sent' },
    });
    expect(JSON.parse(summary.payload_json)).toMatchObject({ project_id: projectId, group_id: 'r4-closeout', completed: 1 });

    const untouched = await prisma.taskGroup.findFirstOrThrow({ where: { id: otherGroup.id, project_id: otherProjectId } });
    expect(untouched.status).toBe('active');
  });

  test('stale takeover fails old run, reclaims task through FSM, and dispatch uses a fresh lease', async () => {
    const projectId = 'project-r4-stale-takeover';
    await seedProject(prisma, projectId);
    const group = await prisma.taskGroup.create({
      data: { project_id: projectId, group_id: 'r4-stale', name: 'Stale group', status: 'active' },
    });
    await prisma.agent.create({
      data: {
        id: 'agent-dev-stale',
        agent_id: 'long-coder-1',
        project_id: projectId,
        endpoint: 'mock://long-stale',
        lane: 'DEV',
        dialect: 'hermes',
        soul_prompt: '',
        tools_allowed: '[]',
        status: 'online',
      },
    });
    await prisma.task.create({
      data: {
        id: 'task-stale-run',
        project_id: projectId,
        task_group_id: group.id,
        title: 'Recover stale run',
        objective: 'Avoid zombie run duplicate dispatch',
        lane_required: 'DEV',
        status: 'running',
        acceptance_mode: 'standard',
      },
    });
    await prisma.run.create({
      data: {
        run_id: 'run-stale-old',
        project_id: projectId,
        task_id: 'task-stale-run',
        agent_id: 'agent-dev-stale',
        worker_run_id: 'worker-stale-old',
        idempotency_key: 'project-r4-stale-takeover:task-stale-run:old',
        status: 'running',
        started_at: new Date(Date.now() - 60 * 60 * 1000),
      },
    });

    const dispatchedPayloads: any[] = [];
    const daemon = new V8DaemonTickLoop({
      prisma,
      project_id: projectId,
      leaseTtlMs: 5 * 60 * 1000,
      now: () => new Date(),
      workerClient: {
        dispatch: async (payload) => {
          dispatchedPayloads.push(payload);
          return { worker_run_id: 'worker-stale-fresh' };
        },
        drainResults: async () => [],
      },
    });

    const result = await daemon.tick();

    expect(result.recovered_stale_task_ids).toEqual(['task-stale-run']);
    expect(result.claimed_task_ids).toEqual([]);
    expect(result.dispatched_task_ids).toEqual([]);
    expect(dispatchedPayloads).toHaveLength(0);

    const oldRun = await prisma.run.findFirstOrThrow({ where: { project_id: projectId, run_id: 'run-stale-old' } });
    expect(oldRun.status).toBe('error');
    expect(oldRun.error_stack).toContain('timeout_recovery');
    expect(oldRun.ended_at).toBeTruthy();

    const freshRun = await prisma.run.findFirst({ where: { project_id: projectId, worker_run_id: 'worker-stale-fresh' } });
    expect(freshRun).toBeNull();

    const task = await prisma.task.findFirstOrThrow({ where: { project_id: projectId, id: 'task-stale-run' } });
    expect(task.status).toBe('retry_ready');
    expect(task.retry_count).toBe(1);
    expect(JSON.parse(task.ext_meta || '{}')).toMatchObject({ stale_takeover: { previous_run_id: 'run-stale-old', outcome: 'retry_ready' } });
  });

  test('worker result ingest rejects stale lease result after takeover and accepts only active lease', async () => {
    const projectId = 'project-r4-lease-ingest';
    await seedProject(prisma, projectId);
    await prisma.agent.create({
      data: {
        id: 'agent-dev-lease',
        agent_id: 'long-coder-1',
        project_id: projectId,
        endpoint: 'mock://long-lease',
        lane: 'DEV',
        dialect: 'hermes',
        soul_prompt: '',
        tools_allowed: '[]',
        status: 'online',
      },
    });
    await prisma.task.create({
      data: {
        id: 'task-lease-active',
        project_id: projectId,
        title: 'Lease active result only',
        objective: 'Reject zombie stale result',
        lane_required: 'DEV',
        status: 'running',
        acceptance_mode: 'standard',
      },
    });
    await prisma.run.create({
      data: {
        run_id: 'run-active-lease',
        project_id: projectId,
        task_id: 'task-lease-active',
        agent_id: 'agent-dev-lease',
        worker_run_id: 'worker-active-lease',
        idempotency_key: 'project-r4-lease-ingest:task-lease-active:active',
        status: 'running',
        result_summary: JSON.stringify({ lease_token: 'lease-active-token' }),
      },
    });

    const daemon = new V8DaemonTickLoop({
      prisma,
      project_id: projectId,
      workerClient: {
        dispatch: async () => undefined,
        drainResults: async () => [
          { project_id: projectId, task_id: 'task-lease-active', worker_run_id: 'worker-old-zombie', lease_token: 'old-token', summary: 'zombie', proof: { stale: true } },
          { project_id: projectId, task_id: 'task-lease-active', worker_run_id: 'worker-active-lease', lease_token: 'lease-active-token', summary: 'fresh', proof: { ok: true } },
        ],
      },
    });

    const result = await daemon.tick();

    expect(result.steps.find((step) => step.name === 'ingest')?.details).toContain('ignored-stale-lease:task-lease-active');
    expect(result.ingested_task_ids).toEqual(['task-lease-active']);
    const task = await prisma.task.findFirstOrThrow({ where: { project_id: projectId, id: 'task-lease-active' } });
    expect(task.status).toBe('completed');
    const run = await prisma.run.findFirstOrThrow({ where: { project_id: projectId, run_id: 'run-active-lease' } });
    expect(run.status).toBe('success');
    expect(run.worker_run_id).toBe('worker-active-lease');
    const report = await prisma.report.findFirstOrThrow({ where: { project_id: projectId, task_id: 'task-lease-active', message_type: 'agent_result' } });
    expect(JSON.parse(report.payload_json)).toMatchObject({ lease_token: 'lease-active-token' });
  });

  test('worker result ingest is exactly-once for duplicate active lease results', async () => {
    const projectId = 'project-r4-result-once';
    await seedProject(prisma, projectId);
    await prisma.agent.create({
      data: {
        id: 'agent-dev-result-once',
        agent_id: 'long-coder-1',
        project_id: projectId,
        endpoint: 'mock://long-result-once',
        lane: 'DEV',
        dialect: 'hermes',
        soul_prompt: '',
        tools_allowed: '[]',
        status: 'online',
      },
    });
    await prisma.task.create({
      data: {
        id: 'task-result-once',
        project_id: projectId,
        title: 'Result ingest exactly once',
        objective: 'Duplicate worker completions must not duplicate closeout side effects',
        lane_required: 'DEV',
        status: 'running',
        acceptance_mode: 'standard',
      },
    });
    await prisma.run.create({
      data: {
        run_id: 'run-result-once',
        project_id: projectId,
        task_id: 'task-result-once',
        agent_id: 'agent-dev-result-once',
        worker_run_id: 'worker-result-once',
        idempotency_key: 'project-r4-result-once:task-result-once:active',
        status: 'running',
        result_summary: JSON.stringify({ lease_token: 'lease-result-once' }),
      },
    });

    const duplicateResult = {
      project_id: projectId,
      task_id: 'task-result-once',
      worker_run_id: 'worker-result-once',
      lease_token: 'lease-result-once',
      summary: 'proof ready once',
      proof: { tests: ['exactly-once'], result: 'passed' },
    };
    const firstDaemon = new V8DaemonTickLoop({
      prisma,
      project_id: projectId,
      workerClient: {
        dispatch: async () => undefined,
        drainResults: async () => [duplicateResult, duplicateResult],
      },
    });
    const firstTick = await firstDaemon.tick();

    expect(firstTick.ingested_task_ids).toEqual(['task-result-once']);
    expect(firstTick.steps.find((step) => step.name === 'ingest')?.details.filter((detail) => detail === 'ingested:task-result-once')).toHaveLength(1);

    const replayDaemon = new V8DaemonTickLoop({
      prisma,
      project_id: projectId,
      workerClient: {
        dispatch: async () => undefined,
        drainResults: async () => [duplicateResult],
      },
    });
    const replayTick = await replayDaemon.tick();

    expect(replayTick.ingested_task_ids).toEqual([]);
    const task = await prisma.task.findFirstOrThrow({ where: { project_id: projectId, id: 'task-result-once' } });
    expect(task.status).toBe('completed');
    const run = await prisma.run.findFirstOrThrow({ where: { project_id: projectId, run_id: 'run-result-once' } });
    expect(run.status).toBe('success');
    const reports = await prisma.report.findMany({ where: { project_id: projectId, task_id: 'task-result-once', message_type: 'agent_result' } });
    expect(reports).toHaveLength(1);
    const artifacts = await prisma.artifact.findMany({ where: { project_id: projectId, task_id: 'task-result-once', run_id: 'run-result-once', artifact_type: 'worker_result_ingest' } });
    expect(artifacts).toHaveLength(1);
    expect(JSON.parse(artifacts[0].payload_data || '{}')).toMatchObject({
      project_id: projectId,
      task_id: 'task-result-once',
      run_id: 'run-result-once',
      worker_run_id: 'worker-result-once',
      idempotency_key: 'project-r4-result-once:run-result-once:worker-result-once:lease-result-once',
    });
  });

  test('timeout recovery moves retries-remaining timeout to retry_ready for next tick', async () => {
    const projectId = 'project-r4-timeout-retry-ready';
    await seedProject(prisma, projectId);
    await prisma.agent.create({
      data: {
        id: 'agent-dev-timeout-retry-ready',
        agent_id: 'long-coder-1',
        project_id: projectId,
        endpoint: 'mock://long-timeout-retry-ready',
        lane: 'DEV',
        dialect: 'hermes',
        soul_prompt: '',
        tools_allowed: '[]',
        status: 'online',
      },
    });
    await prisma.task.create({
      data: {
        id: 'task-timeout-retry-ready',
        project_id: projectId,
        title: 'Timeout retry ready',
        objective: 'Timeout should pause in retry_ready before the next dispatch tick',
        lane_required: 'DEV',
        status: 'running',
        max_retries: 2,
        retry_count: 1,
      },
    });
    await prisma.run.create({
      data: {
        run_id: 'run-timeout-retry-old',
        project_id: projectId,
        task_id: 'task-timeout-retry-ready',
        agent_id: 'agent-dev-timeout-retry-ready',
        worker_run_id: 'worker-timeout-retry-old',
        idempotency_key: 'project-r4-timeout-retry-ready:task-timeout-retry-ready:old',
        status: 'running',
        started_at: new Date(Date.now() - 60 * 60 * 1000),
        result_summary: JSON.stringify({ lease_token: 'timeout-retry-old-token' }),
      },
    });

    const dispatch = jest.fn();
    const daemon = new V8DaemonTickLoop({
      prisma,
      project_id: projectId,
      staleRunMs: 30 * 60 * 1000,
      now: () => new Date(),
      workerClient: { dispatch, drainResults: async () => [] },
    });

    const result = await daemon.tick();

    expect(result.recovered_stale_task_ids).toEqual(['task-timeout-retry-ready']);
    expect(result.claimed_task_ids).toEqual([]);
    expect(result.dispatched_task_ids).toEqual([]);
    expect(dispatch).not.toHaveBeenCalled();
    const oldRun = await prisma.run.findFirstOrThrow({ where: { project_id: projectId, run_id: 'run-timeout-retry-old' } });
    expect(oldRun.status).toBe('error');
    expect(oldRun.error_stack).toContain('timeout_recovery');
    const task = await prisma.task.findFirstOrThrow({ where: { project_id: projectId, id: 'task-timeout-retry-ready' } });
    expect(task.status).toBe('retry_ready');
    expect(task.retry_count).toBe(2);
    expect(JSON.parse(task.ext_meta || '{}')).toMatchObject({
      timeout_recovery: { previous_run_id: 'run-timeout-retry-old', outcome: 'retry_ready', retry_count: 2, max_retries: 2 },
    });
    expect(JSON.parse(task.proof_data || '{}')).toMatchObject({ event: 'retry', project_id: projectId });

    dispatch.mockResolvedValueOnce({ worker_run_id: 'worker-timeout-retry-fresh' });
    const retryDispatchTick = await daemon.tick();
    expect(retryDispatchTick.claimed_task_ids).toEqual(['task-timeout-retry-ready']);
    expect(retryDispatchTick.dispatched_task_ids).toEqual(['task-timeout-retry-ready']);
    const freshRun = await prisma.run.findFirstOrThrow({ where: { project_id: projectId, worker_run_id: 'worker-timeout-retry-fresh' } });
    expect(freshRun.status).toBe('running');
    const retriedTask = await prisma.task.findFirstOrThrow({ where: { project_id: projectId, id: 'task-timeout-retry-ready' } });
    expect(retriedTask.status).toBe('running');
  });

  test('timeout recovery sends exhausted retries to dead_letter without redispatch', async () => {
    const projectId = 'project-r4-timeout-dead-letter';
    await seedProject(prisma, projectId);
    await prisma.agent.create({
      data: {
        id: 'agent-dev-timeout-dead-letter',
        agent_id: 'long-coder-1',
        project_id: projectId,
        endpoint: 'mock://long-timeout-dead-letter',
        lane: 'DEV',
        dialect: 'hermes',
        soul_prompt: '',
        tools_allowed: '[]',
        status: 'online',
      },
    });
    await prisma.task.create({
      data: {
        id: 'task-timeout-dead-letter',
        project_id: projectId,
        title: 'Timeout exhausted retries',
        objective: 'Timeout should become dead_letter after retry budget is exhausted',
        lane_required: 'DEV',
        status: 'running',
        max_retries: 2,
        retry_count: 2,
      },
    });
    await prisma.run.create({
      data: {
        run_id: 'run-timeout-exhausted',
        project_id: projectId,
        task_id: 'task-timeout-dead-letter',
        agent_id: 'agent-dev-timeout-dead-letter',
        worker_run_id: 'worker-timeout-exhausted',
        idempotency_key: 'project-r4-timeout-dead-letter:task-timeout-dead-letter:old',
        status: 'running',
        started_at: new Date(Date.now() - 60 * 60 * 1000),
        result_summary: JSON.stringify({ lease_token: 'timeout-exhausted-token' }),
      },
    });

    const dispatch = jest.fn();
    const daemon = new V8DaemonTickLoop({
      prisma,
      project_id: projectId,
      staleRunMs: 30 * 60 * 1000,
      now: () => new Date(),
      workerClient: { dispatch, drainResults: async () => [] },
    });

    const result = await daemon.tick();

    expect(result.recovered_stale_task_ids).toEqual(['task-timeout-dead-letter']);
    expect(result.claimed_task_ids).toEqual([]);
    expect(result.dispatched_task_ids).toEqual([]);
    expect(dispatch).not.toHaveBeenCalled();
    const oldRun = await prisma.run.findFirstOrThrow({ where: { project_id: projectId, run_id: 'run-timeout-exhausted' } });
    expect(oldRun.status).toBe('error');
    expect(oldRun.error_stack).toContain('timeout_recovery');
    const task = await prisma.task.findFirstOrThrow({ where: { project_id: projectId, id: 'task-timeout-dead-letter' } });
    expect(task.status).toBe('dead_letter');
    expect(task.retry_count).toBe(2);
    expect(JSON.parse(task.ext_meta || '{}')).toMatchObject({
      timeout_recovery: { previous_run_id: 'run-timeout-exhausted', outcome: 'dead_letter', retry_count: 2, max_retries: 2 },
    });
    expect(JSON.parse(task.proof_data || '{}')).toMatchObject({ event: 'dead_letter', project_id: projectId });
  });

  test('expired active lease prevents duplicate dispatch until stale takeover threshold is reached', async () => {
    const projectId = 'project-r4-lease-expired';
    await seedProject(prisma, projectId);
    await prisma.agent.create({
      data: {
        id: 'agent-dev-expired',
        agent_id: 'long-coder-1',
        project_id: projectId,
        endpoint: 'mock://long-expired',
        lane: 'DEV',
        dialect: 'hermes',
        soul_prompt: '',
        tools_allowed: '[]',
        status: 'online',
      },
    });
    await prisma.task.create({
      data: {
        id: 'task-expired-lease',
        project_id: projectId,
        title: 'Expired lease not stale yet',
        objective: 'Avoid duplicate dispatch while old run is still active',
        lane_required: 'DEV',
        status: 'running',
      },
    });
    await prisma.run.create({
      data: {
        run_id: 'run-expired-not-stale',
        project_id: projectId,
        task_id: 'task-expired-lease',
        agent_id: 'agent-dev-expired',
        worker_run_id: 'worker-expired',
        idempotency_key: 'project-r4-lease-expired:task-expired-lease:active',
        status: 'running',
        result_summary: JSON.stringify({ lease_token: 'expired-token', lease_expires_at: new Date(Date.now() - 1000).toISOString() }),
        started_at: new Date(Date.now() - 2 * 60 * 1000),
      },
    });

    const dispatch = jest.fn();
    const daemon = new V8DaemonTickLoop({
      prisma,
      project_id: projectId,
      leaseTtlMs: 60 * 1000,
      now: () => new Date(),
      workerClient: { dispatch, drainResults: async () => [] },
    });

    const result = await daemon.tick();

    expect(result.recovered_stale_task_ids).toEqual([]);
    expect(result.dispatched_task_ids).toEqual([]);
    expect(dispatch).not.toHaveBeenCalled();
    const task = await prisma.task.findFirstOrThrow({ where: { project_id: projectId, id: 'task-expired-lease' } });
    expect(task.status).toBe('running');
  });

  test('non-pm_audit completion uses FSM transition boundary instead of direct completed writes', async () => {
    const projectId = 'project-r5-non-pm-audit-boundary';
    await seedProject(prisma, projectId);
    await prisma.agent.create({
      data: {
        id: 'agent-dev-r5-standard',
        agent_id: 'long-coder-1',
        project_id: projectId,
        endpoint: 'mock://long-r5-standard',
        lane: 'DEV',
        dialect: 'hermes',
        soul_prompt: '',
        tools_allowed: '[]',
        status: 'online',
      },
    });
    await prisma.task.create({
      data: {
        id: 'task-r5-standard-boundary',
        project_id: projectId,
        title: 'Standard close through FSM boundary',
        objective: 'non-pm_audit must not be completed by daemon direct Prisma status write',
        lane_required: 'DEV',
        status: 'running',
        acceptance_mode: 'standard',
      },
    });
    await prisma.run.create({
      data: {
        run_id: 'run-r5-standard-boundary',
        project_id: projectId,
        task_id: 'task-r5-standard-boundary',
        agent_id: 'agent-dev-r5-standard',
        worker_run_id: 'worker-r5-standard-boundary',
        idempotency_key: 'project-r5-non-pm-audit-boundary:task-r5-standard-boundary:active',
        status: 'running',
        result_summary: JSON.stringify({ lease_token: 'lease-r5-standard-boundary' }),
      },
    });

    const daemon = new V8DaemonTickLoop({
      prisma,
      project_id: projectId,
      workerClient: {
        dispatch: async () => undefined,
        drainResults: async () => [{
          project_id: projectId,
          task_id: 'task-r5-standard-boundary',
          worker_run_id: 'worker-r5-standard-boundary',
          lease_token: 'lease-r5-standard-boundary',
          summary: 'standard proof ready',
          proof: { tests: ['r5-boundary'], result: 'passed' },
        }],
      },
    });

    const result = await daemon.tick();

    expect(result.ingested_task_ids).toEqual(['task-r5-standard-boundary']);
    expect(result.steps.find((step) => step.name === 'review')?.details).toContain('auto-completed:task-r5-standard-boundary');
    const task = await prisma.task.findFirstOrThrow({ where: { project_id: projectId, id: 'task-r5-standard-boundary' } });
    expect(task.status).toBe('completed');
    const audit = JSON.parse(task.proof_data || '{}');
    expect(audit).toMatchObject({
      event: 'review_pass',
      from_status: 'review_pending',
      to_status: 'completed',
      project_id: projectId,
      task_id: 'task-r5-standard-boundary',
      proof: {
        source: 'v8_daemon_tick_loop',
        step: 'review',
        transition_boundary: 'v8_transition_task_service',
        reason: 'non_pm_audit_auto_complete_boundary',
      },
    });
    const transitionAudits = await prisma.artifact.findMany({
      where: { project_id: projectId, task_id: 'task-r5-standard-boundary', artifact_type: 'task_transition_audit' },
      orderBy: { created_at: 'asc' },
    });
    expect(transitionAudits.map((artifact) => JSON.parse(artifact.payload_data || '{}').event)).toEqual([
      'submit_completion',
      'request_review',
      'review_pass',
    ]);
    expect(await prisma.review.count({ where: { project_id: projectId, original_task_id: 'task-r5-standard-boundary' } })).toBe(0);
  });

  test('daemon source is V8-only: no legacy DAL/ignored DB/raw SQL and completed writes use transitionTask boundary', () => {
    const source = fs.readFileSync(path.join(repoRoot, 'src/daemon/v8_tick_loop.ts'), 'utf8');
    expect(source).toContain('transitionTask(');
    expect(source).toContain('V8RuntimeApiService');
    expect(source).not.toMatch(/\.\.\/db\/dal|better-sqlite3|sqlite3|data\/nexus\.db|prisma\/data\/nexus\.db|\$queryRaw|\$executeRaw/i);
    expect(source).toContain('archiveTaskGroup(');
    expect(source).not.toMatch(/prisma\.task\.(update|updateMany)\([\s\S]*status\s*:\s*['"]completed['"]/);
    expect(source).not.toMatch(/taskTable\.updateMany\([\s\S]*status\s*:\s*['"]completed['"]/);
    expect(source).not.toMatch(/data:\s*\{[\s\S]*status\s*:\s*['"]completed['"][\s\S]*\}\s*\}\);/);
    expect(source).not.toMatch(/prisma\.taskGroup\.(update|updateMany)\([\s\S]*status\s*:/);
  });
});
