import { execFileSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { PrismaClient } from '@prisma/client';
import { evaluateReviewPolicy, ReviewPolicyRepository } from '../../src/review/v8_review_policy';

const repoRoot = path.resolve(__dirname, '../..');
const prismaSchemaPath = path.join(repoRoot, 'prisma/schema.prisma');

function modelBlock(schema: string, modelName: string): string {
  const match = schema.match(new RegExp(`model\\s+${modelName}\\s+\\{[\\s\\S]*?\\n\\}`));
  if (!match) throw new Error(`Missing Prisma model ${modelName}`);
  return match[0];
}

describe('V8-R5 review policy table and evaluator', () => {
  let tmpDir: string;
  let prisma: PrismaClient;
  let policyRepo: ReviewPolicyRepository;

  beforeEach(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-v8-r5-review-policy-'));
    const dbPath = path.join(tmpDir, 'review-policy.db');
    execFileSync('npm', ['run', 'db:init:test', '--', dbPath], {
      cwd: repoRoot,
      encoding: 'utf8',
      env: { ...process.env, DATABASE_URL: undefined },
    });
    prisma = new PrismaClient({ datasources: { db: { url: `file:${dbPath}` } } });
    policyRepo = new ReviewPolicyRepository(prisma);
  }, 30000);

  afterEach(async () => {
    await prisma.$disconnect();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test('Prisma schema defines project-scoped review policy table with override dimensions', () => {
    const schema = fs.readFileSync(prismaSchemaPath, 'utf8');
    const project = modelBlock(schema, 'Project');
    const policy = modelBlock(schema, 'ReviewPolicy');

    expect(project).toContain('reviewPolicies');
    expect(policy).toContain('@@map("review_policies")');
    expect(policy).toMatch(/project_id\s+String/);
    expect(policy).toMatch(/agent_id\s+String\?/);
    expect(policy).toMatch(/lane\s+String\?/);
    expect(policy).toMatch(/reviewer_agent_id\s+String/);
    expect(policy).toContain('priority');
    expect(policy).toContain('enabled');
    expect(policy).toContain('@@unique([project_id, policy_id])');
    expect(policy).toContain('@@index([project_id, enabled, agent_id, lane])');
  });

  test('ReviewPolicyRepository binds policies by project and blocks cross-project reads', async () => {
    await prisma.project.createMany({
      data: [
        { id: 'project-r5-a', name: 'project-r5-a', status: 'active' },
        { id: 'project-r5-b', name: 'project-r5-b', status: 'active' },
      ],
    });

    const created = await policyRepo.upsert('project-r5-a', {
      policy_id: 'lane-dev',
      reviewer_agent_id: 'shun-designer-1',
      lane: 'DEV',
      priority: 20,
      policy_json: { source: 'lane override' },
    });

    expect(created.project_id).toBe('project-r5-a');
    expect(created.lane).toBe('DEV');
    await expect(policyRepo.get('project-r5-a', 'lane-dev')).resolves.toMatchObject({ reviewer_agent_id: 'shun-designer-1' });
    await expect(policyRepo.get('project-r5-b', 'lane-dev')).resolves.toBeNull();
    await expect(policyRepo.list('project-r5-b')).resolves.toHaveLength(0);

    await expect(
      policyRepo.upsert('project-r5-b', {
        policy_id: 'lane-dev',
        reviewer_agent_id: 'mu-reviewer-1',
        lane: 'DEV',
      }),
    ).resolves.toMatchObject({ project_id: 'project-r5-b', reviewer_agent_id: 'mu-reviewer-1' });
    await expect(policyRepo.get('project-r5-a', 'lane-dev')).resolves.toMatchObject({ reviewer_agent_id: 'shun-designer-1' });
  });

  test('evaluateReviewPolicy resolves agent override before lane and project default within project scope', async () => {
    await prisma.project.createMany({
      data: [
        { id: 'project-r5-eval', name: 'project-r5-eval', status: 'active' },
        { id: 'project-r5-other', name: 'project-r5-other', status: 'active' },
      ],
    });
    await policyRepo.upsert('project-r5-eval', {
      policy_id: 'default',
      reviewer_agent_id: 'default-reviewer',
      priority: 1,
    });
    await policyRepo.upsert('project-r5-eval', {
      policy_id: 'lane-dev',
      lane: 'DEV',
      reviewer_agent_id: 'lane-reviewer',
      priority: 50,
    });
    await policyRepo.upsert('project-r5-eval', {
      policy_id: 'agent-long',
      agent_id: 'long-coder-1',
      lane: 'DEV',
      reviewer_agent_id: 'agent-reviewer',
      priority: 10,
    });
    await policyRepo.upsert('project-r5-other', {
      policy_id: 'agent-long',
      agent_id: 'long-coder-1',
      lane: 'DEV',
      reviewer_agent_id: 'cross-project-reviewer',
      priority: 999,
    });

    await expect(
      evaluateReviewPolicy({ prisma }, { project_id: 'project-r5-eval', agent_id: 'long-coder-1', lane: 'DEV' }),
    ).resolves.toMatchObject({ reviewer_agent_id: 'agent-reviewer', policy_id: 'agent-long', source: 'agent_override' });

    await expect(
      evaluateReviewPolicy({ prisma }, { project_id: 'project-r5-eval', agent_id: 'hyoga-coder-1', lane: 'DEV' }),
    ).resolves.toMatchObject({ reviewer_agent_id: 'lane-reviewer', policy_id: 'lane-dev', source: 'lane_override' });

    await expect(
      evaluateReviewPolicy({ prisma }, { project_id: 'project-r5-eval', agent_id: 'hyoga-coder-1', lane: 'OPS' }),
    ).resolves.toMatchObject({ reviewer_agent_id: 'default-reviewer', policy_id: 'default', source: 'project_default' });
  });

  test('daemon review spawning uses evaluator result instead of hard-coded reviewer fallback', async () => {
    const { V8DaemonTickLoop } = await import('../../src/daemon/v8_tick_loop');
    await prisma.project.create({ data: { id: 'project-r5-daemon', name: 'project-r5-daemon', status: 'active' } });
    await prisma.agent.createMany({
      data: [
        {
          id: 'agent-review-mu',
          agent_id: 'mu-reviewer-1',
          project_id: 'project-r5-daemon',
          endpoint: 'mock://mu',
          lane: 'REVIEW',
          dialect: 'hermes',
          soul_prompt: '',
          tools_allowed: '[]',
          status: 'online',
        },
        {
          id: 'agent-long',
          agent_id: 'long-coder-1',
          project_id: 'project-r5-daemon',
          endpoint: 'mock://long',
          lane: 'DEV',
          dialect: 'hermes',
          soul_prompt: '',
          tools_allowed: '[]',
          status: 'online',
        },
      ],
    });
    await prisma.task.create({
      data: {
        id: 'task-r5-review-policy',
        project_id: 'project-r5-daemon',
        title: 'Needs policy reviewer',
        objective: 'Select reviewer by agent policy',
        lane_required: 'DEV',
        status: 'completion_pending',
        acceptance_mode: 'pm_audit',
      },
    });
    await prisma.run.create({
      data: {
        run_id: 'run-r5-review-policy',
        project_id: 'project-r5-daemon',
        task_id: 'task-r5-review-policy',
        agent_id: 'agent-long',
        idempotency_key: 'project-r5-daemon:task-r5-review-policy:agent-long',
        status: 'success',
        ended_at: new Date(),
      },
    });
    await policyRepo.upsert('project-r5-daemon', {
      policy_id: 'dev-lane-reviewer',
      lane: 'DEV',
      reviewer_agent_id: 'lane-reviewer-should-not-win',
      priority: 100,
    });
    await policyRepo.upsert('project-r5-daemon', {
      policy_id: 'long-agent-reviewer',
      agent_id: 'long-coder-1',
      lane: 'DEV',
      reviewer_agent_id: 'mu-reviewer-1',
      priority: 10,
    });

    const daemon = new V8DaemonTickLoop({ prisma, project_id: 'project-r5-daemon' });
    const result = await daemon.tick();

    expect(result.review_task_ids).toHaveLength(1);
    const review = await prisma.review.findFirstOrThrow({ where: { project_id: 'project-r5-daemon', original_task_id: 'task-r5-review-policy' } });
    expect(review.reviewer_agent_id).toBe('mu-reviewer-1');
    expect(JSON.parse(review.rework_json || '{}')).toMatchObject({ policy_id: 'long-agent-reviewer', policy_source: 'agent_override' });
    const reviewTask = await prisma.task.findFirstOrThrow({ where: { project_id: 'project-r5-daemon', id: review.review_task_id! } });
    expect(reviewTask.reviewer).toBe('mu-reviewer-1');
    expect(JSON.parse(reviewTask.payload || '{}')).toMatchObject({ reviewer: 'mu-reviewer-1', review_policy: { policy_id: 'long-agent-reviewer' } });
  });

  test('daemon dynamically snapshots source lane acceptance mode and requested reviewer into generated review task', async () => {
    const { V8DaemonTickLoop } = await import('../../src/daemon/v8_tick_loop');
    await prisma.project.create({ data: { id: 'project-r5-dynamic-review', name: 'project-r5-dynamic-review', status: 'active' } });
    await prisma.agent.createMany({
      data: [
        {
          id: 'agent-review-shun',
          agent_id: 'shun-designer-1',
          project_id: 'project-r5-dynamic-review',
          endpoint: 'mock://shun',
          lane: 'REVIEW',
          dialect: 'hermes',
          soul_prompt: '',
          tools_allowed: '[]',
          status: 'online',
        },
        {
          id: 'agent-long-dynamic',
          agent_id: 'long-coder-1',
          project_id: 'project-r5-dynamic-review',
          endpoint: 'mock://long',
          lane: 'DEV',
          dialect: 'hermes',
          soul_prompt: '',
          tools_allowed: '[]',
          status: 'online',
        },
      ],
    });
    await prisma.task.create({
      data: {
        id: 'task-r5-dynamic-review',
        project_id: 'project-r5-dynamic-review',
        title: 'Dynamic review task source',
        objective: 'Generate review task from task lane acceptance mode reviewer',
        lane_required: 'DEV',
        status: 'completion_pending',
        acceptance_mode: 'pm_audit',
        reviewer: 'shun-designer-1',
        acceptance_criteria: JSON.stringify(['source AC: focused tests pass', 'source AC: proof recorded']),
      },
    });
    await prisma.run.create({
      data: {
        run_id: 'run-r5-dynamic-review',
        project_id: 'project-r5-dynamic-review',
        task_id: 'task-r5-dynamic-review',
        agent_id: 'agent-long-dynamic',
        idempotency_key: 'project-r5-dynamic-review:task-r5-dynamic-review:agent-long-dynamic',
        status: 'success',
        ended_at: new Date(),
      },
    });
    await policyRepo.upsert('project-r5-dynamic-review', {
      policy_id: 'dev-review-shun',
      lane: 'DEV',
      reviewer_agent_id: 'shun-designer-1',
      priority: 20,
    });

    const daemon = new V8DaemonTickLoop({ prisma, project_id: 'project-r5-dynamic-review' });
    const result = await daemon.tick();

    expect(result.review_task_ids).toHaveLength(1);
    const review = await prisma.review.findFirstOrThrow({ where: { project_id: 'project-r5-dynamic-review', original_task_id: 'task-r5-dynamic-review' } });
    expect(review.reviewer_agent_id).toBe('shun-designer-1');
    const reviewTask = await prisma.task.findFirstOrThrow({ where: { project_id: 'project-r5-dynamic-review', id: review.review_task_id! } });
    expect(reviewTask.lane_required).toBe('REVIEW');
    expect(reviewTask.acceptance_mode).toBe('reviewer_verdict');
    expect(JSON.parse(reviewTask.payload || '{}')).toMatchObject({
      original_task_id: 'task-r5-dynamic-review',
      reviewer: 'shun-designer-1',
      source_task: {
        lane_required: 'DEV',
        acceptance_mode: 'pm_audit',
        requested_reviewer: 'shun-designer-1',
        acceptance_criteria: ['source AC: focused tests pass', 'source AC: proof recorded'],
      },
    });
    expect(JSON.parse(reviewTask.acceptance_criteria || '[]')).toEqual(expect.arrayContaining([
      'source lane: DEV',
      'source acceptance_mode: pm_audit',
      'requested reviewer: shun-designer-1',
      'source AC: focused tests pass',
      'source AC: proof recorded',
      'explicit PASS/FAIL verdict',
      'structured reviewer proof',
    ]));
    expect(JSON.parse(review.rework_json || '{}')).toMatchObject({
      source_task: { lane_required: 'DEV', acceptance_mode: 'pm_audit', requested_reviewer: 'shun-designer-1' },
    });
  });

  test('daemon gates review spawning when policy would self-review the latest worker', async () => {
    const { V8DaemonTickLoop } = await import('../../src/daemon/v8_tick_loop');
    await prisma.project.create({ data: { id: 'project-r5-self-review', name: 'project-r5-self-review', status: 'active' } });
    await prisma.agent.create({
      data: {
        id: 'agent-long-self-review',
        agent_id: 'long-coder-1',
        project_id: 'project-r5-self-review',
        endpoint: 'mock://long',
        lane: 'DEV',
        dialect: 'hermes',
        soul_prompt: '',
        tools_allowed: '[]',
        status: 'online',
      },
    });
    await prisma.task.create({
      data: {
        id: 'task-r5-self-review',
        project_id: 'project-r5-self-review',
        title: 'Self review must be gated',
        objective: 'Do not let worker review own task',
        lane_required: 'DEV',
        status: 'completion_pending',
        acceptance_mode: 'pm_audit',
        reviewer: 'long-coder-1',
      },
    });
    await prisma.run.create({
      data: {
        run_id: 'run-r5-self-review',
        project_id: 'project-r5-self-review',
        task_id: 'task-r5-self-review',
        agent_id: 'agent-long-self-review',
        idempotency_key: 'project-r5-self-review:task-r5-self-review:agent-long-self-review',
        status: 'success',
        ended_at: new Date(),
      },
    });

    const daemon = new V8DaemonTickLoop({ prisma, project_id: 'project-r5-self-review' });
    const result = await daemon.tick();

    expect(result.review_task_ids).toHaveLength(0);
    expect(result.steps.find((step) => step.name === 'review')?.details).toContain('review-gated:task-r5-self-review:self_review');
    await expect(prisma.task.findFirst({ where: { project_id: 'project-r5-self-review', lane_required: 'REVIEW' } })).resolves.toBeNull();
    const sourceTask = await prisma.task.findFirstOrThrow({ where: { project_id: 'project-r5-self-review', id: 'task-r5-self-review' } });
    expect(sourceTask.status).toBe('completion_pending');
    const review = await prisma.review.findFirstOrThrow({ where: { project_id: 'project-r5-self-review', original_task_id: 'task-r5-self-review' } });
    expect(review.review_task_id).toBeNull();
    expect(review.status).toBe('blocked');
    expect(JSON.parse(review.rework_json || '{}')).toMatchObject({ gate: 'reviewer_policy_required', reason: 'self_review', worker_agent_id: 'long-coder-1', reviewer_agent_id: 'long-coder-1' });
  });

  test('daemon closes original pm_audit task when reviewer task submits PASS proof', async () => {
    const { V8DaemonTickLoop } = await import('../../src/daemon/v8_tick_loop');
    await prisma.project.createMany({
      data: [
        { id: 'project-r5-review-pass', name: 'project-r5-review-pass', status: 'active' },
        { id: 'project-r5-review-pass-other', name: 'project-r5-review-pass-other', status: 'active' },
      ],
    });
    await prisma.task.createMany({
      data: [
        {
          id: 'task-r5-review-pass-original',
          project_id: 'project-r5-review-pass',
          title: 'Original pm audit task',
          objective: 'Original should close after review PASS',
          lane_required: 'DEV',
          status: 'review_pending',
          acceptance_mode: 'pm_audit',
          reviewer: 'shun-designer-1',
        },
        {
          id: 'task-r5-review-pass-review',
          project_id: 'project-r5-review-pass',
          title: 'Review: Original pm audit task',
          objective: 'Reviewer says PASS with structured proof',
          lane_required: 'REVIEW',
          status: 'completion_pending',
          acceptance_mode: 'reviewer_verdict',
          reviewer: 'shun-designer-1',
          proof_data: JSON.stringify({ verdict: 'PASS', proof: { command: 'npm test -- --runInBand tests/v8/v8_review_policy.test.ts', result: 'passed' } }),
        },
        {
          id: 'task-r5-review-pass-other-original',
          project_id: 'project-r5-review-pass-other',
          title: 'Other project original',
          objective: 'Must remain review pending',
          lane_required: 'DEV',
          status: 'review_pending',
          acceptance_mode: 'pm_audit',
          reviewer: 'shun-designer-1',
        },
        {
          id: 'task-r5-review-pass-other-review',
          project_id: 'project-r5-review-pass-other',
          title: 'Other project review',
          objective: 'PASS must not cross project',
          lane_required: 'REVIEW',
          status: 'completion_pending',
          acceptance_mode: 'reviewer_verdict',
          reviewer: 'shun-designer-1',
          proof_data: JSON.stringify({ verdict: 'PASS' }),
        },
      ],
    });
    await prisma.agent.createMany({
      data: [
        {
          id: 'agent-long-review-pass',
          agent_id: 'long-coder-1',
          project_id: 'project-r5-review-pass',
          endpoint: 'mock://long',
          lane: 'DEV',
          dialect: 'hermes',
          soul_prompt: '',
          tools_allowed: '[]',
          status: 'online',
        },
        {
          id: 'agent-shun-review-pass',
          agent_id: 'shun-designer-1',
          project_id: 'project-r5-review-pass',
          endpoint: 'mock://shun',
          lane: 'REVIEW',
          dialect: 'hermes',
          soul_prompt: '',
          tools_allowed: '[]',
          status: 'online',
        },
      ],
    });
    await prisma.run.createMany({
      data: [
        {
          run_id: 'run-r5-review-pass-original',
          project_id: 'project-r5-review-pass',
          task_id: 'task-r5-review-pass-original',
          agent_id: 'agent-long-review-pass',
          idempotency_key: 'project-r5-review-pass:task-r5-review-pass-original:long',
          status: 'success',
          ended_at: new Date(),
        },
        {
          run_id: 'run-r5-review-pass-review',
          project_id: 'project-r5-review-pass',
          task_id: 'task-r5-review-pass-review',
          agent_id: 'agent-shun-review-pass',
          idempotency_key: 'project-r5-review-pass:task-r5-review-pass-review:shun',
          status: 'success',
          ended_at: new Date(),
        },
      ],
    });
    await prisma.review.createMany({
      data: [
        {
          project_id: 'project-r5-review-pass',
          original_task_id: 'task-r5-review-pass-original',
          review_task_id: 'task-r5-review-pass-review',
          reviewer_agent_id: 'shun-designer-1',
          status: 'running',
          rework_json: JSON.stringify({ source_task: { task_id: 'task-r5-review-pass-original' } }),
        },
        {
          project_id: 'project-r5-review-pass-other',
          original_task_id: 'task-r5-review-pass-other-original',
          review_task_id: 'task-r5-review-pass-other-review',
          reviewer_agent_id: 'shun-designer-1',
          status: 'running',
          rework_json: JSON.stringify({ source_task: { task_id: 'task-r5-review-pass-other-original' } }),
        },
      ],
    });

    const daemon = new V8DaemonTickLoop({ prisma, project_id: 'project-r5-review-pass' });
    const result = await daemon.tick();

    expect(result.review_task_ids).toEqual(['task-r5-review-pass-review']);
    expect(result.steps.find((step) => step.name === 'review')?.details).toContain('review-pass-closed:task-r5-review-pass-original:task-r5-review-pass-review');
    const original = await prisma.task.findFirstOrThrow({ where: { project_id: 'project-r5-review-pass', id: 'task-r5-review-pass-original' } });
    const reviewTask = await prisma.task.findFirstOrThrow({ where: { project_id: 'project-r5-review-pass', id: 'task-r5-review-pass-review' } });
    expect(original.status).toBe('completed');
    expect(reviewTask.status).toBe('completed');
    expect(JSON.parse(original.proof_data || '{}')).toMatchObject({
      event: 'review_pass',
      from_status: 'review_pending',
      to_status: 'completed',
      project_id: 'project-r5-review-pass',
      task_id: 'task-r5-review-pass-original',
      proof: { source: 'v8_daemon_tick_loop', step: 'review_pass_closeout', target: 'original_task', verdict: 'pass' },
    });
    expect(JSON.parse(reviewTask.proof_data || '{}')).toMatchObject({
      event: 'review_pass',
      from_status: 'review_pending',
      to_status: 'completed',
      project_id: 'project-r5-review-pass',
      task_id: 'task-r5-review-pass-review',
      proof: { source: 'v8_daemon_tick_loop', step: 'review_pass_closeout', target: 'review_task', verdict: 'pass' },
    });
    const review = await prisma.review.findFirstOrThrow({ where: { project_id: 'project-r5-review-pass', original_task_id: 'task-r5-review-pass-original' } });
    expect(review.status).toBe('passed');
    expect(JSON.parse(review.rework_json || '{}')).toMatchObject({ verdict: 'pass', closed_by: 'v8_daemon_tick_loop' });
    const otherOriginal = await prisma.task.findFirstOrThrow({ where: { project_id: 'project-r5-review-pass-other', id: 'task-r5-review-pass-other-original' } });
    const otherReview = await prisma.review.findFirstOrThrow({ where: { project_id: 'project-r5-review-pass-other', original_task_id: 'task-r5-review-pass-other-original' } });
    expect(otherOriginal.status).toBe('review_pending');
    expect(otherReview.status).toBe('running');
  });

  test('daemon returns CHANGES_REQUESTED reviewer FAIL to retry_ready and closes review task', async () => {
    const { V8DaemonTickLoop } = await import('../../src/daemon/v8_tick_loop');
    await prisma.project.create({ data: { id: 'project-r5-review-fail-retry', name: 'project-r5-review-fail-retry', status: 'active' } });
    await prisma.task.createMany({
      data: [
        {
          id: 'task-r5-review-fail-original',
          project_id: 'project-r5-review-fail-retry',
          title: 'Original pm audit task needing rework',
          objective: 'Original should return to Long after review FAIL',
          lane_required: 'DEV',
          status: 'review_pending',
          acceptance_mode: 'pm_audit',
          reviewer: 'shun-designer-1',
          retry_count: 0,
          max_retries: 2,
        },
        {
          id: 'task-r5-review-fail-review',
          project_id: 'project-r5-review-fail-retry',
          title: 'Review: Original pm audit task needing rework',
          objective: 'Reviewer says CHANGES_REQUESTED with structured proof',
          lane_required: 'REVIEW',
          status: 'completion_pending',
          acceptance_mode: 'reviewer_verdict',
          reviewer: 'shun-designer-1',
          proof_data: JSON.stringify({
            verdict: 'CHANGES_REQUESTED',
            reason: 'missing retry/dead_letter contract',
            failed_item: 'R5-T5 fail path',
            location: 'src/daemon/v8_tick_loop.ts',
            modification_method: 'return original through FSM retry',
            verification_method: 'npm test -- --runInBand tests/v8/v8_review_policy.test.ts',
          }),
        },
      ],
    });
    await prisma.review.create({
      data: {
        project_id: 'project-r5-review-fail-retry',
        original_task_id: 'task-r5-review-fail-original',
        review_task_id: 'task-r5-review-fail-review',
        reviewer_agent_id: 'shun-designer-1',
        status: 'running',
        rework_json: JSON.stringify({ source_task: { task_id: 'task-r5-review-fail-original' }, required_fields: ['verdict', 'reason', 'failed_item', 'location', 'modification_method', 'verification_method'] }),
      },
    });

    const daemon = new V8DaemonTickLoop({ prisma, project_id: 'project-r5-review-fail-retry' });
    const firstTick = await daemon.tick();

    expect(firstTick.review_task_ids).toEqual(['task-r5-review-fail-review']);
    expect(firstTick.steps.find((step) => step.name === 'review')?.details).toContain('review-fail-retry:task-r5-review-fail-original:task-r5-review-fail-review');
    const original = await prisma.task.findFirstOrThrow({ where: { project_id: 'project-r5-review-fail-retry', id: 'task-r5-review-fail-original' } });
    const reviewTask = await prisma.task.findFirstOrThrow({ where: { project_id: 'project-r5-review-fail-retry', id: 'task-r5-review-fail-review' } });
    const review = await prisma.review.findFirstOrThrow({ where: { project_id: 'project-r5-review-fail-retry', original_task_id: 'task-r5-review-fail-original' } });
    expect(original.status).toBe('retry_ready');
    expect(original.retry_count).toBe(1);
    expect(reviewTask.status).toBe('completed');
    expect(review.status).toBe('changes_requested');
    expect(JSON.parse(original.proof_data || '{}')).toMatchObject({
      event: 'retry',
      from_status: 'review_pending',
      to_status: 'retry_ready',
      project_id: 'project-r5-review-fail-retry',
      task_id: 'task-r5-review-fail-original',
      proof: { source: 'v8_daemon_tick_loop', step: 'review_fail_closeout', target: 'original_task', verdict: 'fail', outcome: 'retry_ready' },
    });
    expect(JSON.parse(reviewTask.proof_data || '{}')).toMatchObject({
      event: 'review_pass',
      from_status: 'review_pending',
      to_status: 'completed',
      project_id: 'project-r5-review-fail-retry',
      task_id: 'task-r5-review-fail-review',
      proof: { source: 'v8_daemon_tick_loop', step: 'review_fail_closeout', target: 'review_task', verdict: 'fail' },
    });
    expect(JSON.parse(review.rework_json || '{}')).toMatchObject({ verdict: 'fail', closed_by: 'v8_daemon_tick_loop', outcome: 'retry_ready' });

    const secondTick = await daemon.tick();
    expect(secondTick.steps.find((step) => step.name === 'review')?.details).not.toContain('review-fail-retry:task-r5-review-fail-original:task-r5-review-fail-review');
    await expect(prisma.review.count({ where: { project_id: 'project-r5-review-fail-retry', original_task_id: 'task-r5-review-fail-original' } })).resolves.toBe(1);
  });

  test('daemon trips review FAIL loop breaker on second fail before exhausting max retries', async () => {
    const { V8DaemonTickLoop } = await import('../../src/daemon/v8_tick_loop');
    await prisma.project.createMany({
      data: [
        { id: 'project-r5-review-fail-loop', name: 'project-r5-review-fail-loop', status: 'active' },
        { id: 'project-r5-review-fail-loop-other', name: 'project-r5-review-fail-loop-other', status: 'active' },
      ],
    });
    await prisma.task.createMany({
      data: [
        {
          id: 'task-r5-review-fail-loop-original',
          project_id: 'project-r5-review-fail-loop',
          title: 'Original pm audit task after first rework',
          objective: 'Second review fail should enter PM gate/blocked instead of retry loop',
          lane_required: 'DEV',
          status: 'review_pending',
          acceptance_mode: 'pm_audit',
          reviewer: 'shun-designer-1',
          retry_count: 1,
          max_retries: 3,
        },
        {
          id: 'task-r5-review-fail-loop-review',
          project_id: 'project-r5-review-fail-loop',
          title: 'Review: second fail loop breaker',
          objective: 'Reviewer says changes-requested again with structured proof',
          lane_required: 'REVIEW',
          status: 'completion_pending',
          acceptance_mode: 'reviewer_verdict',
          reviewer: 'shun-designer-1',
          proof_data: JSON.stringify({ verdict: 'changes-requested', reason: 'same scope failed after one retry' }),
        },
        {
          id: 'task-r5-review-fail-loop-other-original',
          project_id: 'project-r5-review-fail-loop-other',
          title: 'Other project second fail original',
          objective: 'Must remain review_pending',
          lane_required: 'DEV',
          status: 'review_pending',
          acceptance_mode: 'pm_audit',
          reviewer: 'shun-designer-1',
          retry_count: 1,
          max_retries: 3,
        },
      ],
    });
    await prisma.review.createMany({
      data: [
        {
          project_id: 'project-r5-review-fail-loop',
          original_task_id: 'task-r5-review-fail-loop-original',
          review_task_id: 'task-r5-review-fail-loop-review',
          reviewer_agent_id: 'shun-designer-1',
          status: 'running',
          rework_json: JSON.stringify({ source_task: { task_id: 'task-r5-review-fail-loop-original' }, previous_outcome: 'retry_ready' }),
        },
        {
          project_id: 'project-r5-review-fail-loop-other',
          original_task_id: 'task-r5-review-fail-loop-other-original',
          review_task_id: 'task-r5-review-fail-loop-review',
          reviewer_agent_id: 'shun-designer-1',
          status: 'running',
          rework_json: JSON.stringify({ source_task: { task_id: 'task-r5-review-fail-loop-other-original' } }),
        },
      ],
    });

    const daemon = new V8DaemonTickLoop({ prisma, project_id: 'project-r5-review-fail-loop' });
    const result = await daemon.tick();

    expect(result.steps.find((step) => step.name === 'review')?.details).toContain('review-fail-loop-breaker:task-r5-review-fail-loop-original:task-r5-review-fail-loop-review');
    const original = await prisma.task.findFirstOrThrow({ where: { project_id: 'project-r5-review-fail-loop', id: 'task-r5-review-fail-loop-original' } });
    const reviewTask = await prisma.task.findFirstOrThrow({ where: { project_id: 'project-r5-review-fail-loop', id: 'task-r5-review-fail-loop-review' } });
    const review = await prisma.review.findFirstOrThrow({ where: { project_id: 'project-r5-review-fail-loop', original_task_id: 'task-r5-review-fail-loop-original' } });
    const otherOriginal = await prisma.task.findFirstOrThrow({ where: { project_id: 'project-r5-review-fail-loop-other', id: 'task-r5-review-fail-loop-other-original' } });
    const otherReview = await prisma.review.findFirstOrThrow({ where: { project_id: 'project-r5-review-fail-loop-other', original_task_id: 'task-r5-review-fail-loop-other-original' } });
    expect(original.status).toBe('blocked');
    expect(original.retry_count).toBe(2);
    expect(reviewTask.status).toBe('completed');
    expect(review.status).toBe('changes_requested');
    expect(JSON.parse(original.proof_data || '{}')).toMatchObject({
      event: 'block',
      from_status: 'review_pending',
      to_status: 'blocked',
      proof: { source: 'v8_daemon_tick_loop', step: 'review_fail_closeout', target: 'original_task', verdict: 'fail', outcome: 'blocked', gate: 'pm_gate' },
    });
    expect(JSON.parse(review.rework_json || '{}')).toMatchObject({ verdict: 'fail', outcome: 'blocked', gate: 'pm_gate', loop_breaker: true, retry_count: 2, max_retries: 3 });
    expect(otherOriginal.status).toBe('review_pending');
    expect(otherReview.status).toBe('running');
  });

  test('daemon sends reviewer FAIL to dead_letter when original retry budget is exhausted', async () => {
    const { V8DaemonTickLoop } = await import('../../src/daemon/v8_tick_loop');
    await prisma.project.createMany({
      data: [
        { id: 'project-r5-review-fail-dead', name: 'project-r5-review-fail-dead', status: 'active' },
        { id: 'project-r5-review-fail-dead-other', name: 'project-r5-review-fail-dead-other', status: 'active' },
      ],
    });
    await prisma.task.createMany({
      data: [
        {
          id: 'task-r5-review-fail-dead-original',
          project_id: 'project-r5-review-fail-dead',
          title: 'Original pm audit task exhausted',
          objective: 'Original should dead_letter after review FAIL at max retries',
          lane_required: 'DEV',
          status: 'review_pending',
          acceptance_mode: 'pm_audit',
          reviewer: 'shun-designer-1',
          retry_count: 2,
          max_retries: 2,
        },
        {
          id: 'task-r5-review-fail-dead-review',
          project_id: 'project-r5-review-fail-dead',
          title: 'Review: exhausted original',
          objective: 'Reviewer says FAIL with structured proof',
          lane_required: 'REVIEW',
          status: 'completion_pending',
          acceptance_mode: 'reviewer_verdict',
          reviewer: 'shun-designer-1',
          proof_data: JSON.stringify({ verdict: 'FAIL', reason: 'still failing after retry budget' }),
        },
        {
          id: 'task-r5-review-fail-dead-other-original',
          project_id: 'project-r5-review-fail-dead-other',
          title: 'Other project original',
          objective: 'Must remain review_pending',
          lane_required: 'DEV',
          status: 'review_pending',
          acceptance_mode: 'pm_audit',
          reviewer: 'shun-designer-1',
          retry_count: 2,
          max_retries: 2,
        },
      ],
    });
    await prisma.review.createMany({
      data: [
        {
          project_id: 'project-r5-review-fail-dead',
          original_task_id: 'task-r5-review-fail-dead-original',
          review_task_id: 'task-r5-review-fail-dead-review',
          reviewer_agent_id: 'shun-designer-1',
          status: 'running',
          rework_json: JSON.stringify({ source_task: { task_id: 'task-r5-review-fail-dead-original' } }),
        },
        {
          project_id: 'project-r5-review-fail-dead-other',
          original_task_id: 'task-r5-review-fail-dead-other-original',
          review_task_id: 'task-r5-review-fail-dead-review',
          reviewer_agent_id: 'shun-designer-1',
          status: 'running',
          rework_json: JSON.stringify({ source_task: { task_id: 'task-r5-review-fail-dead-other-original' } }),
        },
      ],
    });

    const daemon = new V8DaemonTickLoop({ prisma, project_id: 'project-r5-review-fail-dead' });
    const result = await daemon.tick();

    expect(result.steps.find((step) => step.name === 'review')?.details).toContain('review-fail-dead-letter:task-r5-review-fail-dead-original:task-r5-review-fail-dead-review');
    const original = await prisma.task.findFirstOrThrow({ where: { project_id: 'project-r5-review-fail-dead', id: 'task-r5-review-fail-dead-original' } });
    const reviewTask = await prisma.task.findFirstOrThrow({ where: { project_id: 'project-r5-review-fail-dead', id: 'task-r5-review-fail-dead-review' } });
    const review = await prisma.review.findFirstOrThrow({ where: { project_id: 'project-r5-review-fail-dead', original_task_id: 'task-r5-review-fail-dead-original' } });
    const otherOriginal = await prisma.task.findFirstOrThrow({ where: { project_id: 'project-r5-review-fail-dead-other', id: 'task-r5-review-fail-dead-other-original' } });
    const otherReview = await prisma.review.findFirstOrThrow({ where: { project_id: 'project-r5-review-fail-dead-other', original_task_id: 'task-r5-review-fail-dead-other-original' } });
    expect(original.status).toBe('dead_letter');
    expect(original.retry_count).toBe(2);
    expect(reviewTask.status).toBe('completed');
    expect(review.status).toBe('changes_requested');
    expect(JSON.parse(original.proof_data || '{}')).toMatchObject({
      event: 'dead_letter',
      from_status: 'review_pending',
      to_status: 'dead_letter',
      proof: { source: 'v8_daemon_tick_loop', step: 'review_fail_closeout', target: 'original_task', verdict: 'fail', outcome: 'dead_letter' },
    });
    expect(JSON.parse(review.rework_json || '{}')).toMatchObject({ verdict: 'fail', closed_by: 'v8_daemon_tick_loop', outcome: 'dead_letter' });
    expect(otherOriginal.status).toBe('review_pending');
    expect(otherReview.status).toBe('running');
  });

  test('daemon gates review spawning when selected reviewer agent is inactive', async () => {
    const { V8DaemonTickLoop } = await import('../../src/daemon/v8_tick_loop');
    await prisma.project.create({ data: { id: 'project-r5-inactive-reviewer', name: 'project-r5-inactive-reviewer', status: 'active' } });
    await prisma.agent.createMany({
      data: [
        {
          id: 'agent-long-inactive-reviewer',
          agent_id: 'long-coder-1',
          project_id: 'project-r5-inactive-reviewer',
          endpoint: 'mock://long',
          lane: 'DEV',
          dialect: 'hermes',
          soul_prompt: '',
          tools_allowed: '[]',
          status: 'online',
        },
        {
          id: 'agent-shun-inactive-reviewer',
          agent_id: 'shun-designer-1',
          project_id: 'project-r5-inactive-reviewer',
          endpoint: 'mock://shun',
          lane: 'REVIEW',
          dialect: 'hermes',
          soul_prompt: '',
          tools_allowed: '[]',
          status: 'offline',
        },
      ],
    });
    await prisma.task.create({
      data: {
        id: 'task-r5-inactive-reviewer',
        project_id: 'project-r5-inactive-reviewer',
        title: 'Inactive reviewer must be gated',
        objective: 'Do not create review task for offline reviewer',
        lane_required: 'DEV',
        status: 'completion_pending',
        acceptance_mode: 'pm_audit',
        reviewer: 'shun-designer-1',
      },
    });
    await prisma.run.create({
      data: {
        run_id: 'run-r5-inactive-reviewer',
        project_id: 'project-r5-inactive-reviewer',
        task_id: 'task-r5-inactive-reviewer',
        agent_id: 'agent-long-inactive-reviewer',
        idempotency_key: 'project-r5-inactive-reviewer:task-r5-inactive-reviewer:agent-long-inactive-reviewer',
        status: 'success',
        ended_at: new Date(),
      },
    });

    const daemon = new V8DaemonTickLoop({ prisma, project_id: 'project-r5-inactive-reviewer' });
    const result = await daemon.tick();

    expect(result.review_task_ids).toHaveLength(0);
    expect(result.steps.find((step) => step.name === 'review')?.details).toContain('review-gated:task-r5-inactive-reviewer:inactive_reviewer');
    await expect(prisma.task.findFirst({ where: { project_id: 'project-r5-inactive-reviewer', lane_required: 'REVIEW' } })).resolves.toBeNull();
    const sourceTask = await prisma.task.findFirstOrThrow({ where: { project_id: 'project-r5-inactive-reviewer', id: 'task-r5-inactive-reviewer' } });
    expect(sourceTask.status).toBe('completion_pending');
    const review = await prisma.review.findFirstOrThrow({ where: { project_id: 'project-r5-inactive-reviewer', original_task_id: 'task-r5-inactive-reviewer' } });
    expect(review.review_task_id).toBeNull();
    expect(review.status).toBe('blocked');
    expect(JSON.parse(review.rework_json || '{}')).toMatchObject({ gate: 'reviewer_policy_required', reason: 'inactive_reviewer', reviewer_agent_id: 'shun-designer-1', reviewer_status: 'offline' });
  });
});
