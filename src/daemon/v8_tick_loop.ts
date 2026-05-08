import { PrismaClient } from '@prisma/client';
import { V8RuntimeApiService } from '../services/v8_runtime_api_service';
import { transitionTask } from '../services/v8_transition_task_service';

export type V8DaemonStepName = 'claim' | 'dispatch' | 'ingest' | 'review' | 'closeout';

export interface V8DaemonStepResult {
  name: V8DaemonStepName;
  ok: boolean;
  count: number;
  details: string[];
}

export interface V8DaemonDispatchPayload {
  project_id: string;
  task: {
    id: string;
    title: string;
    objective: string;
    lane_required: string;
    acceptance_mode: string | null;
    reviewer: string | null;
  };
  agent: {
    id: string;
    agent_id: string;
    endpoint: string;
    lane: string;
    dialect: string;
  };
  run_id: string;
  lease: V8RunLease;
}

export interface V8RunLease {
  lease_token: string;
  lease_ttl_ms: number;
  lease_expires_at: string;
}

export interface V8DaemonWorkerDispatchResult {
  worker_run_id?: string;
}

export interface V8DaemonWorkerResult {
  project_id: string;
  task_id: string;
  worker_run_id?: string;
  lease_token?: string;
  summary?: string;
  proof: Record<string, unknown>;
}

export interface V8DaemonWorkerClient {
  dispatch(payload: V8DaemonDispatchPayload): Promise<V8DaemonWorkerDispatchResult | void>;
  drainResults(projectId: string): Promise<V8DaemonWorkerResult[]>;
}

export interface V8DaemonTickLoopOptions {
  prisma: PrismaClient;
  project_id: string;
  workerClient?: V8DaemonWorkerClient;
  stepObserver?: (step: V8DaemonStepName) => void;
  leaseTtlMs?: number;
  staleRunMs?: number;
  now?: () => Date;
}

export interface V8DaemonTickResult {
  project_id: string;
  steps: V8DaemonStepResult[];
  claimed_task_ids: string[];
  dispatched_task_ids: string[];
  ingested_task_ids: string[];
  review_task_ids: string[];
  closeout: { archived_group_ids: string[]; group_summary_report_ids: string[] };
  recovered_stale_task_ids: string[];
}

const TERMINAL_TASK_STATUSES = ['completed', 'blocked', 'dead_letter', 'cancelled'];
const DEFAULT_LEASE_TTL_MS = 15 * 60 * 1000;
const DEFAULT_STALE_RUN_MS = 30 * 60 * 1000;

class NoopWorkerClient implements V8DaemonWorkerClient {
  async dispatch(): Promise<void> {}
  async drainResults(): Promise<V8DaemonWorkerResult[]> { return []; }
}

function json(value: unknown): string {
  return JSON.stringify(value);
}

function parseJsonObject(value: string | null): Record<string, unknown> {
  if (!value) return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function mergeJsonObject(value: string | null, patch: Record<string, unknown>): string {
  return json({ ...parseJsonObject(value), ...patch });
}

export class V8DaemonTickLoop {
  private readonly runtime: V8RuntimeApiService;
  private readonly workerClient: V8DaemonWorkerClient;
  private readonly leaseTtlMs: number;
  private readonly staleRunMs: number;
  private readonly now: () => Date;

  constructor(private readonly options: V8DaemonTickLoopOptions) {
    this.runtime = new V8RuntimeApiService(options.prisma);
    this.workerClient = options.workerClient ?? new NoopWorkerClient();
    this.leaseTtlMs = options.leaseTtlMs ?? DEFAULT_LEASE_TTL_MS;
    this.staleRunMs = options.staleRunMs ?? DEFAULT_STALE_RUN_MS;
    this.now = options.now ?? (() => new Date());
  }

  async tick(): Promise<V8DaemonTickResult> {
    const result: V8DaemonTickResult = {
      project_id: this.options.project_id,
      steps: [],
      claimed_task_ids: [],
      dispatched_task_ids: [],
      ingested_task_ids: [],
      review_task_ids: [],
      closeout: { archived_group_ids: [], group_summary_report_ids: [] },
      recovered_stale_task_ids: [],
    };

    const recovered = await this.recoverStaleRuns();
    result.recovered_stale_task_ids = recovered.taskIds;

    const claimed = await this.runStep('claim', result.steps, () => this.claimReadyTasks());
    result.claimed_task_ids = claimed.taskIds;

    const dispatched = await this.runStep('dispatch', result.steps, () => this.dispatchClaimedTasks(claimed.tasks));
    result.dispatched_task_ids = dispatched.taskIds;

    const ingested = await this.runStep('ingest', result.steps, () => this.ingestWorkerResults());
    result.ingested_task_ids = ingested.taskIds;

    const reviewed = await this.runStep('review', result.steps, () => this.spawnReviewTasks());
    result.review_task_ids = reviewed.reviewTaskIds;

    const closeout = await this.runStep('closeout', result.steps, () => this.closeoutCompletedGroups());
    result.closeout = closeout;

    return result;
  }

  private async runStep<T extends { count: number; details: string[] }>(
    name: V8DaemonStepName,
    steps: V8DaemonStepResult[],
    fn: () => Promise<T>,
  ): Promise<T> {
    this.options.stepObserver?.(name);
    try {
      const output = await fn();
      steps.push({ name, ok: true, count: output.count, details: output.details });
      return output;
    } catch (error: any) {
      steps.push({ name, ok: false, count: 0, details: [error?.message ?? String(error)] });
      throw error;
    }
  }

  private async recoverStaleRuns(): Promise<{ taskIds: string[] }> {
    const cutoff = new Date(this.now().getTime() - this.staleRunMs);
    const staleRuns = await this.options.prisma.run.findMany({
      where: {
        project_id: this.options.project_id,
        status: 'running',
        started_at: { lt: cutoff },
        task: { project_id: this.options.project_id, status: { in: ['running', 'dispatched'] } },
      },
      orderBy: [{ started_at: 'asc' }, { run_id: 'asc' }],
      include: { task: true },
    });

    const recoveredTaskIds: string[] = [];
    for (const run of staleRuns) {
      const task = run.task;
      if (!task) continue;
      await this.runtime.updateRunStatus(this.options.project_id, run.run_id, 'error', {
        error_stack: `stale_takeover: run exceeded ${this.staleRunMs}ms lease window`,
        result_summary: run.result_summary ?? null,
      });
      await this.markTaskTakeoverAudit(task.id, task.ext_meta, {
        previous_run_id: run.run_id,
        previous_worker_run_id: run.worker_run_id,
        takeover_at: this.now().toISOString(),
      });
      if (task.status === 'running') {
        await transitionTask({ prisma: this.options.prisma }, {
          project_id: this.options.project_id,
          task_id: task.id,
          event: 'retry',
          proof: { source: 'v8_daemon_tick_loop', step: 'stale_takeover', previous_run_id: run.run_id },
        });
      } else {
        await transitionTask({ prisma: this.options.prisma }, {
          project_id: this.options.project_id,
          task_id: task.id,
          event: 'return_to_created',
          proof: { source: 'v8_daemon_tick_loop', step: 'stale_takeover', previous_run_id: run.run_id },
        });
      }
      await transitionTask({ prisma: this.options.prisma }, {
        project_id: this.options.project_id,
        task_id: task.id,
        event: 'dispatch',
        proof: { source: 'v8_daemon_tick_loop', step: 'stale_takeover_dispatch', previous_run_id: run.run_id },
      });
      recoveredTaskIds.push(task.id);
    }
    return { taskIds: Array.from(new Set(recoveredTaskIds)) };
  }

  private async markTaskTakeoverAudit(taskId: string, extMeta: string | null, staleTakeover: Record<string, unknown>): Promise<void> {
    const taskTable = this.options.prisma.task;
    await taskTable.updateMany({
      where: { project_id: this.options.project_id, id: taskId },
      data: { ext_meta: mergeJsonObject(extMeta, { stale_takeover: staleTakeover }) },
    });
  }

  private async claimReadyTasks(): Promise<{ count: number; details: string[]; taskIds: string[]; tasks: any[] }> {
    const tasks = await this.options.prisma.task.findMany({
      where: { project_id: this.options.project_id, status: { in: ['created', 'dispatched'] } },
      orderBy: [{ created_at: 'asc' }, { id: 'asc' }],
    });
    const claimedTasks: any[] = [];
    const details: string[] = [];

    for (const task of tasks) {
      const blocker = await this.options.prisma.taskDependency.findFirst({
        where: {
          project_id: this.options.project_id,
          task_id: task.id,
          target: { status: { not: 'completed' } },
        },
        select: { id: true },
      });
      if (blocker) {
        details.push(`blocked-by-dependency:${task.id}`);
        continue;
      }

      if (task.status === 'created') {
        await transitionTask({ prisma: this.options.prisma }, {
          project_id: this.options.project_id,
          task_id: task.id,
          event: 'dispatch',
          proof: { source: 'v8_daemon_tick_loop', step: 'claim' },
        });
      }
      const claimed = await this.options.prisma.task.findFirstOrThrow({ where: { project_id: this.options.project_id, id: task.id } });
      claimedTasks.push(claimed);
      details.push(`claimed:${task.id}`);
    }

    return { count: claimedTasks.length, details, taskIds: claimedTasks.map((task) => task.id), tasks: claimedTasks };
  }

  private createLease(taskId: string): V8RunLease {
    const issuedAt = this.now();
    return {
      lease_token: `${this.options.project_id}:${taskId}:${issuedAt.getTime()}:${Math.random().toString(36).slice(2)}`,
      lease_ttl_ms: this.leaseTtlMs,
      lease_expires_at: new Date(issuedAt.getTime() + this.leaseTtlMs).toISOString(),
    };
  }

  private async dispatchClaimedTasks(tasks: any[]): Promise<{ count: number; details: string[]; taskIds: string[] }> {
    const details: string[] = [];
    const dispatchedTaskIds: string[] = [];

    for (const task of tasks) {
      const agent = await this.options.prisma.agent.findFirst({
        where: {
          lane: task.lane_required,
          status: 'online',
          OR: [{ project_id: this.options.project_id }, { project_id: null }],
        },
        orderBy: { created_at: 'asc' },
      });

      if (!agent) {
        await transitionTask({ prisma: this.options.prisma }, {
          project_id: this.options.project_id,
          task_id: task.id,
          event: 'return_to_created',
          proof: { source: 'v8_daemon_tick_loop', step: 'dispatch', reason: 'no_online_agent' },
        });
        details.push(`no-agent:${task.id}`);
        continue;
      }

      const lease = this.createLease(task.id);
      const run = await this.runtime.createRun(this.options.project_id, {
        task_id: task.id,
        agent_id: agent.id,
        idempotency_key: `${this.options.project_id}:${task.id}:dispatch:${lease.lease_token}`,
        status: 'created',
        result_summary: json({ lease_token: lease.lease_token, lease_expires_at: lease.lease_expires_at }),
      });

      await this.runtime.updateRunStatus(this.options.project_id, run.run_id, 'running', {
        result_summary: json({ lease_token: lease.lease_token, lease_expires_at: lease.lease_expires_at, status: 'daemon dispatch started' }),
      });
      await transitionTask({ prisma: this.options.prisma }, {
        project_id: this.options.project_id,
        task_id: task.id,
        event: 'start',
        proof: { source: 'v8_daemon_tick_loop', step: 'dispatch', run_id: run.run_id, agent_id: agent.agent_id },
      });

      try {
        const workerResult = await this.workerClient.dispatch({
          project_id: this.options.project_id,
          task: {
            id: task.id,
            title: task.title,
            objective: task.objective,
            lane_required: task.lane_required,
            acceptance_mode: task.acceptance_mode,
            reviewer: task.reviewer,
          },
          agent: {
            id: agent.id,
            agent_id: agent.agent_id,
            endpoint: agent.endpoint,
            lane: agent.lane,
            dialect: agent.dialect,
          },
          run_id: run.run_id,
          lease,
        });
        const workerRunId = workerResult && 'worker_run_id' in workerResult ? workerResult.worker_run_id : undefined;
        if (workerRunId) {
          await this.options.prisma.run.updateMany({
            where: { project_id: this.options.project_id, run_id: run.run_id },
            data: { worker_run_id: workerRunId },
          });
        }
        dispatchedTaskIds.push(task.id);
        details.push(`dispatched:${task.id}:${agent.agent_id}`);
      } catch (error: any) {
        await this.runtime.updateRunStatus(this.options.project_id, run.run_id, 'error', { error_stack: error?.message ?? String(error) });
        await transitionTask({ prisma: this.options.prisma }, {
          project_id: this.options.project_id,
          task_id: task.id,
          event: 'retry',
          proof: { source: 'v8_daemon_tick_loop', step: 'dispatch', run_id: run.run_id, error: error?.message ?? String(error) },
        });
        details.push(`dispatch-error:${task.id}`);
      }
    }

    return { count: dispatchedTaskIds.length, details, taskIds: dispatchedTaskIds };
  }

  private async ingestWorkerResults(): Promise<{ count: number; details: string[]; taskIds: string[] }> {
    const workerResults = await this.workerClient.drainResults(this.options.project_id);
    const details: string[] = [];
    const ingestedTaskIds: string[] = [];

    for (const workerResult of workerResults) {
      if (workerResult.project_id !== this.options.project_id) {
        details.push(`ignored-cross-project:${workerResult.task_id}`);
        continue;
      }
      const task = await this.options.prisma.task.findFirst({ where: { project_id: this.options.project_id, id: workerResult.task_id } });
      if (!task || task.status !== 'running') {
        details.push(`ignored-not-running:${workerResult.task_id}`);
        continue;
      }
      const run = await this.findActiveRunForWorkerResult(workerResult);
      if (!run) {
        details.push(`ignored-stale-lease:${workerResult.task_id}`);
        continue;
      }

      await this.runtime.updateRunStatus(this.options.project_id, run.run_id, 'success', { result_summary: workerResult.summary ?? null });
      if (workerResult.worker_run_id && run.worker_run_id !== workerResult.worker_run_id) {
        await this.options.prisma.run.updateMany({
          where: { project_id: this.options.project_id, run_id: run.run_id },
          data: { worker_run_id: workerResult.worker_run_id },
        });
      }

      await transitionTask({ prisma: this.options.prisma }, {
        project_id: this.options.project_id,
        task_id: workerResult.task_id,
        event: 'submit_completion',
        proof: {
          source: 'v8_daemon_tick_loop',
          step: 'ingest',
          run_id: run?.run_id,
          worker_run_id: workerResult.worker_run_id,
          worker_proof: workerResult.proof,
        },
      });

      await this.runtime.createReport(this.options.project_id, {
        task_id: workerResult.task_id,
        run_id: run?.run_id ?? null,
        message_type: 'agent_result',
        status: 'pending',
        summary: workerResult.summary ?? null,
        payload_json: {
          project_id: this.options.project_id,
          task_id: workerResult.task_id,
          result: workerResult.summary ?? 'completed',
          proof: workerResult.proof,
          lease_token: workerResult.lease_token,
        },
      });

      ingestedTaskIds.push(workerResult.task_id);
      details.push(`ingested:${workerResult.task_id}`);
    }

    return { count: ingestedTaskIds.length, details, taskIds: ingestedTaskIds };
  }

  private async findActiveRunForWorkerResult(workerResult: V8DaemonWorkerResult) {
    const candidates = await this.options.prisma.run.findMany({
      where: { project_id: this.options.project_id, task_id: workerResult.task_id, status: 'running' },
      orderBy: [{ started_at: 'desc' }, { run_id: 'desc' }],
    });
    for (const run of candidates) {
      const summary = parseJsonObject(run.result_summary);
      const expectedLeaseToken = typeof summary.lease_token === 'string' ? summary.lease_token : undefined;
      if (expectedLeaseToken && workerResult.lease_token !== expectedLeaseToken) continue;
      if (workerResult.worker_run_id && run.worker_run_id && workerResult.worker_run_id !== run.worker_run_id) continue;
      return run;
    }
    return null;
  }

  private async completeStandardTaskFromDaemon(taskId: string, proof: Record<string, unknown>): Promise<void> {
    const taskTable = this.options.prisma.task;
    await taskTable.updateMany({
      where: { project_id: this.options.project_id, id: taskId, status: 'completion_pending' },
      data: { status: 'completed', proof_data: json({ event: 'daemon_auto_complete', project_id: this.options.project_id, task_id: taskId, proof }) },
    });
  }

  private async spawnReviewTasks(): Promise<{ count: number; details: string[]; reviewTaskIds: string[] }> {
    const tasks = await this.options.prisma.task.findMany({
      where: { project_id: this.options.project_id, status: 'completion_pending' },
      orderBy: [{ updated_at: 'asc' }, { id: 'asc' }],
    });
    const details: string[] = [];
    const reviewTaskIds: string[] = [];

    for (const task of tasks) {
      const mode = task.acceptance_mode ?? 'standard';
      if (mode !== 'pm_audit') {
        await this.completeStandardTaskFromDaemon(task.id, {
          source: 'v8_daemon_tick_loop',
          step: 'review',
          reason: 'non_pm_audit',
        });
        details.push(`auto-completed:${task.id}`);
        continue;
      }

      const existing = await this.options.prisma.review.findFirst({
        where: { project_id: this.options.project_id, original_task_id: task.id },
      });
      if (existing?.review_task_id) {
        await transitionTask({ prisma: this.options.prisma }, {
          project_id: this.options.project_id,
          task_id: task.id,
          event: 'request_review',
          proof: { source: 'v8_daemon_tick_loop', step: 'review', review_id: existing.id, review_task_id: existing.review_task_id },
        });
        reviewTaskIds.push(existing.review_task_id);
        details.push(`review-existing:${task.id}:${existing.review_task_id}`);
        continue;
      }

      const reviewer = task.reviewer ?? 'shun-designer-1';
      const reviewTask = await this.runtime.createTask(this.options.project_id, {
        title: `Review: ${task.title}`,
        objective: `Review task ${task.id} and return explicit PASS/FAIL proof.`,
        lane_required: 'REVIEW',
        status: 'created',
        payload: { original_task_id: task.id, reviewer, source: 'v8_daemon_tick_loop' },
        acceptance_mode: 'reviewer_verdict',
        reviewer,
        acceptance_criteria: ['explicit PASS/FAIL verdict', 'structured reviewer proof'],
      });

      const review = await this.options.prisma.review.create({
        data: {
          project_id: this.options.project_id,
          original_task_id: task.id,
          review_task_id: reviewTask.id,
          reviewer_agent_id: reviewer,
          status: 'created',
          rework_json: json({ source: 'v8_daemon_tick_loop', required_fields: ['verdict', 'reason', 'proof'] }),
        },
      });

      await transitionTask({ prisma: this.options.prisma }, {
        project_id: this.options.project_id,
        task_id: task.id,
        event: 'request_review',
        proof: { source: 'v8_daemon_tick_loop', step: 'review', review_id: review.id, review_task_id: reviewTask.id },
      });

      reviewTaskIds.push(reviewTask.id);
      details.push(`review-created:${task.id}:${reviewTask.id}`);
    }

    return { count: reviewTaskIds.length, details, reviewTaskIds };
  }

  private async closeoutCompletedGroups(): Promise<{ count: number; details: string[]; archived_group_ids: string[]; group_summary_report_ids: string[] }> {
    const groups = await this.options.prisma.taskGroup.findMany({
      where: { project_id: this.options.project_id, status: { not: 'archived' } },
      orderBy: [{ priority: 'asc' }, { created_at: 'asc' }],
    });
    const details: string[] = [];
    const archivedGroupIds: string[] = [];
    const reportIds: string[] = [];

    for (const group of groups) {
      const tasks = await this.options.prisma.task.findMany({
        where: { project_id: this.options.project_id, task_group_id: group.id },
        select: { id: true, status: true },
      });
      if (tasks.length === 0) {
        details.push(`group-empty:${group.group_id}`);
        continue;
      }
      if (!tasks.every((task) => TERMINAL_TASK_STATUSES.includes(task.status))) {
        details.push(`group-not-terminal:${group.group_id}`);
        continue;
      }

      const completed = tasks.filter((task) => task.status === 'completed').length;
      const blocked = tasks.filter((task) => task.status === 'blocked').length;
      const failed = tasks.filter((task) => task.status === 'dead_letter').length;
      const cancelled = tasks.filter((task) => task.status === 'cancelled').length;
      const extMeta = {
        ...parseJsonObject(group.ext_meta),
        closeout_source: 'v8_daemon_tick_loop',
        closed_at: new Date().toISOString(),
        total: tasks.length,
        completed,
        blocked,
        failed,
        cancelled,
      };

      await this.runtime.archiveTaskGroup(this.options.project_id, group.id, { ext_meta: extMeta });

      const existingSummary = await this.options.prisma.report.findFirst({
        where: {
          project_id: this.options.project_id,
          message_type: 'group_summary',
          status: 'sent',
          payload_json: { contains: `"group_id":"${group.group_id}"` },
        },
      });
      const report = existingSummary ?? await this.runtime.createReport(this.options.project_id, {
        message_type: 'group_summary',
        status: 'sent',
        summary: `Group ${group.group_id} closeout: ${completed}/${tasks.length} completed`,
        payload_json: {
          project_id: this.options.project_id,
          task_group_id: group.id,
          group_id: group.group_id,
          total: tasks.length,
          completed,
          blocked,
          failed,
          cancelled,
        },
        delivery_json: { source: 'v8_daemon_tick_loop', channel: 'runtime-proof' },
      });

      archivedGroupIds.push(group.group_id);
      reportIds.push(report.id);
      details.push(`group-archived:${group.group_id}`);
    }

    return {
      count: archivedGroupIds.length,
      details,
      archived_group_ids: archivedGroupIds,
      group_summary_report_ids: reportIds,
    };
  }
}
