import { execFileSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { PrismaClient } from '@prisma/client';
import {
  ArtifactRepository,
  ProjectRepository,
  ProjectCronjobRepository,
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
  let artifactRepo: ArtifactRepository;
  let reportRepo: ReportRepository;
  let cronjobRepo: ProjectCronjobRepository;

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
    artifactRepo = new ArtifactRepository(prisma);
    reportRepo = new ReportRepository(prisma);
    cronjobRepo = new ProjectCronjobRepository(prisma);
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


  test('ArtifactRepository writes report_proof with project/run/task scope and blocks cross-project delivery proof writes', async () => {
    const projectA = await projectRepo.create({ name: 'repo-artifact-project-a' });
    const projectB = await projectRepo.create({ name: 'repo-artifact-project-b' });
    const task = await taskRepo.create(projectA.id, {
      title: 'R6-T5 delivery proof task',
      objective: 'Persist report proof as a runtime artifact',
      lane_required: 'DEV',
    });
    const agent = await prisma.agent.create({
      data: {
        id: 'repo-artifact-agent-a',
        agent_id: 'repo-artifact-agent-a',
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
      dispatch_id: 'dispatch-artifact-a',
      idempotency_key: 'repo-artifact-run-a',
    });

    const artifact = await artifactRepo.create(projectA.id, {
      task_id: task.id,
      run_id: run.run_id,
      artifact_type: 'report_proof',
      path: `${projectA.id}:${run.run_id}:report-1`,
      payload: { report_id: 'report-1', status: 'sent' },
      proof: { delivery: 'telegram-message-id' },
      metadata_json: { dispatch_id: 'dispatch-artifact-a' },
    });

    expect(artifact.project_id).toBe(projectA.id);
    expect(artifact.task_id).toBe(task.id);
    expect(artifact.run_id).toBe(run.run_id);
    expect(artifact.artifact_type).toBe('report_proof');
    expect(JSON.parse(artifact.payload)).toMatchObject({ report_id: 'report-1', status: 'sent' });
    await expect(artifactRepo.getByPath(projectA.id, 'report_proof', `${projectA.id}:${run.run_id}:report-1`)).resolves.toMatchObject({ id: artifact.id });
    await expect(artifactRepo.getByPath(projectB.id, 'report_proof', `${projectA.id}:${run.run_id}:report-1`)).resolves.toBeNull();
    await expect(artifactRepo.create(projectB.id, {
      task_id: task.id,
      run_id: run.run_id,
      artifact_type: 'report_proof',
      payload: { report_id: 'cross-project' },
    })).rejects.toThrow(/not found/);
  });

  test('ProjectCronjobRepository binds cronjobs by project_id and blocks cross-project ownership changes', async () => {
    const projectA = await projectRepo.create({ name: 'repo-cron-project-a' });
    const projectB = await projectRepo.create({ name: 'repo-cron-project-b' });

    const cronjobA = await cronjobRepo.bind(projectA.id, {
      cronjob_id: 'tg-session-sync',
      name: 'Telegram session sync',
      schedule: '*/5 * * * *',
      status: 'active',
      owner_agent_id: 'long-coder-1',
      config_json: { prompt: 'sync current project only', toolsets: ['telegram'] },
    });
    const cronjobB = await cronjobRepo.bind(projectB.id, {
      cronjob_id: 'tg-session-sync',
      name: 'Telegram session sync B',
      schedule: '0 * * * *',
      status: 'paused',
      config_json: { prompt: 'other project' },
    });

    expect(cronjobA.project_id).toBe(projectA.id);
    expect(cronjobA.cronjob_id).toBe('tg-session-sync');
    expect(cronjobA.config_json).toBe(JSON.stringify({ prompt: 'sync current project only', toolsets: ['telegram'] }));
    expect(cronjobB.project_id).toBe(projectB.id);
    expect(cronjobB.id).not.toBe(cronjobA.id);

    await expect(cronjobRepo.get(projectA.id, 'tg-session-sync')).resolves.toMatchObject({ id: cronjobA.id, project_id: projectA.id });
    await expect(cronjobRepo.list(projectA.id)).resolves.toHaveLength(1);
    await expect(cronjobRepo.list(projectB.id)).resolves.toHaveLength(1);

    const paused = await cronjobRepo.updateStatus(projectA.id, 'tg-session-sync', 'paused');
    expect(paused.status).toBe('paused');
    await expect(cronjobRepo.updateStatus(projectB.id, cronjobA.id, 'active')).rejects.toThrow(/not found/);
    await expect(cronjobRepo.bind('missing-project', {
      cronjob_id: 'orphan-cron',
      name: 'Orphan Cron',
      schedule: '* * * * *',
    })).rejects.toThrow(/Project missing-project not found/);
    await expect(cronjobRepo.bind(projectA.id, {
      cronjob_id: 'bad-status',
      name: 'Bad Status',
      schedule: '* * * * *',
      status: 'running',
    })).rejects.toThrow(/Invalid cronjob status/);
  });

  test('ProjectCronjobRepository enforces enabled_policy and computes project-scoped eligibility', async () => {
    const activeProject = await projectRepo.create({ name: 'repo-cron-policy-active', status: 'active' });
    const archivedProject = await projectRepo.create({ name: 'repo-cron-policy-archived', status: 'archived' });

    await cronjobRepo.bind(activeProject.id, {
      cronjob_id: 'always-on-sync',
      name: 'Always On Sync',
      schedule: '*/5 * * * *',
      status: 'active',
      enabled_policy: 'always_on',
    });
    await cronjobRepo.bind(activeProject.id, {
      cronjob_id: 'project-active-sync',
      name: 'Project Active Sync',
      schedule: '*/10 * * * *',
      status: 'active',
      enabled_policy: 'project_active',
    });
    await cronjobRepo.bind(activeProject.id, {
      cronjob_id: 'manual-sync',
      name: 'Manual Sync',
      schedule: '0 * * * *',
      status: 'active',
      enabled_policy: 'manual',
    });
    await cronjobRepo.bind(activeProject.id, {
      cronjob_id: 'maintenance-sync',
      name: 'Maintenance Sync',
      schedule: '15 3 * * *',
      status: 'active',
      enabled_policy: 'maintenance_only',
    });
    await cronjobRepo.bind(archivedProject.id, {
      cronjob_id: 'archived-project-sync',
      name: 'Archived Project Sync',
      schedule: '*/5 * * * *',
      status: 'active',
      enabled_policy: 'project_active',
    });

    await expect(cronjobRepo.bind(activeProject.id, {
      cronjob_id: 'bad-policy',
      name: 'Bad Policy',
      schedule: '* * * * *',
      enabled_policy: 'telegram_session' as any,
    })).rejects.toThrow(/Invalid cronjob enabled_policy/);

    const defaultPolicy = await cronjobRepo.get(activeProject.id, 'always-on-sync');
    expect(defaultPolicy?.enabled_policy).toBe('always_on');

    await expect(cronjobRepo.listEligible(activeProject.id)).resolves.toEqual([
      expect.objectContaining({ cronjob_id: 'always-on-sync', enabled_policy: 'always_on' }),
      expect.objectContaining({ cronjob_id: 'project-active-sync', enabled_policy: 'project_active' }),
    ]);
    await expect(cronjobRepo.listEligible(activeProject.id, { maintenance: true })).resolves.toEqual([
      expect.objectContaining({ cronjob_id: 'always-on-sync' }),
      expect.objectContaining({ cronjob_id: 'project-active-sync' }),
      expect.objectContaining({ cronjob_id: 'maintenance-sync', enabled_policy: 'maintenance_only' }),
    ]);
    await expect(cronjobRepo.listEligible(archivedProject.id)).resolves.toHaveLength(0);
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
      dedupe_key: 'task-result-once',
    });
    const duplicate = await reportRepo.create(projectA.id, {
      task_id: task.id,
      message_type: 'agent_result',
      summary: 'Repository report duplicate should not be sent',
      payload_json: { result: 'duplicate' },
      dedupe_key: 'task-result-once',
    });
    const otherProjectDuplicate = await reportRepo.create(projectB.id, {
      message_type: 'agent_result',
      summary: 'Other project can reuse same dedupe key',
      payload_json: { result: 'other-project' },
      dedupe_key: 'task-result-once',
    });

    expect(report.project_id).toBe(projectA.id);
    expect(report.payload_json).toBe(JSON.stringify({ result: 'ok' }));
    expect(duplicate.id).toBe(report.id);
    expect(duplicate.summary).toBe(report.summary);
    expect(duplicate.payload_json).toBe(JSON.stringify({ result: 'ok' }));
    expect(otherProjectDuplicate.project_id).toBe(projectB.id);
    expect(otherProjectDuplicate.id).not.toBe(report.id);
    await expect(reportRepo.list(projectA.id, { dedupe_key: 'task-result-once' })).resolves.toHaveLength(1);
    await expect(reportRepo.get(projectA.id, report.id)).resolves.toMatchObject({ id: report.id });
    await expect(reportRepo.get(projectB.id, report.id)).resolves.toBeNull();
    await expect(reportRepo.list(projectB.id)).resolves.toHaveLength(1);
    await expect(reportRepo.updateStatus(projectB.id, report.id, 'sent')).rejects.toThrow(/not found/);

    await expect(reportRepo.updateStatus(projectA.id, report.id, 'sent', {
      delivery_json: { proof: 'telegram-message-id' },
    })).rejects.toThrow(/Illegal V8 report transition: pending -> sent/);

    const sending = await reportRepo.updateStatus(projectA.id, report.id, 'sending', {
      delivery_json: { channel: 'telegram', lock: 'send-lock-1' },
    });
    expect(sending.status).toBe('sending');
    expect(sending.delivery_json).toBe(JSON.stringify({ channel: 'telegram', lock: 'send-lock-1' }));

    const sent = await reportRepo.updateStatus(projectA.id, report.id, 'sent', {
      delivery_json: { proof: 'telegram-message-id' },
    });
    expect(sent.status).toBe('sent');
    expect(sent.delivery_json).toBe(JSON.stringify({ proof: 'telegram-message-id' }));

    await expect(reportRepo.updateStatus(projectA.id, report.id, 'pending')).rejects.toThrow(
      /Illegal V8 report transition: sent -> pending/,
    );
  });
});
