import { PrismaClient } from '@prisma/client';
import { V8RuntimeApiService } from '../services/v8_runtime_api_service';
import { evaluateReviewPolicy } from '../review/v8_review_policy';
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

type V8DaemonWorkerFetchResponse = {
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
  text(): Promise<string>;
};

type V8DaemonWorkerFetch = (url: string, init: { method: string; headers: Record<string, string>; body: string }) => Promise<V8DaemonWorkerFetchResponse>;

type V8ReviewerGateReason = 'self_review' | 'inactive_reviewer' | 'missing_reviewer_policy';
type V8ReviewVerdict = 'pass' | 'fail' | null;

interface V8ReviewerGateResult {
  ok: boolean;
  reason?: V8ReviewerGateReason;
  reviewer_status?: string | null;
}

export interface V8DaemonTickLoopOptions {
  prisma: PrismaClient;
  project_id: string;
  workerClient?: V8DaemonWorkerClient;
  workerFetch?: V8DaemonWorkerFetch;
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
  closeout: { archived_group_ids: string[]; group_summary_report_ids: string[]; details: string[] };
  recovered_stale_task_ids: string[];
}

const TERMINAL_TASK_STATUSES = ['completed', 'blocked', 'dead_letter', 'cancelled'];
const DEFAULT_LEASE_TTL_MS = 15 * 60 * 1000;
const DEFAULT_STALE_RUN_MS = 30 * 60 * 1000;

class NoopWorkerClient implements V8DaemonWorkerClient {
  async dispatch(): Promise<void> {}
  async drainResults(): Promise<V8DaemonWorkerResult[]> { return []; }
}

class OpenAICompatibleWorkerClient implements V8DaemonWorkerClient {
  constructor(private readonly doFetch: V8DaemonWorkerFetch) {}

  async dispatch(payload: V8DaemonDispatchPayload): Promise<V8DaemonWorkerDispatchResult> {
    const body = {
      model: payload.agent.dialect,
      messages: [
        { role: 'system', content: 'You are a Nexus Dispatch worker. Execute only the provided task and return structured proof.' },
        { role: 'user', content: JSON.stringify(payload) },
      ],
      metadata: {
        project_id: payload.project_id,
        task_id: payload.task.id,
        run_id: payload.run_id,
        agent_id: payload.agent.agent_id,
        lease_token: payload.lease.lease_token,
      },
    };
    const response = await this.doFetch(payload.agent.endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!response.ok) throw new Error(`worker_endpoint_error:${response.status}:${await response.text()}`);
    const parsed = await response.json();
    const candidate = parsed && typeof parsed === 'object' ? parsed as Record<string, unknown> : {};
    const workerRunId = typeof candidate.worker_run_id === 'string'
      ? candidate.worker_run_id
      : typeof candidate.id === 'string'
        ? candidate.id
        : undefined;
    return workerRunId ? { worker_run_id: workerRunId } : {};
  }

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

function parseJsonStringArray(value: string | null): string[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : [];
  } catch {
    return [];
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
    this.workerClient = options.workerClient ?? (options.workerFetch ? new OpenAICompatibleWorkerClient(options.workerFetch) : new NoopWorkerClient());
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
      closeout: { archived_group_ids: [], group_summary_report_ids: [], details: [] },
      recovered_stale_task_ids: [],
    };

    const recovered = await this.recoverStaleRuns();
    result.recovered_stale_task_ids = recovered.taskIds;

    const claimed = await this.runStep('claim', result.steps, () => this.claimReadyTasks(recovered.taskIds));
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
      const exhausted = task.retry_count >= task.max_retries;
      const nextRetryCount = exhausted ? task.retry_count : task.retry_count + 1;
      const outcome = exhausted ? 'dead_letter' : 'retry_ready';
      const recoveryProof = {
        source: 'v8_daemon_tick_loop',
        step: 'timeout_recovery',
        previous_run_id: run.run_id,
        previous_worker_run_id: run.worker_run_id,
        retry_count: nextRetryCount,
        max_retries: task.max_retries,
        outcome,
      };

      await this.runtime.updateRunStatus(this.options.project_id, run.run_id, 'error', {
        error_stack: `timeout_recovery: run exceeded ${this.staleRunMs}ms stale window`,
        result_summary: run.result_summary ?? null,
      });
      await this.markTaskTimeoutRecoveryAudit(task.id, task.ext_meta, {
        previous_run_id: run.run_id,
        previous_worker_run_id: run.worker_run_id,
        recovered_at: this.now().toISOString(),
        retry_count: nextRetryCount,
        max_retries: task.max_retries,
        outcome,
      });

      if (!exhausted) {
        const taskTable = this.options.prisma.task;
        await taskTable.updateMany({
          where: { project_id: this.options.project_id, id: task.id },
          data: { retry_count: nextRetryCount },
        });
      }

      if (task.status === 'running') {
        await transitionTask({ prisma: this.options.prisma }, {
          project_id: this.options.project_id,
          task_id: task.id,
          event: exhausted ? 'dead_letter' : 'retry',
          proof: recoveryProof,
        });
        recoveredTaskIds.push(task.id);
        continue;
      }

      if (!exhausted) {
        await transitionTask({ prisma: this.options.prisma }, {
          project_id: this.options.project_id,
          task_id: task.id,
          event: 'return_to_created',
          proof: recoveryProof,
        });
        await transitionTask({ prisma: this.options.prisma }, {
          project_id: this.options.project_id,
          task_id: task.id,
          event: 'dispatch',
          proof: { ...recoveryProof, step: 'timeout_recovery_ready' },
        });
      }
      recoveredTaskIds.push(task.id);
    }
    return { taskIds: Array.from(new Set(recoveredTaskIds)) };
  }

  private async markTaskTimeoutRecoveryAudit(taskId: string, extMeta: string | null, timeoutRecovery: Record<string, unknown>): Promise<void> {
    const taskTable = this.options.prisma.task;
    await taskTable.updateMany({
      where: { project_id: this.options.project_id, id: taskId },
      data: { ext_meta: mergeJsonObject(extMeta, { timeout_recovery: timeoutRecovery, stale_takeover: timeoutRecovery }) },
    });
  }

  private async claimReadyTasks(skipTaskIds: string[] = []): Promise<{ count: number; details: string[]; taskIds: string[]; tasks: any[] }> {
    const tasks = await this.options.prisma.task.findMany({
      where: { project_id: this.options.project_id, id: { notIn: skipTaskIds }, status: { in: ['created', 'dispatched', 'retry_ready'] } },
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
      if (task.status === 'retry_ready') {
        await transitionTask({ prisma: this.options.prisma }, {
          project_id: this.options.project_id,
          task_id: task.id,
          event: 'dispatch',
          proof: { source: 'v8_daemon_tick_loop', step: 'claim', reason: 'retry_ready_redelivery' },
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
        await this.recordWorkerDispatchProof(task, agent, run.run_id, lease, workerRunId);
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

  private async recordWorkerDispatchProof(task: any, agent: any, runId: string, lease: V8RunLease, workerRunId?: string): Promise<void> {
    const proof = {
      project_id: this.options.project_id,
      task_id: task.id,
      run_id: runId,
      worker_run_id: workerRunId ?? null,
      agent_id: agent.agent_id,
      agent_pk: agent.id,
      endpoint: agent.endpoint,
      dialect: agent.dialect,
      lane: agent.lane,
      lease_token: lease.lease_token,
      lease_expires_at: lease.lease_expires_at,
      dispatch_source: 'v8_daemon_tick_loop',
      dispatched_at: this.now().toISOString(),
    };

    await this.runtime.createReport(this.options.project_id, {
      task_id: task.id,
      run_id: runId,
      message_type: 'agent_dispatch',
      status: 'sent',
      summary: `Dispatched ${task.id} to registered endpoint ${agent.agent_id}`,
      payload_json: proof,
    });

    await this.options.prisma.artifact.create({
      data: {
        project_id: this.options.project_id,
        task_id: task.id,
        run_id: runId,
        artifact_type: 'worker_dispatch_proof',
        payload: json(proof),
        payload_data: json(proof),
        proof: json({ source: 'v8_daemon_tick_loop', event: 'worker_dispatch', ok: true }),
        path: agent.endpoint,
        metadata_json: json({ agent_id: agent.agent_id, worker_run_id: workerRunId ?? null }),
      },
    });
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

      const isReviewVerdictTask = task.lane_required === 'REVIEW' && task.acceptance_mode === 'reviewer_verdict';
      const existingWorkerProof = parseJsonObject(task.proof_data);
      await transitionTask({ prisma: this.options.prisma }, {
        project_id: this.options.project_id,
        task_id: workerResult.task_id,
        event: 'submit_completion',
        proof: {
          ...existingWorkerProof,
          source: 'v8_daemon_tick_loop',
          step: 'ingest',
          run_id: run?.run_id,
          worker_run_id: workerResult.worker_run_id,
          worker_proof: workerResult.proof,
          ...(isReviewVerdictTask ? { review_verdict: workerResult.proof, verdict: (workerResult.proof as Record<string, unknown>).verdict } : {}),
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
      await this.recordWorkerResultIngestProof(workerResult, run.run_id);

      ingestedTaskIds.push(workerResult.task_id);
      details.push(`ingested:${workerResult.task_id}`);
    }

    return { count: ingestedTaskIds.length, details, taskIds: ingestedTaskIds };
  }

  private async recordWorkerResultIngestProof(workerResult: V8DaemonWorkerResult, runId: string): Promise<void> {
    const idempotencyKey = [this.options.project_id, runId, workerResult.worker_run_id ?? 'no-worker-run', workerResult.lease_token ?? 'no-lease'].join(':');
    const existing = await this.options.prisma.artifact.findFirst({
      where: {
        project_id: this.options.project_id,
        task_id: workerResult.task_id,
        run_id: runId,
        artifact_type: 'worker_result_ingest',
        path: idempotencyKey,
      },
      select: { id: true },
    });
    if (existing) return;

    const proof = {
      project_id: this.options.project_id,
      task_id: workerResult.task_id,
      run_id: runId,
      worker_run_id: workerResult.worker_run_id ?? null,
      lease_token: workerResult.lease_token ?? null,
      idempotency_key: idempotencyKey,
      summary: workerResult.summary ?? null,
      worker_proof: workerResult.proof,
      ingested_at: this.now().toISOString(),
      source: 'v8_daemon_tick_loop',
    };
    await this.options.prisma.artifact.create({
      data: {
        project_id: this.options.project_id,
        task_id: workerResult.task_id,
        run_id: runId,
        artifact_type: 'worker_result_ingest',
        payload: json(proof),
        payload_data: json(proof),
        proof: json({ source: 'v8_daemon_tick_loop', event: 'worker_result_ingest', ok: true }),
        path: idempotencyKey,
        metadata_json: json({ worker_run_id: workerResult.worker_run_id ?? null, lease_token: workerResult.lease_token ?? null }),
      },
    });
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
    await transitionTask({ prisma: this.options.prisma }, {
      project_id: this.options.project_id,
      task_id: taskId,
      event: 'request_review',
      proof: { ...proof, transition_boundary: 'v8_transition_task_service', reason: 'non_pm_audit_auto_review_boundary' },
    });
    await transitionTask({ prisma: this.options.prisma }, {
      project_id: this.options.project_id,
      task_id: taskId,
      event: 'review_pass',
      proof: { ...proof, transition_boundary: 'v8_transition_task_service', reason: 'non_pm_audit_auto_complete_boundary' },
    });
  }

  private async validateReviewerGate(input: {
    reviewer: string;
    worker_agent_id?: string | null;
    policy_id: string | null;
    source: string;
  }): Promise<V8ReviewerGateResult> {
    if (input.worker_agent_id && input.reviewer === input.worker_agent_id) {
      return { ok: false, reason: 'self_review' };
    }
    const reviewerAgent = await this.options.prisma.agent.findFirst({
      where: {
        project_id: this.options.project_id,
        agent_id: input.reviewer,
        lane: 'REVIEW',
        status: 'online',
      },
      select: { status: true },
    });
    if (!reviewerAgent) {
      const inactive = await this.options.prisma.agent.findFirst({
        where: { project_id: this.options.project_id, agent_id: input.reviewer },
        select: { status: true },
      });
      if (!inactive && !input.policy_id && input.source === 'fallback') {
        return { ok: false, reason: 'missing_reviewer_policy', reviewer_status: null };
      }
      return { ok: false, reason: 'inactive_reviewer', reviewer_status: inactive?.status ?? null };
    }
    return { ok: true, reviewer_status: reviewerAgent.status };
  }

  private async recordReviewerGate(input: {
    task: any;
    reviewer: string;
    worker_agent_id?: string | null;
    policySnapshot: Record<string, unknown>;
    sourceTaskSnapshot: Record<string, unknown>;
    reason: V8ReviewerGateReason;
    reviewer_status?: string | null;
  }): Promise<void> {
    const reworkJson = json({
      source: 'v8_daemon_tick_loop',
      gate: 'reviewer_policy_required',
      reason: input.reason,
      reviewer_agent_id: input.reviewer,
      worker_agent_id: input.worker_agent_id ?? null,
      reviewer_status: input.reviewer_status ?? null,
      source_task: input.sourceTaskSnapshot,
      ...input.policySnapshot,
    });
    const existing = await this.options.prisma.review.findFirst({
      where: { project_id: this.options.project_id, original_task_id: input.task.id },
    });
    if (existing) {
      await this.options.prisma.review.updateMany({
        where: { project_id: this.options.project_id, id: existing.id },
        data: {
          reviewer_agent_id: input.reviewer,
          status: 'blocked',
          rework_json: reworkJson,
        },
      });
      return;
    }
    await this.options.prisma.review.create({
      data: {
        project_id: this.options.project_id,
        original_task_id: input.task.id,
        reviewer_agent_id: input.reviewer,
        status: 'blocked',
        rework_json: reworkJson,
      },
    });
  }

  private parseReviewVerdictFromTask(task: any): V8ReviewVerdict {
    const candidates: unknown[] = [task.proof_data, task.payload, task.objective, task.title];
    for (const candidate of candidates) {
      const verdict = this.parseReviewVerdict(candidate);
      if (verdict) return verdict;
    }
    return null;
  }

  private parseReviewVerdict(value: unknown): V8ReviewVerdict {
    if (!value) return null;
    if (typeof value === 'object') return this.parseReviewVerdictObject(value as Record<string, unknown>);
    if (typeof value !== 'string') return null;

    const trimmed = value.trim();
    if (!trimmed) return null;
    try {
      return this.parseReviewVerdictObject(JSON.parse(trimmed));
    } catch {
      const normalized = trimmed.toLowerCase();
      if (/\b(fail|failed|reject|rejected|changes[ _-]requested)\b/.test(normalized) || /不通过|未通过|退回|返工/.test(trimmed)) return 'fail';
      if (/\b(pass|passed|approve|approved)\b/.test(normalized) || /通过|审核通过/.test(trimmed)) return 'pass';
      return null;
    }
  }

  private parseReviewVerdictObject(value: Record<string, unknown>): V8ReviewVerdict {
    const directKeys = ['verdict', 'result', 'status', 'review_verdict', 'conclusion'];
    for (const key of directKeys) {
      const verdict = this.parseReviewVerdict(value[key]);
      if (verdict) return verdict;
    }
    const nestedKeys = ['proof', 'review', 'payload', 'reviewer_proof'];
    for (const key of nestedKeys) {
      const nested = value[key];
      if (nested && typeof nested === 'object' && !Array.isArray(nested)) {
        const verdict = this.parseReviewVerdictObject(nested as Record<string, unknown>);
        if (verdict) return verdict;
      }
    }
    return null;
  }

  private async closeFailedReview(review: any, reviewTask: any): Promise<{ detail: string; reviewTaskId: string }> {
    const originalTask = await this.options.prisma.task.findFirst({
      where: { project_id: this.options.project_id, id: review.original_task_id },
      select: { retry_count: true, max_retries: true },
    });
    if (!originalTask) throw new Error(`review_original_task_not_found:${review.original_task_id}`);
    const exhausted = originalTask.retry_count >= originalTask.max_retries;
    const secondFail = !exhausted && originalTask.retry_count >= 1;
    const outcome = exhausted ? 'dead_letter' : secondFail ? 'blocked' : 'retry_ready';
    const nextRetryCount = exhausted ? originalTask.retry_count : originalTask.retry_count + 1;
    const reworkPayload = {
      ...parseJsonObject(review.rework_json),
      verdict: 'fail',
      closed_by: 'v8_daemon_tick_loop',
      outcome,
      gate: secondFail ? 'pm_gate' : undefined,
      loop_breaker: secondFail || undefined,
      retry_count: nextRetryCount,
      max_retries: originalTask.max_retries,
    };
    const proof = {
      source: 'v8_daemon_tick_loop',
      step: 'review_fail_closeout',
      review_id: review.id,
      review_task_id: review.review_task_id,
      reviewer_agent_id: review.reviewer_agent_id,
      verdict: 'fail',
      outcome,
      retry_count: nextRetryCount,
      max_retries: originalTask.max_retries,
      rework: reworkPayload,
    };

    await transitionTask({ prisma: this.options.prisma }, {
      project_id: this.options.project_id,
      task_id: reviewTask.id,
      event: 'request_review',
      proof: { ...proof, target: 'review_task', reason: 'review_task_ready_for_fail_closeout' },
    });
    await transitionTask({ prisma: this.options.prisma }, {
      project_id: this.options.project_id,
      task_id: reviewTask.id,
      event: 'review_pass',
      proof: { ...proof, target: 'review_task' },
    });
    if (!exhausted) {
      await this.options.prisma.task.updateMany({
        where: { project_id: this.options.project_id, id: review.original_task_id, status: 'review_pending' },
        data: { retry_count: nextRetryCount },
      });
    }
    await transitionTask({ prisma: this.options.prisma }, {
      project_id: this.options.project_id,
      task_id: review.original_task_id,
      event: exhausted ? 'dead_letter' : secondFail ? 'block' : 'retry',
      proof: { ...proof, target: 'original_task', gate: secondFail ? 'pm_gate' : undefined },
    });
    await this.options.prisma.review.updateMany({
      where: { project_id: this.options.project_id, id: review.id },
      data: { status: 'changes_requested', rework_json: json(reworkPayload) },
    });
    return {
      detail: exhausted
        ? `review-fail-dead-letter:${review.original_task_id}:${reviewTask.id}`
        : secondFail
          ? `review-fail-loop-breaker:${review.original_task_id}:${reviewTask.id}`
          : `review-fail-retry:${review.original_task_id}:${reviewTask.id}`,
      reviewTaskId: reviewTask.id,
    };
  }

  private async closePassedReviews(): Promise<{ count: number; details: string[]; reviewTaskIds: string[] }> {
    const reviews = await this.options.prisma.review.findMany({
      where: {
        project_id: this.options.project_id,
        status: { in: ['created', 'dispatched', 'running'] },
        review_task_id: { not: null },
      },
      orderBy: [{ updated_at: 'asc' }, { id: 'asc' }],
    });
    const details: string[] = [];
    const closedReviewTaskIds: string[] = [];

    for (const review of reviews) {
      const reviewTask = await this.options.prisma.task.findFirst({
        where: { project_id: this.options.project_id, id: review.review_task_id ?? undefined },
      });
      if (!reviewTask || reviewTask.status !== 'completion_pending') {
        continue;
      }
      const verdict = this.parseReviewVerdictFromTask(reviewTask);
      if (!verdict) {
        details.push(`review-waiting-verdict:${review.review_task_id}`);
        continue;
      }
      if (verdict !== 'pass') {
        const failed = await this.closeFailedReview(review, reviewTask);
        closedReviewTaskIds.push(failed.reviewTaskId);
        details.push(failed.detail);
        continue;
      }

      const proof = {
        source: 'v8_daemon_tick_loop',
        step: 'review_pass_closeout',
        review_id: review.id,
        review_task_id: review.review_task_id,
        reviewer_agent_id: review.reviewer_agent_id,
        verdict: 'pass',
      };
      await transitionTask({ prisma: this.options.prisma }, {
        project_id: this.options.project_id,
        task_id: reviewTask.id,
        event: 'request_review',
        proof: { ...proof, target: 'review_task', reason: 'review_task_ready_for_pass' },
      });
      await transitionTask({ prisma: this.options.prisma }, {
        project_id: this.options.project_id,
        task_id: reviewTask.id,
        event: 'review_pass',
        proof: { ...proof, target: 'review_task' },
      });
      await transitionTask({ prisma: this.options.prisma }, {
        project_id: this.options.project_id,
        task_id: review.original_task_id,
        event: 'review_pass',
        proof: { ...proof, target: 'original_task' },
      });
      await this.options.prisma.review.updateMany({
        where: { project_id: this.options.project_id, id: review.id },
        data: { status: 'passed', rework_json: json({ ...parseJsonObject(review.rework_json), verdict: 'pass', closed_by: 'v8_daemon_tick_loop' }) },
      });
      closedReviewTaskIds.push(reviewTask.id);
      details.push(`review-pass-closed:${review.original_task_id}:${reviewTask.id}`);
    }

    return { count: closedReviewTaskIds.length, details, reviewTaskIds: closedReviewTaskIds };
  }

  private async spawnReviewTasks(): Promise<{ count: number; details: string[]; reviewTaskIds: string[] }> {
    const closed = await this.closePassedReviews();
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
        where: {
          project_id: this.options.project_id,
          original_task_id: task.id,
          status: { in: ['created', 'dispatched', 'running', 'blocked'] },
        },
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

      const latestRun = await this.options.prisma.run.findFirst({
        where: { project_id: this.options.project_id, task_id: task.id, status: 'success' },
        include: { agent: { select: { agent_id: true } } },
        orderBy: [{ ended_at: 'desc' }, { started_at: 'desc' }, { run_id: 'desc' }],
      });
      const policy = await evaluateReviewPolicy({ prisma: this.options.prisma }, {
        project_id: this.options.project_id,
        agent_id: latestRun?.agent.agent_id,
        lane: task.lane_required,
        fallback_reviewer: task.reviewer ?? 'shun-designer-1',
      });
      const reviewer = policy.reviewer_agent_id;
      const reviewPolicySnapshot = {
        policy_id: policy.policy_id,
        policy_source: policy.source,
        priority: policy.priority,
        policy_json: policy.policy_json,
      };
      const sourceAcceptanceCriteria = parseJsonStringArray(task.acceptance_criteria);
      const sourceTaskSnapshot = {
        task_id: task.id,
        lane_required: task.lane_required,
        acceptance_mode: mode,
        requested_reviewer: task.reviewer,
        acceptance_criteria: sourceAcceptanceCriteria,
      };
      const reviewerGate = await this.validateReviewerGate({
        reviewer,
        worker_agent_id: latestRun?.agent.agent_id,
        policy_id: policy.policy_id,
        source: policy.source,
      });
      if (!reviewerGate.ok) {
        await this.recordReviewerGate({
          task,
          reviewer,
          worker_agent_id: latestRun?.agent.agent_id,
          policySnapshot: reviewPolicySnapshot,
          sourceTaskSnapshot,
          reason: reviewerGate.reason!,
          reviewer_status: reviewerGate.reviewer_status,
        });
        details.push(`review-gated:${task.id}:${reviewerGate.reason}`);
        continue;
      }
      const reviewTask = await this.runtime.createTask(this.options.project_id, {
        title: `Review: ${task.title}`,
        objective: `Review task ${task.id} and return explicit PASS/FAIL proof.`,
        lane_required: 'REVIEW',
        status: 'created',
        payload: {
          original_task_id: task.id,
          reviewer,
          source: 'v8_daemon_tick_loop',
          source_task: sourceTaskSnapshot,
          review_policy: reviewPolicySnapshot,
        },
        acceptance_mode: 'reviewer_verdict',
        reviewer,
        acceptance_criteria: [
          `source lane: ${task.lane_required}`,
          `source acceptance_mode: ${mode}`,
          `requested reviewer: ${task.reviewer ?? 'none'}`,
          ...sourceAcceptanceCriteria,
          'explicit PASS/FAIL verdict',
          'structured reviewer proof',
        ],
      });

      const review = await this.options.prisma.review.create({
        data: {
          project_id: this.options.project_id,
          original_task_id: task.id,
          review_task_id: reviewTask.id,
          reviewer_agent_id: reviewer,
          status: 'created',
          rework_json: json({
            source: 'v8_daemon_tick_loop',
            required_fields: ['verdict', 'reason', 'proof'],
            source_task: sourceTaskSnapshot,
            ...reviewPolicySnapshot,
          }),
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

    return {
      count: closed.count + reviewTaskIds.length,
      details: [...closed.details, ...details],
      reviewTaskIds: [...closed.reviewTaskIds, ...reviewTaskIds],
    };
  }

  private async advanceNextPhaseAfterCloseout(group: any): Promise<{
    blueprint_id: string;
    phase_id: string;
    group_id: string;
    task_group_id: string;
    created_task_ids: string[];
  } | null> {
    const meta = parseJsonObject(group.ext_meta);
    const blueprintId = typeof meta.blueprint_id === 'string' ? meta.blueprint_id : undefined;
    const phaseId = typeof meta.phase_id === 'string' ? meta.phase_id : undefined;
    if (!blueprintId || !phaseId) return null;
    try {
      const advanced = await this.runtime.advancePhase({
        project_id: this.options.project_id,
        blueprint_id: blueprintId,
        from_phase_id: phaseId,
      });
      return advanced;
    } catch (error: any) {
      if (error?.code === 'NOT_FOUND') return null;
      throw error;
    }
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

      const nextPhase = await this.advanceNextPhaseAfterCloseout(group);
      if (nextPhase) {
        const payload = parseJsonObject(report.payload_json);
        await this.options.prisma.report.updateMany({
          where: { project_id: this.options.project_id, id: report.id },
          data: {
            payload_json: json({
              ...payload,
              next_phase: {
                blueprint_id: nextPhase.blueprint_id,
                phase_id: nextPhase.phase_id,
                group_id: nextPhase.group_id,
                task_group_id: nextPhase.task_group_id,
                created_task_ids: nextPhase.created_task_ids,
              },
            }),
          },
        });
        details.push(`next-phase-thawed:${nextPhase.group_id}`);
      }

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
