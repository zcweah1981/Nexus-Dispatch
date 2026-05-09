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
});
