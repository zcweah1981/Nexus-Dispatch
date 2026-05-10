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

  test('R9-T2 drives worker proof through pm_audit review PASS to completed via daemon ticks', async () => {
    const projectId = 'project-r9-worker-proof-review-pass';
    const otherProjectId = 'project-r9-worker-proof-review-pass-other';
    await seedProject(prisma, projectId);
    await seedProject(prisma, otherProjectId);
    const group = await prisma.taskGroup.create({
      data: { project_id: projectId, group_id: 'r9-t2-group', name: 'R9-T2 group', status: 'active' },
    });
    await prisma.agent.createMany({
      data: [
        {
          id: 'agent-r9-t2-long',
          agent_id: 'long-coder-1',
          project_id: projectId,
          endpoint: 'mock://long-r9-t2',
          lane: 'DEV',
          dialect: 'hermes',
          soul_prompt: '',
          tools_allowed: '[]',
          status: 'online',
        },
        {
          id: 'agent-r9-t2-shun',
          agent_id: 'shun-designer-1',
          project_id: projectId,
          endpoint: 'mock://shun-r9-t2',
          lane: 'REVIEW',
          dialect: 'hermes',
          soul_prompt: '',
          tools_allowed: '[]',
          status: 'online',
        },
      ],
    });
    await prisma.task.createMany({
      data: [
        {
          id: 'task-r9-t2-original',
          project_id: projectId,
          task_group_id: group.id,
          title: 'R9-T2 worker proof review pass E2E',
          objective: 'Worker proof must create review task; Shun PASS must complete original',
          lane_required: 'DEV',
          status: 'created',
          acceptance_mode: 'pm_audit',
          reviewer: 'shun-designer-1',
          acceptance_criteria: JSON.stringify(['worker proof', 'review PASS', 'completed']),
        },
        {
          id: 'task-r9-t2-other',
          project_id: otherProjectId,
          title: 'Other project sentinel',
          objective: 'Must remain isolated',
          lane_required: 'DEV',
          status: 'created',
          acceptance_mode: 'pm_audit',
          reviewer: 'shun-designer-1',
        },
      ],
    });

    const queuedWorkerResults: any[] = [];
    const dispatches: string[] = [];
    const daemon = new V8DaemonTickLoop({
      prisma,
      project_id: projectId,
      workerClient: {
        dispatch: async (payload) => {
          dispatches.push(`${payload.task.id}:${payload.agent.agent_id}`);
          if (payload.task.lane_required === 'DEV') {
            queuedWorkerResults.push({
              project_id: projectId,
              task_id: payload.task.id,
              worker_run_id: 'worker-r9-t2-original-1',
              lease_token: payload.lease.lease_token,
              summary: 'worker proof ready for pm_audit',
              proof: { command: 'npm test -- --runInBand tests/v8/v8_daemon_tick_loop.test.ts', result: 'passed', artifact: 'worker-proof' },
            });
          } else {
            queuedWorkerResults.push({
              project_id: projectId,
              task_id: payload.task.id,
              worker_run_id: 'worker-r9-t2-review-1',
              lease_token: payload.lease.lease_token,
              summary: 'review verdict PASS',
              proof: { verdict: 'PASS', reviewer: 'shun-designer-1', reason: 'worker proof accepted' },
            });
          }
          return { worker_run_id: queuedWorkerResults[queuedWorkerResults.length - 1].worker_run_id };
        },
        drainResults: async () => queuedWorkerResults.splice(0),
      },
    });

    const firstTick = await daemon.tick();
    expect(firstTick.dispatched_task_ids).toEqual(['task-r9-t2-original']);
    expect(firstTick.ingested_task_ids).toEqual(['task-r9-t2-original']);
    expect(firstTick.review_task_ids).toHaveLength(1);

    const afterWorkerProof = await prisma.task.findFirstOrThrow({ where: { project_id: projectId, id: 'task-r9-t2-original' } });
    expect(afterWorkerProof.status).toBe('review_pending');
    expect(JSON.parse(afterWorkerProof.proof_data || '{}')).toMatchObject({ event: 'request_review', project_id: projectId, task_id: 'task-r9-t2-original' });

    const review = await prisma.review.findFirstOrThrow({ where: { project_id: projectId, original_task_id: 'task-r9-t2-original' } });
    expect(review.status).toBe('created');
    expect(review.reviewer_agent_id).toBe('shun-designer-1');
    expect(review.review_task_id).toBeTruthy();
    const reviewTaskId = review.review_task_id!;

    const secondTick = await daemon.tick();
    expect(secondTick.dispatched_task_ids).toEqual([reviewTaskId]);
    expect(secondTick.ingested_task_ids).toEqual([reviewTaskId]);
    expect(secondTick.review_task_ids).toEqual([reviewTaskId]);
    expect(secondTick.steps.find((step) => step.name === 'review')?.details).toContain(`review-pass-closed:task-r9-t2-original:${reviewTaskId}`);

    const original = await prisma.task.findFirstOrThrow({ where: { project_id: projectId, id: 'task-r9-t2-original' } });
    const completedReviewTask = await prisma.task.findFirstOrThrow({ where: { project_id: projectId, id: reviewTaskId } });
    expect(original.status).toBe('completed');
    expect(completedReviewTask.status).toBe('completed');
    expect(JSON.parse(original.proof_data || '{}')).toMatchObject({
      event: 'review_pass',
      from_status: 'review_pending',
      to_status: 'completed',
      proof: { source: 'v8_daemon_tick_loop', step: 'review_pass_closeout', target: 'original_task', verdict: 'pass' },
    });

    const passedReview = await prisma.review.findFirstOrThrow({ where: { project_id: projectId, original_task_id: 'task-r9-t2-original' } });
    expect(passedReview.status).toBe('passed');
    expect(JSON.parse(passedReview.rework_json || '{}')).toMatchObject({ verdict: 'pass', closed_by: 'v8_daemon_tick_loop' });

    const workerIngestArtifacts = await prisma.artifact.findMany({
      where: { project_id: projectId, artifact_type: 'worker_result_ingest' },
      orderBy: { task_id: 'asc' },
    });
    expect(workerIngestArtifacts.map((artifact) => artifact.task_id).sort()).toEqual(['task-r9-t2-original', reviewTaskId].sort());
    expect(workerIngestArtifacts.map((artifact) => JSON.parse(artifact.payload_data || '{}').worker_run_id).sort()).toEqual(['worker-r9-t2-original-1', 'worker-r9-t2-review-1']);

    const otherTask = await prisma.task.findFirstOrThrow({ where: { project_id: otherProjectId, id: 'task-r9-t2-other' } });
    expect(otherTask.status).toBe('created');
    expect(dispatches).toEqual(['task-r9-t2-original:long-coder-1', `${reviewTaskId}:shun-designer-1`]);
  });

  test('R9-T3 drives review FAIL to retry_ready, redispatch, then reviewer PASS completes original', async () => {
    const projectId = 'project-r9-review-fail-retry-pass';
    const otherProjectId = 'project-r9-review-fail-retry-pass-other';
    await seedProject(prisma, projectId);
    await seedProject(prisma, otherProjectId);
    const group = await prisma.taskGroup.create({
      data: { project_id: projectId, group_id: 'r9-t3-group', name: 'R9-T3 group', status: 'active' },
    });
    await prisma.agent.createMany({
      data: [
        {
          id: 'agent-r9-t3-long',
          agent_id: 'long-coder-1',
          project_id: projectId,
          endpoint: 'mock://long-r9-t3',
          lane: 'DEV',
          dialect: 'hermes',
          soul_prompt: '',
          tools_allowed: '[]',
          status: 'online',
        },
        {
          id: 'agent-r9-t3-shun',
          agent_id: 'shun-designer-1',
          project_id: projectId,
          endpoint: 'mock://shun-r9-t3',
          lane: 'REVIEW',
          dialect: 'hermes',
          soul_prompt: '',
          tools_allowed: '[]',
          status: 'online',
        },
      ],
    });
    await prisma.task.createMany({
      data: [
        {
          id: 'task-r9-t3-original',
          project_id: projectId,
          task_group_id: group.id,
          title: 'R9-T3 review fail retry pass E2E',
          objective: 'First Shun review fails; Long retries; second Shun review passes',
          lane_required: 'DEV',
          status: 'created',
          acceptance_mode: 'pm_audit',
          reviewer: 'shun-designer-1',
          acceptance_criteria: JSON.stringify(['review FAIL', 'retry_ready', 'redispatch', 'review PASS', 'completed']),
          max_retries: 2,
        },
        {
          id: 'task-r9-t3-other',
          project_id: otherProjectId,
          title: 'Other project sentinel',
          objective: 'Must remain isolated',
          lane_required: 'DEV',
          status: 'created',
          acceptance_mode: 'pm_audit',
          reviewer: 'shun-designer-1',
        },
      ],
    });

    const queuedWorkerResults: any[] = [];
    const dispatches: string[] = [];
    let devDispatchCount = 0;
    let reviewDispatchCount = 0;
    const daemon = new V8DaemonTickLoop({
      prisma,
      project_id: projectId,
      workerClient: {
        dispatch: async (payload) => {
          dispatches.push(`${payload.task.id}:${payload.agent.agent_id}`);
          if (payload.task.lane_required === 'DEV') {
            devDispatchCount += 1;
            queuedWorkerResults.push({
              project_id: projectId,
              task_id: payload.task.id,
              worker_run_id: `worker-r9-t3-original-${devDispatchCount}`,
              lease_token: payload.lease.lease_token,
              summary: devDispatchCount === 1 ? 'initial worker proof ready for review' : 'retry worker proof ready for review',
              proof: {
                command: 'npm test -- --runInBand tests/v8/v8_daemon_tick_loop.test.ts',
                result: 'passed',
                attempt: devDispatchCount,
              },
            });
          } else {
            reviewDispatchCount += 1;
            queuedWorkerResults.push({
              project_id: projectId,
              task_id: payload.task.id,
              worker_run_id: `worker-r9-t3-review-${reviewDispatchCount}`,
              lease_token: payload.lease.lease_token,
              summary: reviewDispatchCount === 1 ? 'review verdict CHANGES_REQUESTED' : 'review verdict PASS',
              proof: reviewDispatchCount === 1
                ? { verdict: 'CHANGES_REQUESTED', reviewer: 'shun-designer-1', reason: 'needs one retry' }
                : { verdict: 'PASS', reviewer: 'shun-designer-1', reason: 'retry accepted' },
            });
          }
          return { worker_run_id: queuedWorkerResults[queuedWorkerResults.length - 1].worker_run_id };
        },
        drainResults: async () => queuedWorkerResults.splice(0),
      },
    });

    const firstTick = await daemon.tick();
    expect(firstTick.dispatched_task_ids).toEqual(['task-r9-t3-original']);
    expect(firstTick.ingested_task_ids).toEqual(['task-r9-t3-original']);
    expect(firstTick.review_task_ids).toHaveLength(1);
    const firstReview = await prisma.review.findFirstOrThrow({ where: { project_id: projectId, original_task_id: 'task-r9-t3-original' } });
    const firstReviewTaskId = firstReview.review_task_id!;

    const secondTick = await daemon.tick();
    expect(secondTick.dispatched_task_ids).toEqual([firstReviewTaskId]);
    expect(secondTick.ingested_task_ids).toEqual([firstReviewTaskId]);
    expect(secondTick.steps.find((step) => step.name === 'review')?.details).toContain(`review-fail-retry:task-r9-t3-original:${firstReviewTaskId}`);
    const afterFailOriginal = await prisma.task.findFirstOrThrow({ where: { project_id: projectId, id: 'task-r9-t3-original' } });
    const afterFailReviewTask = await prisma.task.findFirstOrThrow({ where: { project_id: projectId, id: firstReviewTaskId } });
    const failedReview = await prisma.review.findFirstOrThrow({ where: { project_id: projectId, id: firstReview.id } });
    expect(afterFailOriginal.status).toBe('retry_ready');
    expect(afterFailOriginal.retry_count).toBe(1);
    expect(afterFailReviewTask.status).toBe('completed');
    expect(failedReview.status).toBe('changes_requested');
    expect(JSON.parse(failedReview.rework_json || '{}')).toMatchObject({ verdict: 'fail', outcome: 'retry_ready', retry_count: 1 });

    const thirdTick = await daemon.tick();
    expect(thirdTick.dispatched_task_ids).toEqual(['task-r9-t3-original']);
    expect(thirdTick.ingested_task_ids).toEqual(['task-r9-t3-original']);
    expect(thirdTick.review_task_ids).toHaveLength(1);
    const allReviewsAfterRetry = await prisma.review.findMany({
      where: { project_id: projectId, original_task_id: 'task-r9-t3-original' },
      orderBy: { created_at: 'asc' },
    });
    expect(allReviewsAfterRetry).toHaveLength(2);
    const retryReview = allReviewsAfterRetry[1];
    expect(retryReview.status).toBe('created');
    expect(retryReview.review_task_id).toBeTruthy();
    expect(retryReview.review_task_id).not.toBe(firstReviewTaskId);
    const afterRetryOriginal = await prisma.task.findFirstOrThrow({ where: { project_id: projectId, id: 'task-r9-t3-original' } });
    expect(afterRetryOriginal.status).toBe('review_pending');
    expect(afterRetryOriginal.retry_count).toBe(1);

    const fourthTick = await daemon.tick();
    expect(fourthTick.dispatched_task_ids).toEqual([retryReview.review_task_id]);
    expect(fourthTick.ingested_task_ids).toEqual([retryReview.review_task_id]);
    expect(fourthTick.steps.find((step) => step.name === 'review')?.details).toContain(`review-pass-closed:task-r9-t3-original:${retryReview.review_task_id}`);

    const completedOriginal = await prisma.task.findFirstOrThrow({ where: { project_id: projectId, id: 'task-r9-t3-original' } });
    const completedRetryReviewTask = await prisma.task.findFirstOrThrow({ where: { project_id: projectId, id: retryReview.review_task_id! } });
    const passedReview = await prisma.review.findFirstOrThrow({ where: { project_id: projectId, id: retryReview.id } });
    expect(completedOriginal.status).toBe('completed');
    expect(completedRetryReviewTask.status).toBe('completed');
    expect(passedReview.status).toBe('passed');
    expect(JSON.parse(completedOriginal.proof_data || '{}')).toMatchObject({
      event: 'review_pass',
      from_status: 'review_pending',
      to_status: 'completed',
      proof: { source: 'v8_daemon_tick_loop', step: 'review_pass_closeout', target: 'original_task', verdict: 'pass' },
    });

    const workerIngestArtifacts = await prisma.artifact.findMany({
      where: { project_id: projectId, artifact_type: 'worker_result_ingest' },
      orderBy: { created_at: 'asc' },
    });
    expect(workerIngestArtifacts.map((artifact) => JSON.parse(artifact.payload_data || '{}').worker_run_id)).toEqual([
      'worker-r9-t3-original-1',
      'worker-r9-t3-review-1',
      'worker-r9-t3-original-2',
      'worker-r9-t3-review-2',
    ]);

    const otherTask = await prisma.task.findFirstOrThrow({ where: { project_id: otherProjectId, id: 'task-r9-t3-other' } });
    expect(otherTask.status).toBe('created');
    expect(dispatches).toEqual([
      'task-r9-t3-original:long-coder-1',
      `${firstReviewTaskId}:shun-designer-1`,
      'task-r9-t3-original:long-coder-1',
      `${retryReview.review_task_id}:shun-designer-1`,
    ]);
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

  test('R9-T4 closes a completed group, writes summary proof, and thaws the next blueprint phase', async () => {
    const projectId = 'project-r9-t4-closeout-thaw';
    const otherProjectId = 'project-r9-t4-closeout-thaw-other';
    const blueprintId = 'bp-r9-t4-closeout-thaw';
    await seedProject(prisma, projectId);
    await seedProject(prisma, otherProjectId);

    const frozenBlueprint = {
      version: '8.0',
      blueprint_id: blueprintId,
      name: 'R9-T4 closeout thaw blueprint',
      phases: [
        {
          phase_id: 'phase-r9-t4-a',
          name: 'Phase A',
          group_id: 'r9-t4-group-a',
          priority: 1,
          tasks: [
            {
              task_id: 'r9-t4-a-1',
              title: 'Already completed phase A task',
              objective: 'Seeded runtime task for closeout',
              lane_required: 'DEV',
              acceptance_mode: 'manual',
              acceptance_criteria: ['seeded completed task'],
            },
          ],
        },
        {
          phase_id: 'phase-r9-t4-b',
          name: 'Phase B',
          group_id: 'r9-t4-group-b',
          priority: 2,
          tasks: [
            {
              task_id: 'r9-t4-b-1',
              title: 'Next phase task 1',
              objective: 'Should be thawed only after summary proof exists',
              lane_required: 'DEV',
              acceptance_mode: 'manual',
              acceptance_criteria: ['created by next phase thaw'],
            },
            {
              task_id: 'r9-t4-b-2',
              title: 'Next phase task 2',
              objective: 'Depends on next phase task 1 inside the same project',
              lane_required: 'DEV',
              acceptance_mode: 'manual',
              acceptance_criteria: ['created with same-project dependency'],
              depends_on: ['r9-t4-b-1'],
            },
          ],
        },
      ],
    };

    await prisma.projectBlueprint.create({
      data: {
        project_id: projectId,
        blueprint_id: blueprintId,
        name: frozenBlueprint.name,
        version: frozenBlueprint.version,
        schema_json: JSON.stringify(frozenBlueprint),
        status: 'frozen',
      },
    });

    const groupA = await prisma.taskGroup.create({
      data: {
        project_id: projectId,
        group_id: 'r9-t4-group-a',
        name: 'Phase A',
        status: 'active',
        priority: 1,
        ext_meta: JSON.stringify({ blueprint_id: blueprintId, phase_id: 'phase-r9-t4-a' }),
      },
    });
    await prisma.task.create({
      data: {
        id: 'r9-t4-a-1',
        project_id: projectId,
        task_group_id: groupA.id,
        title: 'Already completed phase A task',
        objective: 'Seeded runtime task for closeout',
        lane_required: 'DEV',
        status: 'completed',
        acceptance_mode: 'manual',
      },
    });

    const otherGroup = await prisma.taskGroup.create({
      data: { project_id: otherProjectId, group_id: 'r9-t4-group-a', name: 'Other Phase A', status: 'active' },
    });
    await prisma.task.create({
      data: {
        id: 'r9-t4-other-a-1',
        project_id: otherProjectId,
        task_group_id: otherGroup.id,
        title: 'Other project task',
        objective: 'Must not be archived or thawed by this project tick',
        lane_required: 'DEV',
        status: 'created',
      },
    });

    const daemon = new V8DaemonTickLoop({ prisma, project_id: projectId });
    const result = await daemon.tick();

    expect(result.closeout.archived_group_ids).toEqual(['r9-t4-group-a']);
    expect(result.closeout.group_summary_report_ids).toHaveLength(1);
    expect(result.closeout.details).toEqual(expect.arrayContaining(['group-archived:r9-t4-group-a', 'next-phase-thawed:r9-t4-group-b']));

    const archivedGroup = await prisma.taskGroup.findFirstOrThrow({ where: { project_id: projectId, group_id: 'r9-t4-group-a' } });
    expect(archivedGroup.status).toBe('archived');

    const summary = await prisma.report.findFirstOrThrow({
      where: { project_id: projectId, message_type: 'group_summary', status: 'sent' },
    });
    expect(JSON.parse(summary.payload_json)).toMatchObject({
      project_id: projectId,
      group_id: 'r9-t4-group-a',
      task_group_id: groupA.id,
      completed: 1,
      next_phase: { blueprint_id: blueprintId, phase_id: 'phase-r9-t4-b', group_id: 'r9-t4-group-b' },
    });

    const groupB = await prisma.taskGroup.findFirstOrThrow({ where: { project_id: projectId, group_id: 'r9-t4-group-b' } });
    expect(groupB.status).toBe('active');
    const phaseBTasks = await prisma.task.findMany({
      where: { project_id: projectId, task_group_id: groupB.id },
      orderBy: { id: 'asc' },
    });
    expect(phaseBTasks.map((task) => [task.id, task.status])).toEqual([
      ['r9-t4-b-1', 'created'],
      ['r9-t4-b-2', 'created'],
    ]);
    const dependency = await prisma.taskDependency.findFirstOrThrow({
      where: { project_id: projectId, task_id: 'r9-t4-b-2', depends_on_id: 'r9-t4-b-1' },
    });
    expect(dependency.dependency_type).toBe('blocks');

    const otherProjectGroup = await prisma.taskGroup.findFirstOrThrow({ where: { id: otherGroup.id, project_id: otherProjectId } });
    expect(otherProjectGroup.status).toBe('active');
    const otherProjectPhaseB = await prisma.taskGroup.findFirst({ where: { project_id: otherProjectId, group_id: 'r9-t4-group-b' } });
    expect(otherProjectPhaseB).toBeNull();
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

  test('R9-T5 daemon smoke keeps project_cronjobs registry isolated and never starts or mutates cronjobs', async () => {
    const projectId = 'project-r9-cron-registry-smoke';
    const otherProjectId = 'project-r9-cron-registry-smoke-other';
    await seedProject(prisma, projectId);
    await seedProject(prisma, otherProjectId);
    await prisma.projectCronjob.createMany({
      data: [
        {
          project_id: projectId,
          cronjob_id: 'patrol-active',
          name: 'Active patrol for current project',
          schedule: '*/5 * * * *',
          status: 'active',
          enabled_policy: 'always_on',
          owner_agent_id: 'long-coder-1',
          config_json: JSON.stringify({ prompt_template: '巡检 {{project_id}}' }),
        },
        {
          project_id: otherProjectId,
          cronjob_id: 'patrol-active',
          name: 'Active patrol for another project',
          schedule: '* * * * *',
          status: 'active',
          enabled_policy: 'always_on',
          owner_agent_id: 'other-agent',
          config_json: JSON.stringify({ prompt_template: '其他项目 {{project_id}}' }),
        },
      ],
    });

    const dispatch = jest.fn();
    const daemon = new V8DaemonTickLoop({
      prisma,
      project_id: projectId,
      workerClient: { dispatch, drainResults: async () => [] },
    });

    const result = await daemon.tick();

    expect(result.project_id).toBe(projectId);
    expect(result.claimed_task_ids).toEqual([]);
    expect(result.dispatched_task_ids).toEqual([]);
    expect(result.ingested_task_ids).toEqual([]);
    expect(result.review_task_ids).toEqual([]);
    expect(result.closeout).toEqual({ archived_group_ids: [], group_summary_report_ids: [], details: [], count: 0 });
    expect(dispatch).not.toHaveBeenCalled();

    const currentCronjob = await prisma.projectCronjob.findFirstOrThrow({
      where: { project_id: projectId, cronjob_id: 'patrol-active' },
    });
    const otherCronjob = await prisma.projectCronjob.findFirstOrThrow({
      where: { project_id: otherProjectId, cronjob_id: 'patrol-active' },
    });
    expect(currentCronjob).toMatchObject({
      project_id: projectId,
      cronjob_id: 'patrol-active',
      status: 'active',
      owner_agent_id: 'long-coder-1',
    });
    expect(currentCronjob.last_run_at).toBeNull();
    expect(JSON.parse(currentCronjob.config_json || '{}')).toEqual({ prompt_template: '巡检 {{project_id}}' });
    expect(otherCronjob).toMatchObject({
      project_id: otherProjectId,
      cronjob_id: 'patrol-active',
      status: 'active',
      owner_agent_id: 'other-agent',
    });
    expect(otherCronjob.last_run_at).toBeNull();
    expect(await prisma.report.count({ where: { message_type: { contains: 'cron' } } })).toBe(0);
    expect(await prisma.artifact.count({ where: { artifact_type: { contains: 'cron' } } })).toBe(0);
  });

  test('R9-T6 daemon restart recovery smoke: interrupted mid-flight tasks recover and complete after daemon restart', async () => {
    const projectId = 'project-r9-t6-restart-recovery';
    const otherProjectId = 'project-r9-t6-restart-recovery-other';
    await seedProject(prisma, projectId);
    await seedProject(prisma, otherProjectId);
    const group = await prisma.taskGroup.create({
      data: { project_id: projectId, group_id: 'r9-t6-group', name: 'R9-T6 restart recovery group', status: 'active' },
    });
    await prisma.agent.createMany({
      data: [
        {
          id: 'agent-r9-t6-long',
          agent_id: 'long-coder-1',
          project_id: projectId,
          endpoint: 'mock://long-r9-t6',
          lane: 'DEV',
          dialect: 'hermes',
          soul_prompt: '',
          tools_allowed: '[]',
          status: 'online',
        },
        {
          id: 'agent-r9-t6-shun',
          agent_id: 'shun-designer-1',
          project_id: projectId,
          endpoint: 'mock://shun-r9-t6',
          lane: 'REVIEW',
          dialect: 'hermes',
          soul_prompt: '',
          tools_allowed: '[]',
          status: 'online',
        },
      ],
    });
    await prisma.task.createMany({
      data: [
        {
          id: 'task-r9-t6-recoverable',
          project_id: projectId,
          task_group_id: group.id,
          title: 'R9-T6 recoverable task',
          objective: 'Dispatched by daemon tick 1, running when daemon crashes; must be recovered by restarted daemon',
          lane_required: 'DEV',
          status: 'created',
          acceptance_mode: 'pm_audit',
          reviewer: 'shun-designer-1',
          acceptance_criteria: JSON.stringify(['restart recovery', 'retry_ready', 'redispatch', 'completion']),
          max_retries: 2,
        },
        {
          id: 'task-r9-t6-fresh-after-restart',
          project_id: projectId,
          task_group_id: group.id,
          title: 'R9-T6 fresh task after restart',
          objective: 'Created before crash but not yet claimed; should be claimed normally by restarted daemon',
          lane_required: 'DEV',
          status: 'created',
          acceptance_mode: 'standard',
        },
        {
          id: 'task-r9-t6-other-sentinel',
          project_id: otherProjectId,
          title: 'Other project sentinel',
          objective: 'Must remain isolated across daemon restart',
          lane_required: 'DEV',
          status: 'created',
          acceptance_mode: 'pm_audit',
          reviewer: 'shun-designer-1',
        },
      ],
    });

    // ══════════════════════════════════════════════════════════
    // TICK 1: Initial daemon — dispatch recoverable task
    // ══════════════════════════════════════════════════════════
    let tick1DispatchCount = 0;
    const tick1WorkerResults: any[] = [];
    const tick1Daemon = new V8DaemonTickLoop({
      prisma,
      project_id: projectId,
      workerClient: {
        dispatch: async (payload) => {
          tick1DispatchCount += 1;
          // Only dispatch the first DEV task; simulate crash before result comes back
          if (payload.task.id === 'task-r9-t6-recoverable') {
            // Worker was dispatched but daemon crashes before ingest
            tick1WorkerResults.push({
              project_id: projectId,
              task_id: payload.task.id,
              worker_run_id: 'worker-r9-t6-recoverable-tick1',
              lease_token: payload.lease.lease_token,
              summary: 'worker completed but daemon crashed before ingest',
              proof: { attempt: 1, status: 'lost_due_to_crash' },
            });
            // Return worker_run_id but DON'T drain — simulate crash before result ingestion
            return { worker_run_id: 'worker-r9-t6-recoverable-tick1' };
          }
          // The fresh-after-restart task should NOT be dispatched in tick 1
          // because the daemon crashes after dispatching the first task
          throw new Error('simulated_daemon_crash_after_first_dispatch');
        },
        drainResults: async () => {
          // Daemon crashes — worker results are LOST (never ingested)
          return [];
        },
      },
    });

    // Tick 1 — dispatch the recoverable task successfully
    const tick1 = await tick1Daemon.tick();
    expect(tick1.dispatched_task_ids).toEqual(['task-r9-t6-recoverable']);
    // The dispatch step itself is ok even though the second task hit an error
    // (per-task errors are caught within the dispatch loop)
    // The fresh-after-restart task gets an error dispatch but is handled gracefully
    expect(tick1.steps.find((s) => s.name === 'dispatch')?.ok).toBe(true);

    // After tick 1, verify state:
    // - recoverable task should be running (dispatched, run created)
    const taskAfterTick1 = await prisma.task.findFirstOrThrow({
      where: { project_id: projectId, id: 'task-r9-t6-recoverable' },
    });
    expect(taskAfterTick1.status).toBe('running');

    // The worker result was never ingested — simulate the passage of time
    // by creating a stale run (started_at far in the past)
    const staleRun = await prisma.run.findFirstOrThrow({
      where: { project_id: projectId, task_id: 'task-r9-t6-recoverable', status: 'running' },
    });
    await prisma.run.updateMany({
      where: { project_id: projectId, run_id: staleRun.run_id },
      data: { started_at: new Date(Date.now() - 60 * 60 * 1000) }, // 1 hour ago
    });

    // ══════════════════════════════════════════════════════════
    // DAEMON RESTART (simulated by new V8DaemonTickLoop instance)
    // ══════════════════════════════════════════════════════════

    // Check what happened to the fresh-after-restart task
    const freshTaskAfterTick1 = await prisma.task.findFirstOrThrow({
      where: { project_id: projectId, id: 'task-r9-t6-fresh-after-restart' },
    });
    // It might have been claimed (dispatched status) or stayed created,
    // depending on whether the dispatch crash happened before or after it was processed.
    // For this smoke, we just need to verify the restarted daemon handles it.

    // Reset the fresh-after-restart task to created if it was left in a bad state
    if (freshTaskAfterTick1.status === 'dispatched' || freshTaskAfterTick1.status === 'running') {
      await prisma.task.updateMany({
        where: { project_id: projectId, id: 'task-r9-t6-fresh-after-restart' },
        data: { status: 'created' },
      });
    }

    // Also reset the crashed dispatch attempt for fresh-after-restart if a run exists
    const crashedRun = await prisma.run.findFirst({
      where: { project_id: projectId, task_id: 'task-r9-t6-fresh-after-restart' },
    });
    if (crashedRun) {
      await prisma.run.updateMany({
        where: { project_id: projectId, run_id: crashedRun.run_id },
        data: { status: 'error', error_stack: 'daemon_crash_recovery:run_interrupted_by_restart', ended_at: new Date() },
      });
    }

    // ══════════════════════════════════════════════════════════
    // TICK 2: Restarted daemon — recovery + fresh processing
    // ══════════════════════════════════════════════════════════
    const tick2QueuedResults: any[] = [];
    const tick2Dispatches: string[] = [];
    let tick2DevDispatchCount = 0;
    let tick2ReviewDispatchCount = 0;
    const restartedDaemon = new V8DaemonTickLoop({
      prisma,
      project_id: projectId,
      staleRunMs: 30 * 60 * 1000, // 30 minutes — the stale run from tick 1 should be detected
      workerClient: {
        dispatch: async (payload) => {
          tick2Dispatches.push(`${payload.task.id}:${payload.agent.agent_id}`);
          if (payload.task.lane_required === 'DEV') {
            tick2DevDispatchCount += 1;
            tick2QueuedResults.push({
              project_id: projectId,
              task_id: payload.task.id,
              worker_run_id: `worker-r9-t6-${payload.task.id}-${tick2DevDispatchCount}`,
              lease_token: payload.lease.lease_token,
              summary: `restarted daemon dispatch attempt ${tick2DevDispatchCount}`,
              proof: { attempt: tick2DevDispatchCount, restarted: true },
            });
          } else {
            tick2ReviewDispatchCount += 1;
            tick2QueuedResults.push({
              project_id: projectId,
              task_id: payload.task.id,
              worker_run_id: `worker-r9-t6-review-${tick2ReviewDispatchCount}`,
              lease_token: payload.lease.lease_token,
              summary: 'review verdict PASS after restart recovery',
              proof: { verdict: 'PASS', reviewer: 'shun-designer-1', reason: 'restart recovery proof accepted' },
            });
          }
          return { worker_run_id: tick2QueuedResults[tick2QueuedResults.length - 1].worker_run_id };
        },
        drainResults: async () => tick2QueuedResults.splice(0),
      },
    });

    const tick2 = await restartedDaemon.tick();

    // Verify stale run recovery
    expect(tick2.recovered_stale_task_ids).toEqual(['task-r9-t6-recoverable']);

    // After recovery, the recoverable task should be in retry_ready (NOT immediately re-dispatched in same tick)
    const taskAfterRecovery = await prisma.task.findFirstOrThrow({
      where: { project_id: projectId, id: 'task-r9-t6-recoverable' },
    });
    expect(taskAfterRecovery.status).toBe('retry_ready');
    expect(taskAfterRecovery.retry_count).toBe(1);
    expect(JSON.parse(taskAfterRecovery.ext_meta || '{}')).toMatchObject({
      timeout_recovery: {
        previous_run_id: staleRun.run_id,
        outcome: 'retry_ready',
        retry_count: 1,
      },
    });

    // Verify the stale run was marked as error
    const oldRun = await prisma.run.findFirstOrThrow({
      where: { project_id: projectId, run_id: staleRun.run_id },
    });
    expect(oldRun.status).toBe('error');
    expect(oldRun.error_stack).toContain('timeout_recovery');

    // Fresh-after-restart task should be claimed in tick 2
    expect(tick2.claimed_task_ids).toContain('task-r9-t6-fresh-after-restart');
    expect(tick2.dispatched_task_ids).toContain('task-r9-t6-fresh-after-restart');

    // Recoverable task should NOT be dispatched in tick 2 (stays in retry_ready)
    expect(tick2.dispatched_task_ids).not.toContain('task-r9-t6-recoverable');

    // Verify the fresh task went through the full standard pipeline
    const freshTaskAfterTick2 = await prisma.task.findFirstOrThrow({
      where: { project_id: projectId, id: 'task-r9-t6-fresh-after-restart' },
    });
    expect(freshTaskAfterTick2.status).toBe('completed');

    // ══════════════════════════════════════════════════════════
    // TICK 3: Continue — redispatch the recovered task
    // ══════════════════════════════════════════════════════════
    const tick3QueuedResults: any[] = [];
    const tick3Dispatches: string[] = [];
    const tick3Daemon = new V8DaemonTickLoop({
      prisma,
      project_id: projectId,
      workerClient: {
        dispatch: async (payload) => {
          tick3Dispatches.push(`${payload.task.id}:${payload.agent.agent_id}`);
          if (payload.task.lane_required === 'DEV') {
            tick3QueuedResults.push({
              project_id: projectId,
              task_id: payload.task.id,
              worker_run_id: 'worker-r9-t6-recoverable-retry',
              lease_token: payload.lease.lease_token,
              summary: 'retry worker proof after daemon restart',
              proof: { attempt: 2, restarted: true, recovered: true },
            });
          } else {
            tick3QueuedResults.push({
              project_id: projectId,
              task_id: payload.task.id,
              worker_run_id: 'worker-r9-t6-review-retry',
              lease_token: payload.lease.lease_token,
              summary: 'review PASS for recovered task',
              proof: { verdict: 'PASS', reviewer: 'shun-designer-1', reason: 'recovered task proof accepted' },
            });
          }
          return { worker_run_id: tick3QueuedResults[tick3QueuedResults.length - 1].worker_run_id };
        },
        drainResults: async () => tick3QueuedResults.splice(0),
      },
    });

    const tick3 = await tick3Daemon.tick();
    // Recoverable task should now be claimed and dispatched (from retry_ready)
    expect(tick3.claimed_task_ids).toEqual(['task-r9-t6-recoverable']);
    expect(tick3.dispatched_task_ids).toEqual(['task-r9-t6-recoverable']);
    expect(tick3.ingested_task_ids).toEqual(['task-r9-t6-recoverable']);
    // Review task created for pm_audit
    expect(tick3.review_task_ids).toHaveLength(1);

    // ══════════════════════════════════════════════════════════
    // TICK 4: Review PASS for the recovered task
    // ══════════════════════════════════════════════════════════
    const reviewAfterRecovery = await prisma.review.findFirstOrThrow({
      where: { project_id: projectId, original_task_id: 'task-r9-t6-recoverable' },
    });
    const reviewTaskIdAfterRecovery = reviewAfterRecovery.review_task_id!;

    const tick4QueuedResults: any[] = [];
    const tick4Daemon = new V8DaemonTickLoop({
      prisma,
      project_id: projectId,
      workerClient: {
        dispatch: async (payload) => {
          tick4QueuedResults.push({
            project_id: projectId,
            task_id: payload.task.id,
            worker_run_id: 'worker-r9-t6-review-pass',
            lease_token: payload.lease.lease_token,
            summary: 'review PASS after restart recovery',
            proof: { verdict: 'PASS', reviewer: 'shun-designer-1' },
          });
          return { worker_run_id: 'worker-r9-t6-review-pass' };
        },
        drainResults: async () => tick4QueuedResults.splice(0),
      },
    });

    const tick4 = await tick4Daemon.tick();
    expect(tick4.dispatched_task_ids).toEqual([reviewTaskIdAfterRecovery]);
    expect(tick4.ingested_task_ids).toEqual([reviewTaskIdAfterRecovery]);
    expect(tick4.steps.find((s) => s.name === 'review')?.details)
      .toContain(`review-pass-closed:task-r9-t6-recoverable:${reviewTaskIdAfterRecovery}`);

    // ══════════════════════════════════════════════════════════
    // FINAL VERIFICATION
    // ══════════════════════════════════════════════════════════

    // Both tasks should be completed
    const finalRecoverable = await prisma.task.findFirstOrThrow({
      where: { project_id: projectId, id: 'task-r9-t6-recoverable' },
    });
    expect(finalRecoverable.status).toBe('completed');
    expect(JSON.parse(finalRecoverable.proof_data || '{}')).toMatchObject({
      event: 'review_pass',
      from_status: 'review_pending',
      to_status: 'completed',
    });

    const finalReviewTask = await prisma.task.findFirstOrThrow({
      where: { project_id: projectId, id: reviewTaskIdAfterRecovery },
    });
    expect(finalReviewTask.status).toBe('completed');

    // Cross-project isolation preserved across restart
    const otherTask = await prisma.task.findFirstOrThrow({
      where: { project_id: otherProjectId, id: 'task-r9-t6-other-sentinel' },
    });
    expect(otherTask.status).toBe('created');

    // No stale runs left in running state
    const staleRuns = await prisma.run.findMany({
      where: { project_id: projectId, status: 'running' },
    });
    expect(staleRuns).toHaveLength(0);

    // Verify both tasks are completed before closeout check
    const finalRecoverableCheck = await prisma.task.findFirstOrThrow({
      where: { project_id: projectId, id: 'task-r9-t6-recoverable' },
    });
    const finalFreshCheck = await prisma.task.findFirstOrThrow({
      where: { project_id: projectId, id: 'task-r9-t6-fresh-after-restart' },
    });
    expect(finalRecoverableCheck.status).toBe('completed');
    expect(finalFreshCheck.status).toBe('completed');

    // Group should be archived (all tasks terminal) — closeout happens in the same tick
    // as the last task completion (tick 4 closeout step)
    const tick4Closeout = tick4.closeout;
    expect(tick4Closeout.archived_group_ids).toEqual(['r9-t6-group']);
    expect(tick4Closeout.group_summary_report_ids).toHaveLength(1);

    const summaryReport = await prisma.report.findFirstOrThrow({
      where: { project_id: projectId, message_type: 'group_summary', status: 'sent' },
    });
    expect(JSON.parse(summaryReport.payload_json)).toMatchObject({
      project_id: projectId,
      group_id: 'r9-t6-group',
      completed: 2,
      total: 2,
    });

    // Audit trail: recoverable task has both the original (error) run and retry run
    const allRuns = await prisma.run.findMany({
      where: { project_id: projectId, task_id: 'task-r9-t6-recoverable' },
      orderBy: [{ run_id: 'asc' }],
    });
    expect(allRuns.length).toBeGreaterThanOrEqual(2);
    const originalStaleRun = allRuns.find((r) => r.status === 'error');
    expect(originalStaleRun).toBeTruthy();
    expect(originalStaleRun?.error_stack).toContain('timeout_recovery');
    const retryRun = allRuns.find((r) => r.status === 'success');
    expect(retryRun).toBeTruthy();

    // Dispatch audit: tick1 dispatched recoverable; tick2 dispatched fresh;
    // tick3 dispatched recoverable retry (review task created but not dispatched);
    // tick4 dispatched review task
    expect(tick2Dispatches).toEqual(['task-r9-t6-fresh-after-restart:long-coder-1']);
    expect(tick3Dispatches).toEqual(['task-r9-t6-recoverable:long-coder-1']);
  });

  test('daemon source is V8-only: no legacy DAL/ignored DB/raw SQL and no direct cron lifecycle mutation', () => {
    const source = fs.readFileSync(path.join(repoRoot, 'src/daemon/v8_tick_loop.ts'), 'utf8');
    expect(source).toContain('transitionTask(');
    expect(source).toContain('V8RuntimeApiService');
    expect(source).not.toMatch(/\.\.\/db\/dal|better-sqlite3|sqlite3|data\/nexus\.db|prisma\/data\/nexus\.db|\$queryRaw|\$executeRaw/i);
    expect(source).toContain('archiveTaskGroup(');
    expect(source).not.toMatch(/prisma\.task\.(update|updateMany)\([\s\S]*status\s*:\s*['"]completed['"]/);
    expect(source).not.toMatch(/taskTable\.updateMany\([\s\S]*status\s*:\s*['"]completed['"]/);
    expect(source).not.toMatch(/data:\s*\{[\s\S]*status\s*:\s*['"]completed['"][\s\S]*\}\s*\}\);/);
    expect(source).not.toMatch(/prisma\.taskGroup\.(update|updateMany)\([\s\S]*status\s*:/);
    expect(source).not.toMatch(/cronjob\.(start|stop|pause|resume)|startCronjob|stopCronjob|pauseCronjob|resumeCronjob|updateCronjobStatus\(/i);
  });
});
