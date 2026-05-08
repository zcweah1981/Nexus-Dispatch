import { execFileSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { PrismaClient } from '@prisma/client';
import {
  ProjectRepository,
  ReportRepository,
  RunRepository,
  TaskDependencyRepository,
  TaskRepository,
} from '../../src/repositories/v8';

const repoRoot = path.resolve(__dirname, '../..');

describe('V8-R1 Prisma Repository layer', () => {
  let tmpDir: string;
  let prisma: PrismaClient;
  let projectRepo: ProjectRepository;
  let taskRepo: TaskRepository;
  let dependencyRepo: TaskDependencyRepository;
  let runRepo: RunRepository;
  let reportRepo: ReportRepository;

  beforeEach(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-v8-r1-repo-'));
    const dbPath = path.join(tmpDir, 'repo-test.db');
    execFileSync('npm', ['run', 'db:init:test', '--', dbPath], {
      cwd: repoRoot,
      encoding: 'utf8',
      env: { ...process.env, DATABASE_URL: undefined },
    });
    prisma = new PrismaClient({ datasources: { db: { url: `file:${dbPath}` } } });
    projectRepo = new ProjectRepository(prisma);
    taskRepo = new TaskRepository(prisma);
    dependencyRepo = new TaskDependencyRepository(prisma);
    runRepo = new RunRepository(prisma);
    reportRepo = new ReportRepository(prisma);
  }, 30000);

  afterEach(async () => {
    await prisma.$disconnect();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test('ProjectRepository creates and reads project records', async () => {
    const created = await projectRepo.create({
      name: 'repo-happy-project',
      channel_config: { telegram_channel: 'dev-room' },
    });

    await expect(projectRepo.getById(created.id)).resolves.toMatchObject({
      id: created.id,
      name: 'repo-happy-project',
      channel_config: JSON.stringify({ telegram_channel: 'dev-room' }),
    });
    await expect(projectRepo.getByName('repo-happy-project')).resolves.toMatchObject({ id: created.id });
  });

  test('TaskRepository writes tasks under project scope and blocks cross-project reads and updates', async () => {
    const projectA = await projectRepo.create({ name: 'repo-task-project-a' });
    const projectB = await projectRepo.create({ name: 'repo-task-project-b' });
    const groupA = await prisma.taskGroup.create({
      data: { project_id: projectA.id, group_id: 'repo-task-group-a', name: 'Repo Task Group A' },
    });

    const task = await taskRepo.create(projectA.id, {
      title: 'Implement repository layer',
      objective: 'Use Prisma Client only',
      lane_required: 'DEV',
      task_group_id: groupA.id,
      payload: { item: 'happy-path' },
      acceptance_criteria: ['project scoped'],
      acceptance_mode: 'pm_audit',
    });

    expect(task.project_id).toBe(projectA.id);
    expect(task.task_group_id).toBe(groupA.id);
    await expect(taskRepo.get(projectA.id, task.id)).resolves.toMatchObject({ id: task.id });
    await expect(taskRepo.get(projectB.id, task.id)).resolves.toBeNull();
    await expect(taskRepo.list(projectB.id)).resolves.toHaveLength(0);
    await expect(taskRepo.updateStatus(projectB.id, task.id, 'completed')).rejects.toThrow(/not found/);

    const updated = await taskRepo.updateStatus(projectA.id, task.id, 'completion_pending', {
      proof_data: { ok: true },
    });
    expect(updated.status).toBe('completion_pending');
    expect(updated.proof_data).toBe(JSON.stringify({ ok: true }));
  });

  test('RunRepository writes project_id and enforces project isolation for reads and status updates', async () => {
    const projectA = await projectRepo.create({ name: 'repo-run-project-a' });
    const projectB = await projectRepo.create({ name: 'repo-run-project-b' });
    const task = await taskRepo.create(projectA.id, {
      title: 'Run repository task',
      objective: 'Create a project-scoped run',
      lane_required: 'DEV',
    });
    const agent = await prisma.agent.create({
      data: {
        id: 'repo-run-agent-a',
        agent_id: 'repo-run-agent-a',
        project_id: projectA.id,
        endpoint: 'http://127.0.0.1/worker',
        lane: 'DEV',
        dialect: 'hermes',
        soul_prompt: '',
        tools_allowed: '[]',
        status: 'online',
      },
    });

    const run = await runRepo.create(projectA.id, {
      task_id: task.id,
      agent_id: agent.id,
      dispatch_id: 'dispatch-a',
      worker_run_id: 'worker-run-a',
    });

    expect(run.project_id).toBe(projectA.id);
    expect(run.idempotency_key).toContain(task.id);
    await expect(runRepo.get(projectB.id, run.run_id)).resolves.toBeNull();
    await expect(runRepo.updateStatus(projectB.id, run.run_id, 'success')).rejects.toThrow(/not found/);

    const updated = await runRepo.updateStatus(projectA.id, run.run_id, 'success', {
      result_summary: 'done',
    });
    expect(updated.status).toBe('success');
    expect(updated.ended_at).toBeTruthy();
  });

  test('TaskDependencyRepository writes project_id and rejects cross-project dependency edges', async () => {
    const projectA = await projectRepo.create({ name: 'repo-dep-project-a' });
    const projectB = await projectRepo.create({ name: 'repo-dep-project-b' });
    const taskA1 = await taskRepo.create(projectA.id, {
      title: 'Project A target',
      objective: 'Dependency target in project A',
      lane_required: 'DEV',
    });
    const taskA2 = await taskRepo.create(projectA.id, {
      title: 'Project A source',
      objective: 'Dependency source in project A',
      lane_required: 'DEV',
    });
    const taskB = await taskRepo.create(projectB.id, {
      title: 'Project B target',
      objective: 'Must not be depended on from project A',
      lane_required: 'DEV',
    });

    const dep = await dependencyRepo.create(projectA.id, {
      task_id: taskA2.id,
      depends_on_id: taskA1.id,
      dependency_type: 'blocks',
    });

    expect(dep.project_id).toBe(projectA.id);
    await expect(dependencyRepo.listByTask(projectA.id, taskA2.id)).resolves.toHaveLength(1);
    await expect(dependencyRepo.listByTask(projectB.id, taskA2.id)).resolves.toHaveLength(0);
    await expect(
      dependencyRepo.create(projectA.id, {
        task_id: taskA2.id,
        depends_on_id: taskB.id,
        dependency_type: 'blocks',
      }),
    ).rejects.toThrow(/same project/);
  });


  test('ReportRepository writes project-scoped reports and blocks cross-project access', async () => {
    const projectA = await projectRepo.create({ name: 'repo-report-project-a' });
    const projectB = await projectRepo.create({ name: 'repo-report-project-b' });
    const task = await taskRepo.create(projectA.id, {
      title: 'Report repository task',
      objective: 'Create a project-scoped report',
      lane_required: 'DEV',
    });

    const report = await reportRepo.create(projectA.id, {
      task_id: task.id,
      message_type: 'agent_result',
      summary: 'Repository report created',
      payload_json: { result: 'ok' },
    });

    expect(report.project_id).toBe(projectA.id);
    expect(report.payload_json).toBe(JSON.stringify({ result: 'ok' }));
    await expect(reportRepo.get(projectA.id, report.id)).resolves.toMatchObject({ id: report.id });
    await expect(reportRepo.get(projectB.id, report.id)).resolves.toBeNull();
    await expect(reportRepo.list(projectB.id)).resolves.toHaveLength(0);
    await expect(reportRepo.updateStatus(projectB.id, report.id, 'sent')).rejects.toThrow(/not found/);

    const updated = await reportRepo.updateStatus(projectA.id, report.id, 'sent', {
      delivery_json: { proof: 'telegram-message-id' },
    });
    expect(updated.status).toBe('sent');
    expect(updated.delivery_json).toBe(JSON.stringify({ proof: 'telegram-message-id' }));
  });
});
