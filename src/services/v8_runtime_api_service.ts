import { PrismaClient } from '@prisma/client';
import { freezeV8Blueprint } from '../engine/v8_blueprint_freezer';
import { advanceV8Phase, thawV8CurrentPhase, V8BlueprintThawError } from '../engine/v8_blueprint_thaw';
import {
  AgentRegisterInput,
  AgentRepository,
  ArtifactCreateInput,
  ArtifactRepository,
  ProjectCreateInput,
  ProjectCronjobCreateInput,
  ProjectCronjobRepository,
  ProjectRepository,
  ProjectSettingsRepository,
  V8_SUPPORTED_VISIBLE_LANGUAGES,
  parseJsonObject,
  ReportCreateInput,
  ReportRepository,
  RunCreateInput,
  RunRepository,
  RunStatusUpdateInput,
  TaskCreateInput,
  TaskGroupRepository,
  TaskRepository,
} from '../repositories/v8';
import { ReviewPolicyRepository } from '../review/v8_review_policy';
import { transitionTask, TransitionTaskError, TransitionTaskEvent } from './v8_transition_task_service';

export class V8RuntimeApiError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'V8RuntimeApiError';
  }
}

function asNotFound(error: unknown, message: string): never {
  if (error instanceof V8RuntimeApiError) throw error;
  if (error instanceof V8BlueprintThawError) {
    throw new V8RuntimeApiError(error.statusCode, error.code, error.message, error.details);
  }
  throw new V8RuntimeApiError(404, 'NOT_FOUND', message, { cause: error instanceof Error ? error.message : String(error) });
}

function safeJson(value: string | null | undefined): Record<string, unknown> {
  return parseJsonObject(value);
}

function clampLimit(value?: number) {
  return Math.max(1, Math.min(value ?? 50, 200));
}

function redactText(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  return String(value)
    .replace(/Bearer\s+[^\s;]+/gi, 'Bearer [REDACTED]')
    .replace(/sk-[A-Za-z0-9_-]+/g, '[REDACTED]')
    .replace(/ghp_[A-Za-z0-9_]+/g, '[REDACTED]')
    .replace(/xoxb-[A-Za-z0-9-]+/g, '[REDACTED]')
    .replace(/\b\d{5,}:[A-Za-z0-9_-]+\b/g, '[REDACTED]')
    .replace(/-100\d{6,}/g, '[REDACTED]');
}

function redactDeep(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value === 'string') return redactText(value);
  if (Array.isArray(value)) return value.map(redactDeep);
  if (typeof value === 'object') {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, raw]) => {
      if (/token|secret|credential|chat_id|bot_token|database_url|db_path/i.test(key)) return [key, '[REDACTED]'];
      return [key, redactDeep(raw)];
    }));
  }
  return value;
}

function stripSensitiveKeys(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (Array.isArray(value)) return value.map(stripSensitiveKeys);
  if (typeof value === 'object') {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>)
      .filter(([key]) => !/token|secret|credential|chat_id|bot_token|database_url|db_path/i.test(key))
      .map(([key, raw]) => [key, stripSensitiveKeys(raw)]));
  }
  return value;
}

function endpointRef(endpoint: string | null | undefined) {
  const redacted = redactText(endpoint);
  if (!redacted) return null;
  try {
    const url = new URL(redacted);
    return `${url.protocol}//${url.host}${url.pathname}`;
  } catch {
    return redacted.length > 96 ? `${redacted.slice(0, 48)}…${redacted.slice(-16)}` : redacted;
  }
}

function countBy<T extends Record<string, any>>(items: T[], key: keyof T) {
  return items.reduce<Record<string, number>>((acc, item) => {
    const value = String(item[key] ?? 'unknown');
    acc[value] = (acc[value] ?? 0) + 1;
    return acc;
  }, {});
}

function redactProjectConfig(config: Record<string, unknown>) {
  const safeKeys = ['visible_language', 'repo_ref', 'public_docs_ref', 'governance_ref', 'dispatch_policy', 'review_policy', 'languages'];
  const result: Record<string, unknown> = {};
  for (const key of safeKeys) {
    if (config[key] !== undefined) result[key] = redactText(config[key]);
  }
  return result;
}

function safeProofSummary(...values: unknown[]) {
  for (const value of values) {
    const redacted = redactText(value);
    if (redacted && redacted.trim()) return redacted.slice(0, 240);
  }
  return 'Proof 已存系统';
}

export class V8RuntimeApiService {
  private readonly projects: ProjectRepository;
  private readonly agents: AgentRepository;
  private readonly tasks: TaskRepository;
  private readonly taskGroups: TaskGroupRepository;
  private readonly runs: RunRepository;
  private readonly artifacts: ArtifactRepository;
  private readonly cronjobs: ProjectCronjobRepository;
  private readonly settings: ProjectSettingsRepository;
  private readonly reviewPolicies: ReviewPolicyRepository;
  private readonly reports: ReportRepository;

  private async createAuditEvent(input: {
    project_id: string;
    action: string;
    actor: string;
    target_type: string;
    target_id?: string | null;
    reason?: string | null;
    before?: unknown;
    after?: unknown;
    metadata?: unknown;
    idempotency_key?: string | null;
  }) {
    await this.getProject(input.project_id);
    const data = {
      project_id: input.project_id,
      action: input.action,
      actor: redactText(input.actor) ?? 'unknown',
      target_type: input.target_type,
      target_id: input.target_id ?? undefined,
      reason: redactText(input.reason) ?? undefined,
      before_json: input.before === undefined ? undefined : JSON.stringify(redactDeep(input.before)),
      after_json: input.after === undefined ? undefined : JSON.stringify(redactDeep(input.after)),
      metadata_json: input.metadata === undefined ? undefined : JSON.stringify(redactDeep(input.metadata)),
      idempotency_key: input.idempotency_key ?? undefined,
    };
    try {
      return await this.prisma.auditEvent.create({ data });
    } catch (error: any) {
      if (input.idempotency_key && error?.code === 'P2002') {
        const existing = await this.prisma.auditEvent.findFirst({ where: { project_id: input.project_id, idempotency_key: input.idempotency_key } });
        if (existing) return existing;
      }
      throw error;
    }
  }

  private publicAuditEvent(event: any) {
    return {
      id: event.id,
      project_id: event.project_id,
      action: event.action,
      actor: event.actor,
      target_type: event.target_type,
      target_id: event.target_id,
      reason: event.reason,
      before: event.before_json ? stripSensitiveKeys(parseJsonObject(event.before_json)) : null,
      after: event.after_json ? stripSensitiveKeys(parseJsonObject(event.after_json)) : null,
      metadata: event.metadata_json ? stripSensitiveKeys(parseJsonObject(event.metadata_json)) : null,
      created_at: event.created_at,
    };
  }

  constructor(private readonly prisma: PrismaClient) {
    this.projects = new ProjectRepository(prisma);
    this.agents = new AgentRepository(prisma);
    this.tasks = new TaskRepository(prisma);
    this.taskGroups = new TaskGroupRepository(prisma);
    this.runs = new RunRepository(prisma);
    this.artifacts = new ArtifactRepository(prisma);
    this.cronjobs = new ProjectCronjobRepository(prisma);
    this.settings = new ProjectSettingsRepository(prisma);
    this.reviewPolicies = new ReviewPolicyRepository(prisma);
    this.reports = new ReportRepository(prisma, this.settings);
  }

  async createProject(input: ProjectCreateInput) {
    try {
      return await this.projects.create(input);
    } catch (error: any) {
      if (error?.code === 'P2002') {
        throw new V8RuntimeApiError(409, 'BAD_REQUEST', `Project with name '${input.name}' already exists`);
      }
      throw error;
    }
  }

  async getProject(projectId: string) {
    const project = await this.projects.getById(projectId);
    if (!project) throw new V8RuntimeApiError(404, 'NOT_FOUND', `Project '${projectId}' not found`);
    return project;
  }

  async registerAgent(projectId: string, input: AgentRegisterInput) {
    try {
      return await this.agents.registerAgent(projectId, input);
    } catch (error) {
      return asNotFound(error, `Agent could not be registered in project ${projectId}`);
    }
  }

  async getVisibleLanguage(projectId: string) {
    try {
      const visible_language = await this.settings.getVisibleLanguage(projectId);
      return { project_id: projectId, visible_language, supported: V8_SUPPORTED_VISIBLE_LANGUAGES };
    } catch (error: any) {
      const message = error instanceof Error ? error.message : String(error);
      if (/^Invalid visible language/.test(message)) {
        throw new V8RuntimeApiError(400, 'BAD_REQUEST', message, { project_id: projectId, supported: V8_SUPPORTED_VISIBLE_LANGUAGES });
      }
      return asNotFound(error, `Project '${projectId}' not found`);
    }
  }

  async updateVisibleLanguage(projectId: string, visibleLanguage: string) {
    try {
      const setting = await this.settings.updateVisibleLanguage(projectId, visibleLanguage);
      return { ...setting, supported: V8_SUPPORTED_VISIBLE_LANGUAGES };
    } catch (error: any) {
      const message = error instanceof Error ? error.message : String(error);
      if (/^Invalid visible language/.test(message)) {
        throw new V8RuntimeApiError(400, 'BAD_REQUEST', message, { project_id: projectId, supported: V8_SUPPORTED_VISIBLE_LANGUAGES });
      }
      return asNotFound(error, `Project '${projectId}' not found`);
    }
  }

  async listAgents(projectId: string, filters?: { lane?: string; status?: string; include_global?: boolean }) {
    await this.getProject(projectId);
    const agents = await this.agents.listAgents(projectId, filters);
    return agents.map((agent) => ({
      id: agent.id,
      project_id: agent.project_id,
      agent_id: agent.agent_id,
      lane: agent.lane,
      dialect: agent.dialect,
      status: agent.status,
      endpoint_display_ref: endpointRef(agent.endpoint),
      last_heartbeat: agent.last_heartbeat,
      created_at: agent.created_at,
    }));
  }

  async freezeBlueprint(input: { project_id: string; blueprint: unknown }) {
    await this.getProject(input.project_id);
    try {
      return await freezeV8Blueprint({ prisma: this.prisma, project_id: input.project_id, blueprint: input.blueprint });
    } catch (error) {
      return asNotFound(error, `Blueprint could not be frozen in project ${input.project_id}`);
    }
  }

  async listReviewPolicies(projectId: string, filters?: { enabled?: boolean; agent_id?: string | null; lane?: string | null }) {
    await this.getProject(projectId);
    return this.reviewPolicies.list(projectId, filters);
  }

  async createTask(projectId: string, input: TaskCreateInput) {
    await this.getProject(projectId);
    try {
      return await this.tasks.create(projectId, input);
    } catch (error) {
      return asNotFound(error, `Task could not be created in project ${projectId}`);
    }
  }

  async getTask(projectId: string, taskId: string) {
    const task = await this.tasks.get(projectId, taskId);
    if (!task) throw new V8RuntimeApiError(404, 'NOT_FOUND', `Task '${taskId}' not found in project '${projectId}'`);
    return task;
  }

  async listPendingTasks(projectId: string, filters?: { lane_required?: string }) {
    await this.getProject(projectId);
    const tasks = await this.tasks.list(projectId, {
      status: 'created',
      ...(filters?.lane_required ? { lane_required: filters.lane_required } : {}),
    });
    if (tasks.length === 0) return [];

    const deps = await this.prisma.taskDependency.findMany({
      where: { project_id: projectId, task_id: { in: tasks.map((task) => task.id) } },
      select: { task_id: true, depends_on_id: true },
    });
    const dependencyIds = Array.from(new Set(deps.map((dep) => dep.depends_on_id)));
    const dependencyStatuses = dependencyIds.length > 0
      ? await this.prisma.task.findMany({
          where: { project_id: projectId, id: { in: dependencyIds } },
          select: { id: true, status: true },
        })
      : [];
    const statusById = new Map(dependencyStatuses.map((task) => [task.id, task.status]));
    const depsByTask = new Map<string, string[]>();
    for (const dep of deps) {
      const list = depsByTask.get(dep.task_id) ?? [];
      list.push(dep.depends_on_id);
      depsByTask.set(dep.task_id, list);
    }

    return tasks.filter((task) => {
      const taskDeps = depsByTask.get(task.id) ?? [];
      return taskDeps.length === 0 || taskDeps.every((depId) => statusById.get(depId) === 'completed');
    });
  }

  async claimTask(projectId: string, taskId: string) {
    await this.getProject(projectId);
    const claimed = await this.prisma.$transaction(async (tx) => {
      const task = await tx.task.findFirst({ where: { id: taskId, project_id: projectId } });
      if (!task) return null;
      if (task.status !== 'created') return 'ALREADY_CLAIMED' as const;
      return tx.task.update({ where: { id: taskId }, data: { status: 'dispatched' } });
    });
    if (claimed === null) throw new V8RuntimeApiError(404, 'NOT_FOUND', `Task '${taskId}' not found in project '${projectId}'`);
    if (claimed === 'ALREADY_CLAIMED') throw new V8RuntimeApiError(409, 'BAD_REQUEST', `Task '${taskId}' is not in 'created' state`);
    return claimed;
  }

  async setTaskStatus(projectId: string, taskId: string, status: string, input?: { proof_data?: unknown; ext_meta?: unknown; retry_count?: number }) {
    try {
      return await this.tasks.updateStatus(projectId, taskId, status, input);
    } catch (error) {
      return asNotFound(error, `Task '${taskId}' not found in project '${projectId}'`);
    }
  }

  async controlledTaskAction(projectId: string, taskId: string, action: 'dispatch' | 'retry' | 'cancel', input: { actor: string; reason: string; idempotency_key?: string }) {
    const eventByAction: Record<typeof action, TransitionTaskEvent> = {
      dispatch: 'dispatch',
      retry: 'dispatch',
      cancel: 'cancel',
    };
    const before = await this.getTask(projectId, taskId);
    try {
      const result = await transitionTask({ prisma: this.prisma }, {
        project_id: projectId,
        task_id: taskId,
        event: eventByAction[action],
        proof: {
          source: 'r38_controlled_write_api',
          actor: input.actor,
          reason: redactText(input.reason),
          action,
        },
      });
      const audit = await this.createAuditEvent({
        project_id: projectId,
        action: `task.${action}`,
        actor: input.actor,
        target_type: 'task',
        target_id: taskId,
        reason: input.reason,
        before: { status: before.status },
        after: { status: result.task.status },
        metadata: { transition_audit_id: result.audit.audit_id },
        idempotency_key: input.idempotency_key,
      });
      return { task: result.task, audit_event: this.publicAuditEvent(audit) };
    } catch (error: any) {
      if (error instanceof TransitionTaskError) {
        throw new V8RuntimeApiError(error.statusCode, error.code, error.message, error.details);
      }
      throw error;
    }
  }

  async updateControlledSettings(projectId: string, input: Record<string, unknown> & { actor: string; reason: string; idempotency_key?: string }) {
    await this.getProject(projectId);
    const highRisk = ['db_path', 'database_url', 'DATABASE_URL', 'secrets', 'bot_token', 'chat_id', 'worker_credentials', 'worker_endpoint_credentials', 'runtime_internal_path', 'deployment_env'];
    const rejected = highRisk.filter((key) => Object.prototype.hasOwnProperty.call(input, key));
    if (rejected.length > 0) {
      throw new V8RuntimeApiError(400, 'HIGH_RISK_SETTING_REJECTED', 'High-risk settings are read-only through R38 controlled WebUI APIs', { rejected_count: rejected.length, rejected: 'high-risk fields redacted' });
    }
    const project = await this.getProject(projectId);
    const beforeConfig = safeJson(project.channel_config);
    const allowed = ['visible_language', 'display_name', 'docs_url', 'public_repo_url', 'enabled_lanes', 'proof_policy_display_rules', 'notification_quiet_mode'];
    const patch: Record<string, unknown> = {};
    for (const key of allowed) if (input[key] !== undefined) patch[key] = input[key];
    if (Object.keys(patch).length === 0) {
      throw new V8RuntimeApiError(400, 'BAD_REQUEST', 'No supported low-risk settings were provided');
    }
    if (patch.visible_language !== undefined) await this.settings.updateVisibleLanguage(projectId, String(patch.visible_language));
    const refreshed = await this.getProject(projectId);
    const currentConfig = safeJson(refreshed.channel_config);
    const nextConfig = { ...currentConfig, ...patch };
    await this.prisma.project.update({ where: { id: projectId }, data: { channel_config: JSON.stringify(nextConfig) } });
    const audit = await this.createAuditEvent({
      project_id: projectId,
      action: 'settings.update',
      actor: input.actor,
      target_type: 'project_settings',
      target_id: projectId,
      reason: input.reason,
      before: beforeConfig,
      after: nextConfig,
      metadata: { changed_fields: Object.keys(patch) },
      idempotency_key: input.idempotency_key,
    });
    return { settings: { project_id: projectId, ...stripSensitiveKeys(redactDeep(nextConfig)) as Record<string, unknown> }, audit_event: this.publicAuditEvent(audit) };
  }

  async listAuditEvents(projectId: string, filters?: { action?: string; target_type?: string; target_id?: string; limit?: number }) {
    await this.getProject(projectId);
    const events = await this.prisma.auditEvent.findMany({
      where: {
        project_id: projectId,
        ...(filters?.action ? { action: filters.action } : {}),
        ...(filters?.target_type ? { target_type: filters.target_type } : {}),
        ...(filters?.target_id ? { target_id: filters.target_id } : {}),
      },
      orderBy: { created_at: 'desc' },
      take: clampLimit(filters?.limit),
    });
    return events.map((event) => this.publicAuditEvent(event));
  }

  async listTasksForWebUI(projectId: string, filters?: { status?: string; lane_required?: string; task_group_id?: string; include_graph?: boolean; limit?: number }) {
    await this.getProject(projectId);
    const tasks = await this.prisma.task.findMany({
      where: {
        project_id: projectId,
        ...(filters?.status ? { status: filters.status } : {}),
        ...(filters?.lane_required ? { lane_required: filters.lane_required } : {}),
        ...(filters?.task_group_id ? { task_group_id: filters.task_group_id } : {}),
      },
      orderBy: [{ created_at: 'asc' }, { id: 'asc' }],
      take: clampLimit(filters?.limit),
      include: {
        taskGroup: { select: { id: true, group_id: true, name: true, status: true, ext_meta: true } },
        runs: { orderBy: { started_at: 'desc' }, take: 1, select: { run_id: true, agent_id: true, status: true, result_summary: true, started_at: true, ended_at: true } },
      },
    });
    const deps = filters?.include_graph
      ? await this.prisma.taskDependency.findMany({ where: { project_id: projectId }, select: { task_id: true, depends_on_id: true, dependency_type: true } })
      : [];
    const depsByTask = new Map<string, typeof deps>();
    for (const dep of deps) depsByTask.set(dep.task_id, [...(depsByTask.get(dep.task_id) ?? []), dep]);
    return tasks.map((task) => {
      const extMeta = safeJson(task.ext_meta);
      const groupMeta = safeJson(task.taskGroup?.ext_meta);
      return {
        id: task.id,
        project_id: task.project_id,
        title: task.title,
        objective: task.objective,
        lane_required: task.lane_required,
        status: task.status,
        task_group_id: task.task_group_id,
        group_id: task.taskGroup?.group_id ?? null,
        phase_id: groupMeta.phase_id ?? extMeta.phase_id ?? null,
        reviewer: task.reviewer,
        acceptance_mode: task.acceptance_mode,
        retry_count: task.retry_count,
        max_retries: task.max_retries,
        proof_summary: safeProofSummary(extMeta.proof_summary, task.runs[0]?.result_summary),
        latest_run: task.runs[0] ?? null,
        dependencies: filters?.include_graph ? (depsByTask.get(task.id) ?? []) : undefined,
        created_at: task.created_at,
        updated_at: task.updated_at,
      };
    });
  }

  async listTaskGroupsForWebUI(projectId: string, options?: { include_tasks?: boolean; limit?: number }) {
    await this.getProject(projectId);
    const groups = await this.prisma.taskGroup.findMany({
      where: { project_id: projectId },
      orderBy: [{ priority: 'asc' }, { created_at: 'asc' }],
      take: clampLimit(options?.limit),
      include: options?.include_tasks ? { tasks: { select: { id: true, title: true, status: true, lane_required: true } } } : undefined,
    });
    return groups.map((group) => ({
      id: group.id,
      project_id: group.project_id,
      group_id: group.group_id,
      name: group.name,
      description: group.description,
      status: group.status,
      priority: group.priority,
      phase_id: safeJson(group.ext_meta).phase_id ?? null,
      created_at: group.created_at,
      updated_at: group.updated_at,
      ...(options?.include_tasks ? { tasks: (group as any).tasks } : {}),
    }));
  }

  async getProjectSummary(projectId: string) {
    const project = await this.getProject(projectId);
    const [tasks, runs, reports, activeGroup] = await Promise.all([
      this.prisma.task.findMany({ where: { project_id: projectId }, select: { status: true } }),
      this.prisma.run.findMany({ where: { project_id: projectId }, select: { status: true } }),
      this.prisma.report.findMany({ where: { project_id: projectId }, select: { status: true } }),
      this.prisma.taskGroup.findFirst({ where: { project_id: projectId, status: { in: ['active', 'running'] } }, orderBy: { created_at: 'asc' } }),
    ]);
    const taskCounts = countBy(tasks, 'status');
    return {
      project: { id: project.id, name: project.name, status: project.status, created_at: project.created_at },
      lifecycle_stage: activeGroup ? 'dispatching' : (taskCounts.completed && taskCounts.completed === tasks.length ? 'completed' : 'created'),
      active_group: activeGroup ? { id: activeGroup.id, group_id: activeGroup.group_id, name: activeGroup.name, status: activeGroup.status } : null,
      task_counts_by_status: taskCounts,
      run_counts_by_status: countBy(runs, 'status'),
      report_counts_by_status: countBy(reports, 'status'),
      risk_flags: { blocked: taskCounts.blocked ?? 0, dead_letter: taskCounts.dead_letter ?? 0 },
      next_responsible: taskCounts.review_pending ? 'reviewer' : (taskCounts.running || taskCounts.dispatched ? 'worker' : 'pm'),
      health: { api: 'ok', data_source: 'runtime_api', project_scoped: true },
    };
  }

  async getDispatchLive(projectId: string, options?: { limit?: number }) {
    await this.getProject(projectId);
    const runs = await this.prisma.run.findMany({
      where: { project_id: projectId },
      orderBy: { started_at: 'desc' },
      take: clampLimit(options?.limit),
      select: { run_id: true, project_id: true, task_id: true, agent_id: true, status: true, result_summary: true, started_at: true, ended_at: true },
    });
    return { project_id: projectId, runs, active_runs: runs.filter((run) => ['created', 'running'].includes(run.status)), queue_depth: await this.prisma.task.count({ where: { project_id: projectId, status: { in: ['created', 'retry_ready'] } } }) };
  }

  async listReportsForWebUI(projectId: string, filters?: { message_type?: string; status?: string; task_id?: string; limit?: number }) {
    await this.getProject(projectId);
    const reports = await this.reports.list(projectId, filters);
    return reports.map((report) => ({
      id: report.id,
      project_id: report.project_id,
      task_id: report.task_id,
      run_id: report.run_id,
      message_type: report.message_type,
      status: report.status,
      summary: safeProofSummary(report.summary),
      created_at: report.created_at,
      updated_at: report.updated_at,
    }));
  }

  async listArtifactsForWebUI(projectId: string, filters?: { task_id?: string; run_id?: string; artifact_type?: string; limit?: number }) {
    await this.getProject(projectId);
    const artifacts = await this.artifacts.list(projectId, filters);
    return artifacts.map((artifact) => ({
      id: artifact.id,
      project_id: artifact.project_id,
      task_id: artifact.task_id,
      run_id: artifact.run_id,
      artifact_type: artifact.artifact_type,
      path: redactText(artifact.path),
      proof_summary: 'Proof 已存系统',
      created_at: artifact.created_at,
    }));
  }

  async getProjectSettingsForWebUI(projectId: string) {
    const project = await this.getProject(projectId);
    const config = safeJson(project.channel_config);
    return {
      project_id: projectId,
      project: { id: project.id, name: project.name, status: project.status, created_at: project.created_at },
      visible_language: await this.settings.getVisibleLanguage(projectId),
      supported_visible_languages: V8_SUPPORTED_VISIBLE_LANGUAGES,
      config: redactProjectConfig(config),
      policies: { cron_registry: 'readonly', review_policy: 'runtime_api', dispatch_policy: 'runtime_api' },
    };
  }

  async getProjectDirectoriesForWebUI(projectId: string) {
    const project = await this.getProject(projectId);
    const config = safeJson(project.channel_config);
    const dirs = safeJson(JSON.stringify(config.directories ?? {}));
    return {
      project_id: projectId,
      directories: Object.fromEntries(Object.entries(dirs).map(([key, value]) => [key, { ref: redactText(value), access: 'api-side-reference-only' }])),
      leak_summary: { direct_webui_filesystem_access: false, raw_private_paths_exposed: false },
    };
  }

  async getObservabilityForWebUI(projectId: string) {
    await this.getProject(projectId);
    const [queueDepth, blocked, deadLetter, failedRuns, agents] = await Promise.all([
      this.prisma.task.count({ where: { project_id: projectId, status: { in: ['created', 'retry_ready'] } } }),
      this.prisma.task.count({ where: { project_id: projectId, status: 'blocked' } }),
      this.prisma.task.count({ where: { project_id: projectId, status: 'dead_letter' } }),
      this.prisma.run.count({ where: { project_id: projectId, status: { in: ['failed', 'error'] } } }),
      this.agents.listAgents(projectId),
    ]);
    return {
      project_id: projectId,
      api: { status: 'ok' },
      daemon: { status: 'unavailable', fallback: 'demo-only/unavailable until daemon heartbeat endpoint lands' },
      queue_depth: queueDepth,
      failed_runs: failedRuns,
      blocked_tasks: blocked,
      dead_letter_tasks: deadLetter,
      worker_heartbeat: { online: agents.filter((agent) => agent.status === 'online').length, total: agents.length },
      db_lock_warning: false,
    };
  }

  async recoverTimeouts(projectId: string, timeoutMinutes: number) {
    await this.getProject(projectId);
    const cutoff = new Date(Date.now() - timeoutMinutes * 60 * 1000);
    const staleTasks = await this.prisma.task.findMany({
      where: {
        project_id: projectId,
        status: 'dispatched',
        runs: { some: { project_id: projectId, status: 'running', started_at: { lt: cutoff } } },
      },
      select: { id: true },
    });
    const recoveredIds: string[] = [];
    for (const task of staleTasks) {
      await this.prisma.$transaction(async (tx) => {
        await tx.task.updateMany({ where: { id: task.id, project_id: projectId }, data: { status: 'created' } });
        await tx.run.updateMany({
          where: { project_id: projectId, task_id: task.id, status: 'running' },
          data: { status: 'failed', error_stack: 'Timeout: recovered by daemon', ended_at: new Date() },
        });
      });
      recoveredIds.push(task.id);
    }
    return recoveredIds;
  }

  async thawCurrentPhase(input: { project_id: string; blueprint_id: string; phase_id?: string; group_id?: string }) {
    await this.getProject(input.project_id);
    try {
      return await thawV8CurrentPhase({ prisma: this.prisma, ...input });
    } catch (error) {
      return asNotFound(error, `Blueprint phase/group could not be thawed in project ${input.project_id}`);
    }
  }

  async advancePhase(input: { project_id: string; blueprint_id: string; from_phase_id?: string; from_group_id?: string }) {
    await this.getProject(input.project_id);
    try {
      return await advanceV8Phase({ prisma: this.prisma, ...input });
    } catch (error) {
      return asNotFound(error, `Blueprint phase could not advance in project ${input.project_id}`);
    }
  }

  async archiveTaskGroup(projectId: string, taskGroupId: string, input?: { ext_meta?: unknown }) {
    try {
      return await this.taskGroups.archive(projectId, taskGroupId, input);
    } catch (error) {
      return asNotFound(error, `TaskGroup '${taskGroupId}' not found in project '${projectId}'`);
    }
  }

  async createRun(projectId: string, input: RunCreateInput) {
    try {
      return await this.runs.create(projectId, input);
    } catch (error: any) {
      if (error?.code === 'P2002') {
        throw new V8RuntimeApiError(409, 'BAD_REQUEST', 'Duplicate idempotency_key');
      }
      return asNotFound(error, `Run could not be created in project ${projectId}`);
    }
  }

  async updateRunStatus(projectId: string, runId: string, status: string, input?: RunStatusUpdateInput) {
    try {
      return await this.runs.updateStatus(projectId, runId, status, input);
    } catch (error) {
      return asNotFound(error, `Run '${runId}' not found in project '${projectId}'`);
    }
  }

  async createArtifact(projectId: string, input: ArtifactCreateInput) {
    try {
      return await this.artifacts.create(projectId, input);
    } catch (error) {
      return asNotFound(error, `Artifact could not be created in project ${projectId}`);
    }
  }

  async getArtifactByPath(projectId: string, artifactType: string, path: string) {
    return this.artifacts.getByPath(projectId, artifactType, path);
  }

  async bindCronjob(projectId: string, input: ProjectCronjobCreateInput) {
    await this.getProject(projectId);
    try {
      return await this.cronjobs.bind(projectId, input);
    } catch (error: any) {
      if (/^Invalid cronjob status/.test(error instanceof Error ? error.message : String(error))) {
        throw new V8RuntimeApiError(400, 'BAD_REQUEST', error.message, { project_id: projectId, cronjob_id: input.cronjob_id });
      }
      if (error?.code === 'P2002') {
        throw new V8RuntimeApiError(409, 'BAD_REQUEST', `Cronjob '${input.cronjob_id}' already bound in project '${projectId}'`);
      }
      return asNotFound(error, `Cronjob could not be bound in project ${projectId}`);
    }
  }

  async listCronjobs(projectId: string, filters?: { status?: string; enabled_policy?: any }) {
    await this.getProject(projectId);
    return this.cronjobs.list(projectId, filters);
  }

  async listEligibleCronjobs(projectId: string, options?: { maintenance?: boolean }) {
    try {
      return await this.cronjobs.listEligible(projectId, options);
    } catch (error) {
      return asNotFound(error, `Cronjobs could not be listed in project ${projectId}`);
    }
  }

  async updateCronjobStatus(projectId: string, cronjobId: string, status: string, input?: { config_json?: unknown; last_run_at?: Date | null }) {
    await this.getProject(projectId);
    try {
      return await this.cronjobs.updateStatus(projectId, cronjobId, status, input);
    } catch (error: any) {
      if (/^Invalid cronjob status/.test(error instanceof Error ? error.message : String(error))) {
        throw new V8RuntimeApiError(400, 'BAD_REQUEST', error.message, { project_id: projectId, cronjob_id: cronjobId, status });
      }
      return asNotFound(error, `Cronjob '${cronjobId}' not found in project '${projectId}'`);
    }
  }

  async createReport(projectId: string, input: ReportCreateInput) {
    try {
      return await this.reports.create(projectId, input);
    } catch (error) {
      return asNotFound(error, `Report could not be created in project ${projectId}`);
    }
  }

  async updateReportStatus(projectId: string, reportId: string, status: string, input?: { delivery_json?: unknown }) {
    try {
      return await this.reports.updateStatus(projectId, reportId, status, input);
    } catch (error: any) {
      const message = error instanceof Error ? error.message : String(error);
      if (/^Illegal V8 report transition/.test(message)) {
        throw new V8RuntimeApiError(409, 'ILLEGAL_TRANSITION', message, { project_id: projectId, report_id: reportId, status });
      }
      if (/^Unknown V8 report status/.test(message)) {
        throw new V8RuntimeApiError(400, 'BAD_REQUEST', message, { project_id: projectId, report_id: reportId, status });
      }
      return asNotFound(error, `Report '${reportId}' not found in project '${projectId}'`);
    }
  }
}
