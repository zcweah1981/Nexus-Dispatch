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

    const workerResults = [
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

  test('daemon source is V8-only: no legacy DAL/ignored DB/raw SQL and state changes use transitionTask', () => {
    const source = fs.readFileSync(path.join(repoRoot, 'src/daemon/v8_tick_loop.ts'), 'utf8');
    expect(source).toContain('transitionTask(');
    expect(source).toContain('V8RuntimeApiService');
    expect(source).not.toMatch(/\.\.\/db\/dal|better-sqlite3|sqlite3|data\/nexus\.db|prisma\/data\/nexus\.db|\$queryRaw|\$executeRaw/i);
    expect(source).toContain('archiveTaskGroup(');
    expect(source).not.toMatch(/prisma\.task\.(update|updateMany)\([\s\S]*status\s*:/);
    expect(source).not.toMatch(/prisma\.taskGroup\.(update|updateMany)\([\s\S]*status\s*:/);
  });
});
