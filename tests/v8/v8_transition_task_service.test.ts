import { execFileSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import request from 'supertest';
import { PrismaClient } from '@prisma/client';
import { createServer } from '../../src/api/server';
import { ProjectRepository, TaskRepository } from '../../src/repositories/v8';
import { transitionTask } from '../../src/services/v8_transition_task_service';

const repoRoot = path.resolve(__dirname, '../..');

function makeLegacyDalStub() {
  return {} as any;
}

describe('V8-R2 transitionTask service and Runtime API boundary', () => {
  let tmpDir: string;
  let prisma: PrismaClient;
  let projectRepo: ProjectRepository;
  let taskRepo: TaskRepository;

  beforeEach(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-v8-r2-transition-'));
    const dbPath = path.join(tmpDir, 'runtime-transition.db');
    execFileSync('npm', ['run', 'db:init:test', '--', dbPath], {
      cwd: repoRoot,
      encoding: 'utf8',
      env: { ...process.env, DATABASE_URL: undefined },
    });
    prisma = new PrismaClient({ datasources: { db: { url: `file:${dbPath}` } } });
    projectRepo = new ProjectRepository(prisma);
    taskRepo = new TaskRepository(prisma);
  }, 30000);

  afterEach(async () => {
    await prisma.$disconnect();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test('transitionTask requires project_id/task_id/event/proof, applies FSM transition, and writes structured proof artifact', async () => {
    const project = await projectRepo.create({ name: 'transition-service-project' });
    const task = await taskRepo.create(project.id, {
      title: 'Service transition task',
      objective: 'Move through V8 FSM service',
      lane_required: 'DEV',
    });
    const run = await prisma.run.create({
      data: {
        project_id: project.id,
        task_id: task.id,
        agent_id: await seedAgent(project.id),
        idempotency_key: `transition-service:${task.id}`,
        status: 'running',
      },
    });

    const result = await transitionTask(
      { prisma },
      {
        project_id: project.id,
        task_id: task.id,
        event: 'dispatch',
        proof: { actor: 'long-coder-1', command: 'service-contract', run_id: run.run_id },
      },
    );

    expect(result.task.status).toBe('dispatched');
    expect(result.audit.event).toBe('dispatch');
    expect(result.audit.from_status).toBe('created');
    expect(result.audit.to_status).toBe('dispatched');
    expect(result.audit.proof.actor).toBe('long-coder-1');

    const storedTask = await taskRepo.get(project.id, task.id);
    expect(storedTask?.status).toBe('dispatched');
    expect(JSON.parse(storedTask!.proof_data!)).toMatchObject({
      event: 'dispatch',
      from_status: 'created',
      to_status: 'dispatched',
      proof: { actor: 'long-coder-1', command: 'service-contract' },
    });

    const artifacts = await prisma.artifact.findMany({
      where: { project_id: project.id, task_id: task.id, artifact_type: 'task_transition_audit' },
    });
    expect(artifacts).toHaveLength(1);
    expect(JSON.parse(artifacts[0].payload_data!)).toMatchObject({
      project_id: project.id,
      task_id: task.id,
      event: 'dispatch',
      from_status: 'created',
      to_status: 'dispatched',
      proof: { run_id: run.run_id },
    });
    expect(JSON.parse(artifacts[0].metadata_json!)).toMatchObject({ source: 'v8_transition_task_service' });
  });

  test('transitionTask blocks cross-project reads, illegal FSM transitions, and cross-project run proof', async () => {
    const projectA = await projectRepo.create({ name: 'transition-project-a' });
    const projectB = await projectRepo.create({ name: 'transition-project-b' });
    const task = await taskRepo.create(projectA.id, {
      title: 'Cross project task',
      objective: 'Must remain scoped',
      lane_required: 'DEV',
    });
    const otherTask = await taskRepo.create(projectB.id, {
      title: 'Other project task',
      objective: 'Run proof must not cross projects',
      lane_required: 'DEV',
    });
    const otherRun = await prisma.run.create({
      data: {
        project_id: projectB.id,
        task_id: otherTask.id,
        agent_id: await seedAgent(projectB.id),
        idempotency_key: `transition-service:${otherTask.id}`,
        status: 'running',
      },
    });

    await expect(
      transitionTask({ prisma }, { project_id: projectB.id, task_id: task.id, event: 'dispatch', proof: { ok: true } }),
    ).rejects.toMatchObject({ statusCode: 404 });

    await expect(
      transitionTask({ prisma }, { project_id: projectA.id, task_id: task.id, event: 'auto_complete', proof: { ok: true } }),
    ).rejects.toMatchObject({ statusCode: 409 });

    await expect(
      transitionTask({ prisma }, { project_id: projectA.id, task_id: task.id, event: 'dispatch', proof: { run_id: otherRun.run_id } }),
    ).rejects.toMatchObject({ statusCode: 400, code: 'BAD_REQUEST' });

    await expect(taskRepo.get(projectA.id, task.id)).resolves.toMatchObject({ status: 'created' });
    await expect(prisma.artifact.findMany({ where: { task_id: task.id } })).resolves.toHaveLength(0);
  });

  test('forbids direct completed transition from worker/runtime states and requires completion_pending plus review gate', async () => {
    const project = await projectRepo.create({ name: 'transition-completed-gate-project' });
    const created = await taskRepo.create(project.id, {
      title: 'Created cannot complete directly',
      objective: 'Direct completion must be forbidden',
      lane_required: 'DEV',
    });
    const dispatched = await taskRepo.create(project.id, {
      title: 'Dispatched cannot complete directly',
      objective: 'Direct completion must be forbidden',
      lane_required: 'DEV',
    });
    const running = await taskRepo.create(project.id, {
      title: 'Running cannot complete directly',
      objective: 'Worker must submit completion pending first',
      lane_required: 'DEV',
    });
    const completionPending = await taskRepo.create(project.id, {
      title: 'Completion pending can request review',
      objective: 'Completion requires proof and review gate',
      lane_required: 'DEV',
    });
    await prisma.task.update({ where: { id: dispatched.id }, data: { status: 'dispatched' } });
    await prisma.task.update({ where: { id: running.id }, data: { status: 'running' } });
    await prisma.task.update({ where: { id: completionPending.id }, data: { status: 'completion_pending' } });

    for (const task of [created, dispatched, running]) {
      await expect(
        transitionTask({ prisma }, { project_id: project.id, task_id: task.id, event: 'auto_complete', proof: { actor: 'worker' } }),
      ).rejects.toMatchObject({ statusCode: 409, code: 'ILLEGAL_TRANSITION' });
      await expect(
        transitionTask({ prisma }, { project_id: project.id, task_id: task.id, event: 'review_pass', proof: { actor: 'api' } }),
      ).rejects.toMatchObject({ statusCode: 409, code: 'ILLEGAL_TRANSITION' });
    }

    await expect(taskRepo.get(project.id, created.id)).resolves.toMatchObject({ status: 'created' });
    await expect(taskRepo.get(project.id, dispatched.id)).resolves.toMatchObject({ status: 'dispatched' });
    await expect(taskRepo.get(project.id, running.id)).resolves.toMatchObject({ status: 'running' });

    await expect(
      transitionTask({ prisma }, { project_id: project.id, task_id: running.id, event: 'submit_completion', proof: { report_proof: 'ok' } }),
    ).resolves.toMatchObject({ task: expect.objectContaining({ status: 'completion_pending' }) });
    await expect(
      transitionTask({ prisma }, { project_id: project.id, task_id: completionPending.id, event: 'auto_complete', proof: { actor: 'worker' } }),
    ).rejects.toMatchObject({ statusCode: 409, code: 'ILLEGAL_TRANSITION' });

    const reviewGate = await transitionTask(
      { prisma },
      { project_id: project.id, task_id: completionPending.id, event: 'request_review', proof: { reviewer: 'shun-designer-1' } },
    );
    expect(reviewGate.task.status).toBe('review_pending');

    await expect(
      transitionTask({ prisma }, { project_id: project.id, task_id: completionPending.id, event: 'review_pass', proof: { reviewer: 'shun-designer-1' } }),
    ).resolves.toMatchObject({ task: expect.objectContaining({ status: 'completed' }) });
  });

  test('POST /api/v1/runtime/tasks/transition enforces body schema and project-scoped transition behavior', async () => {
    const project = await projectRepo.create({ name: 'transition-api-project' });
    const task = await taskRepo.create(project.id, {
      title: 'API transition task',
      objective: 'Move through Runtime API',
      lane_required: 'DEV',
    });
    await seedAgent(project.id);
    const app = createServer(makeLegacyDalStub(), 'test-token', { client: prisma } as any);

    await request(app)
      .post('/api/v1/runtime/tasks/transition')
      .set('Authorization', 'Bearer test-token')
      .send({ project_id: project.id, task_id: task.id, event: 'dispatch' })
      .expect(422);

    const ok = await request(app)
      .post('/api/v1/runtime/tasks/transition')
      .set('Authorization', 'Bearer test-token')
      .send({ project_id: project.id, task_id: task.id, event: 'dispatch', proof: { source: 'api-test' } })
      .expect(200);

    expect(ok.body.task).toMatchObject({ id: task.id, project_id: project.id, status: 'dispatched' });
    expect(ok.body.audit).toMatchObject({ event: 'dispatch', from_status: 'created', to_status: 'dispatched' });

    await request(app)
      .post('/api/v1/runtime/tasks/transition')
      .set('Authorization', 'Bearer test-token')
      .send({ project_id: project.id, task_id: task.id, event: 'dispatch', proof: { source: 'api-test' } })
      .expect(409);
  });

  test('POST /api/v1/runtime/tasks/transition rejects legacy task states before applying any state change', async () => {
    const project = await projectRepo.create({ name: 'transition-api-legacy-state-project' });
    const task = await taskRepo.create(project.id, {
      title: 'Legacy state must be rejected',
      objective: 'Legacy V7.x statuses cannot enter V8 Runtime API mainline',
      lane_required: 'DEV',
    });
    await prisma.task.update({ where: { id: task.id }, data: { status: 'validating' } });
    const app = createServer(makeLegacyDalStub(), 'test-token', { client: prisma } as any);

    await request(app)
      .post('/api/v1/runtime/tasks/transition')
      .set('Authorization', 'Bearer test-token')
      .send({ project_id: project.id, task_id: task.id, event: 'request_review', proof: { source: 'legacy-state-contract' } })
      .expect(409)
      .expect((res) => expect(res.body.code).toBe('ILLEGAL_TRANSITION'));

    await expect(taskRepo.get(project.id, task.id)).resolves.toMatchObject({ status: 'validating', proof_data: null });
    await expect(prisma.artifact.findMany({ where: { task_id: task.id } })).resolves.toHaveLength(0);
  });

  test('transitionTask source keeps task write scoped by project_id inside the transaction', () => {
    const serviceSource = fs.readFileSync(path.join(repoRoot, 'src/services/v8_transition_task_service.ts'), 'utf8');
    expect(serviceSource).toContain('tx.task.updateMany');
    expect(serviceSource).toContain('where: { id: input.task_id, project_id: input.project_id }');
    expect(serviceSource).not.toContain('tx.task.update({\n      where: { id: input.task_id }');
  });

  async function seedAgent(projectId: string): Promise<string> {
    const agent = await prisma.agent.create({
      data: {
        id: `agent-${projectId.slice(0, 8)}`,
        agent_id: `agent-${projectId.slice(0, 8)}`,
        project_id: projectId,
        endpoint: 'http://127.0.0.1/worker',
        lane: 'DEV',
        dialect: 'hermes',
        soul_prompt: '',
        tools_allowed: '[]',
        status: 'online',
      },
    });
    return agent.id;
  }
});
