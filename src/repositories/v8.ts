import { Prisma, PrismaClient } from '@prisma/client';
import { assertV8TransitionAllowed, isV8State } from '../fsm/v8_state_matrix';
import { formatV8VisibleMessage } from '../reports/v8_visible_message_formatter';

export type JsonInput = Prisma.InputJsonValue | Record<string, unknown> | unknown[];

function stringifyJson(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined;
  return typeof value === 'string' ? value : JSON.stringify(value);
}

function terminalEndedAt(status: string): Date | undefined {
  return ['success', 'failed', 'error', 'cancelled'].includes(status) ? new Date() : undefined;
}

export interface ProjectCreateInput {
  id?: string;
  name: string;
  status?: string;
  pm_soul_prompt?: string | null;
  channel_config?: unknown;
}

export class ProjectRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async create(input: ProjectCreateInput) {
    return this.prisma.project.create({
      data: {
        ...(input.id ? { id: input.id } : {}),
        name: input.name,
        status: input.status ?? 'active',
        pm_soul_prompt: input.pm_soul_prompt ?? undefined,
        channel_config: stringifyJson(input.channel_config),
      },
    });
  }

  async getById(projectId: string) {
    return this.prisma.project.findUnique({ where: { id: projectId } });
  }

  async getByName(name: string) {
    return this.prisma.project.findUnique({ where: { name } });
  }

  async list(filters?: { status?: string }) {
    return this.prisma.project.findMany({
      where: filters?.status ? { status: filters.status } : undefined,
      orderBy: { created_at: 'asc' },
    });
  }
}

export interface AgentRegisterInput {
  id?: string;
  agent_id: string;
  endpoint: string;
  lane: string;
  dialect: string;
  soul_prompt: string;
  tools_allowed: unknown;
  status?: string;
}

export class AgentRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async registerAgent(projectId: string, input: AgentRegisterInput) {
    const project = await this.prisma.project.findFirst({ where: { id: projectId }, select: { id: true } });
    if (!project) throw new Error(`Project ${projectId} not found`);
    return this.prisma.agent.upsert({
      where: { agent_id: input.agent_id },
      create: {
        ...(input.id ? { id: input.id } : {}),
        project_id: projectId,
        agent_id: input.agent_id,
        endpoint: input.endpoint,
        lane: input.lane,
        dialect: input.dialect,
        soul_prompt: input.soul_prompt,
        tools_allowed: stringifyJson(input.tools_allowed) ?? '[]',
        status: input.status ?? 'online',
        last_heartbeat: new Date(),
      },
      update: {
        project_id: projectId,
        endpoint: input.endpoint,
        lane: input.lane,
        dialect: input.dialect,
        soul_prompt: input.soul_prompt,
        tools_allowed: stringifyJson(input.tools_allowed) ?? '[]',
        status: input.status ?? 'online',
        last_heartbeat: new Date(),
      },
    });
  }

  async listAgents(projectId: string, filters?: { lane?: string; status?: string }) {
    return this.prisma.agent.findMany({
      where: {
        OR: [{ project_id: projectId }, { project_id: null }],
        ...(filters?.lane ? { lane: filters.lane } : {}),
        ...(filters?.status ? { status: filters.status } : {}),
      },
      orderBy: [{ lane: 'asc' }, { agent_id: 'asc' }],
    });
  }
}

export interface TaskCreateInput {
  id?: string;
  title: string;
  objective: string;
  lane_required: string;
  status?: string;
  payload_schema?: unknown;
  payload?: unknown;
  proof_data?: unknown;
  ext_meta?: unknown;
  task_group_id?: string | null;
  acceptance_criteria?: unknown;
  reviewer?: string | null;
  acceptance_mode?: string | null;
  max_retries?: number;
  retry_count?: number;
}

export interface TaskStatusUpdateInput {
  proof_data?: unknown;
  ext_meta?: unknown;
  retry_count?: number;
}

export class TaskRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async create(projectId: string, input: TaskCreateInput) {
    if (input.task_group_id) {
      const group = await this.prisma.taskGroup.findFirst({
        where: { id: input.task_group_id, project_id: projectId },
        select: { id: true },
      });
      if (!group) {
        throw new Error(`TaskGroup ${input.task_group_id} not found in project ${projectId}`);
      }
    }

    return this.prisma.task.create({
      data: {
        ...(input.id ? { id: input.id } : {}),
        project_id: projectId,
        title: input.title,
        objective: input.objective,
        lane_required: input.lane_required,
        status: input.status ?? 'created',
        payload_schema: stringifyJson(input.payload_schema),
        payload: stringifyJson(input.payload),
        proof_data: stringifyJson(input.proof_data),
        ext_meta: stringifyJson(input.ext_meta),
        task_group_id: input.task_group_id ?? undefined,
        acceptance_criteria: stringifyJson(input.acceptance_criteria),
        reviewer: input.reviewer ?? undefined,
        acceptance_mode: input.acceptance_mode ?? undefined,
        max_retries: input.max_retries ?? 3,
        retry_count: input.retry_count ?? 0,
      },
    });
  }

  async get(projectId: string, taskId: string) {
    return this.prisma.task.findFirst({ where: { id: taskId, project_id: projectId } });
  }

  async list(projectId: string, filters?: { status?: string; lane_required?: string; task_group_id?: string }) {
    return this.prisma.task.findMany({
      where: {
        project_id: projectId,
        ...(filters?.status ? { status: filters.status } : {}),
        ...(filters?.lane_required ? { lane_required: filters.lane_required } : {}),
        ...(filters?.task_group_id ? { task_group_id: filters.task_group_id } : {}),
      },
      orderBy: { created_at: 'asc' },
    });
  }

  async updateStatus(projectId: string, taskId: string, status: string, input?: TaskStatusUpdateInput) {
    const task = await this.get(projectId, taskId);
    if (!task) throw new Error(`Task ${taskId} not found in project ${projectId}`);

    return this.prisma.task.update({
      where: { id: taskId },
      data: {
        status,
        ...(input?.proof_data !== undefined ? { proof_data: stringifyJson(input.proof_data) } : {}),
        ...(input?.ext_meta !== undefined ? { ext_meta: stringifyJson(input.ext_meta) } : {}),
        ...(input?.retry_count !== undefined ? { retry_count: input.retry_count } : {}),
      },
    });
  }
}

export interface TaskDependencyCreateInput {
  id?: string;
  task_id: string;
  depends_on_id: string;
  dependency_type?: string;
}

export class TaskDependencyRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async create(projectId: string, input: TaskDependencyCreateInput) {
    const tasks = await this.prisma.task.findMany({
      where: {
        project_id: projectId,
        id: { in: [input.task_id, input.depends_on_id] },
      },
      select: { id: true },
    });
    const taskIds = new Set(tasks.map((task) => task.id));
    if (!taskIds.has(input.task_id) || !taskIds.has(input.depends_on_id)) {
      throw new Error('TaskDependency source and target tasks must belong to the same project');
    }

    return this.prisma.taskDependency.create({
      data: {
        ...(input.id ? { id: input.id } : {}),
        project_id: projectId,
        task_id: input.task_id,
        depends_on_id: input.depends_on_id,
        dependency_type: input.dependency_type ?? 'blocks',
      },
    });
  }

  async listByTask(projectId: string, taskId: string) {
    return this.prisma.taskDependency.findMany({
      where: { project_id: projectId, task_id: taskId },
      orderBy: { created_at: 'asc' },
    });
  }
}

export interface TaskGroupCloseoutInput {
  ext_meta?: unknown;
}

export class TaskGroupRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async get(projectId: string, taskGroupId: string) {
    return this.prisma.taskGroup.findFirst({ where: { id: taskGroupId, project_id: projectId } });
  }

  async archive(projectId: string, taskGroupId: string, input?: TaskGroupCloseoutInput) {
    const group = await this.get(projectId, taskGroupId);
    if (!group) throw new Error(`TaskGroup ${taskGroupId} not found in project ${projectId}`);

    const updated = await this.prisma.taskGroup.updateMany({
      where: { id: taskGroupId, project_id: projectId },
      data: {
        status: 'archived',
        ...(input?.ext_meta !== undefined ? { ext_meta: stringifyJson(input.ext_meta) } : {}),
      },
    });
    if (updated.count !== 1) throw new Error(`TaskGroup ${taskGroupId} archive failed in project ${projectId}`);
    return this.get(projectId, taskGroupId);
  }
}

export interface RunCreateInput {
  run_id?: string;
  task_id: string;
  agent_id: string;
  dispatch_id?: string | null;
  worker_run_id?: string | null;
  idempotency_key?: string;
  status?: string;
  error_stack?: string | null;
  result_summary?: string | null;
}

export interface RunStatusUpdateInput {
  error_stack?: string | null;
  result_summary?: string | null;
}

export class RunRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async create(projectId: string, input: RunCreateInput) {
    const task = await this.prisma.task.findFirst({
      where: { id: input.task_id, project_id: projectId },
      select: { id: true },
    });
    if (!task) throw new Error(`Task ${input.task_id} not found in project ${projectId}`);

    const agent = await this.prisma.agent.findFirst({
      where: { id: input.agent_id, OR: [{ project_id: projectId }, { project_id: null }] },
      select: { id: true },
    });
    if (!agent) throw new Error(`Agent ${input.agent_id} not found in project ${projectId}`);

    const status = input.status ?? 'running';
    return this.prisma.run.create({
      data: {
        ...(input.run_id ? { run_id: input.run_id } : {}),
        project_id: projectId,
        task_id: input.task_id,
        agent_id: input.agent_id,
        dispatch_id: input.dispatch_id ?? undefined,
        worker_run_id: input.worker_run_id ?? undefined,
        idempotency_key: input.idempotency_key ?? `${projectId}:${input.task_id}:${input.agent_id}:${Date.now()}`,
        status,
        error_stack: input.error_stack ?? undefined,
        result_summary: input.result_summary ?? undefined,
        ended_at: terminalEndedAt(status),
      },
    });
  }

  async get(projectId: string, runId: string) {
    return this.prisma.run.findFirst({ where: { run_id: runId, project_id: projectId } });
  }

  async listByTask(projectId: string, taskId: string) {
    return this.prisma.run.findMany({
      where: { project_id: projectId, task_id: taskId },
      orderBy: { started_at: 'asc' },
    });
  }

  async updateStatus(projectId: string, runId: string, status: string, input?: RunStatusUpdateInput) {
    const run = await this.get(projectId, runId);
    if (!run) throw new Error(`Run ${runId} not found in project ${projectId}`);

    return this.prisma.run.update({
      where: { run_id: runId },
      data: {
        status,
        ...(input?.error_stack !== undefined ? { error_stack: input.error_stack } : {}),
        ...(input?.result_summary !== undefined ? { result_summary: input.result_summary } : {}),
        ...(terminalEndedAt(status) ? { ended_at: terminalEndedAt(status) } : {}),
      },
    });
  }
}

export interface ReportCreateInput {
  id?: string;
  task_id?: string | null;
  run_id?: string | null;
  message_type: string;
  status?: string;
  summary?: string | null;
  payload_json: unknown;
  delivery_json?: unknown;
  visible_message?: string | null;
  dedupe_key?: string | null;
}

export interface ArtifactCreateInput {
  id?: string;
  task_id?: string | null;
  run_id: string;
  artifact_type: string;
  payload: unknown;
  payload_data?: unknown;
  proof?: unknown;
  path?: string | null;
  metadata_json?: unknown;
}

export type ProjectCronjobEnabledPolicy = 'always_on' | 'manual' | 'project_active' | 'maintenance_only';

export interface ProjectCronjobCreateInput {
  id?: string;
  cronjob_id: string;
  name: string;
  schedule: string;
  status?: string;
  enabled_policy?: ProjectCronjobEnabledPolicy;
  owner_agent_id?: string | null;
  config_json?: unknown;
}

export interface ProjectCronjobStatusUpdateInput {
  config_json?: unknown;
  last_run_at?: Date | null;
}

export interface ProjectCronjobPromptRenderInput {
  mode?: 'watchdog' | 'patrol' | string;
  now?: Date;
  maintenance?: boolean;
}

const V8_WATCHDOG_PATROL_READONLY_GUARDRAIL = [
  '只读巡检：仅观察并输出结构化发现。',
  '不得自动修复、不得启动/停止 cronjob、不得修改任务/报告/DB 状态。',
  '所有发现必须按 project_id 分区描述；后续修复必须另行派单。',
].join('\n');

const V8_WATCHDOG_PATROL_DEFAULT_TEMPLATE = [
  '项目：{{project_id}}',
  '任务：{{cronjob_id}}',
  '名称：{{name}}',
  '模式：{{mode}}',
  '计划：{{schedule}}',
  'maintenance：{{maintenance_mode}}',
  '时间：{{now_iso}}',
  '',
  '请执行 watchdog/patrol 只读巡检并返回：summary、findings、risk、next_input。',
].join('\n');

function parseJsonObject(value: string | null | undefined): Record<string, unknown> {
  if (!value) return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
  } catch {
    return {};
  }
}

function renderCronjobPromptTemplate(template: string, values: Record<string, string>): string {
  return template.replace(/{{\s*([a-zA-Z0-9_]+)\s*}}/g, (_match, key: string) => {
    if (!(key in values)) throw new Error(`Unknown prompt template variable: ${key}`);
    return values[key];
  });
}

export class ProjectCronjobRepository {
  private static readonly validStatuses = new Set(['active', 'paused', 'disabled']);
  private static readonly validEnabledPolicies = new Set(['always_on', 'manual', 'project_active', 'maintenance_only']);

  constructor(private readonly prisma: PrismaClient) {}

  private assertStatus(status: string) {
    if (!ProjectCronjobRepository.validStatuses.has(status)) {
      throw new Error(`Invalid cronjob status: ${status}`);
    }
  }

  private assertEnabledPolicy(enabledPolicy: string) {
    if (!ProjectCronjobRepository.validEnabledPolicies.has(enabledPolicy)) {
      throw new Error(`Invalid cronjob enabled_policy: ${enabledPolicy}`);
    }
  }

  async bind(projectId: string, input: ProjectCronjobCreateInput) {
    const status = input.status ?? 'paused';
    const enabledPolicy = input.enabled_policy ?? 'always_on';
    this.assertStatus(status);
    this.assertEnabledPolicy(enabledPolicy);
    const project = await this.prisma.project.findFirst({ where: { id: projectId }, select: { id: true } });
    if (!project) throw new Error(`Project ${projectId} not found`);
    return this.prisma.projectCronjob.upsert({
      where: { project_id_cronjob_id: { project_id: projectId, cronjob_id: input.cronjob_id } },
      create: {
        ...(input.id ? { id: input.id } : {}),
        project_id: projectId,
        cronjob_id: input.cronjob_id,
        name: input.name,
        schedule: input.schedule,
        status,
        enabled_policy: enabledPolicy,
        owner_agent_id: input.owner_agent_id ?? undefined,
        config_json: stringifyJson(input.config_json),
      },
      update: {
        name: input.name,
        schedule: input.schedule,
        status,
        enabled_policy: enabledPolicy,
        owner_agent_id: input.owner_agent_id ?? undefined,
        config_json: stringifyJson(input.config_json),
      },
    });
  }

  async create(projectId: string, input: ProjectCronjobCreateInput) {
    return this.bind(projectId, input);
  }

  async get(projectId: string, cronjobId: string) {
    return this.prisma.projectCronjob.findFirst({ where: { project_id: projectId, cronjob_id: cronjobId } });
  }

  async list(projectId: string, filters?: { status?: string; enabled_policy?: ProjectCronjobEnabledPolicy }) {
    return this.prisma.projectCronjob.findMany({
      where: {
        project_id: projectId,
        ...(filters?.status ? { status: filters.status } : {}),
        ...(filters?.enabled_policy ? { enabled_policy: filters.enabled_policy } : {}),
      },
      orderBy: { created_at: 'asc' },
    });
  }

  async listEligible(projectId: string, options?: { maintenance?: boolean }) {
    const project = await this.prisma.project.findFirst({ where: { id: projectId }, select: { id: true, status: true } });
    if (!project) throw new Error(`Project ${projectId} not found`);
    const allowedPolicies: ProjectCronjobEnabledPolicy[] = ['always_on'];
    if (project.status === 'active') allowedPolicies.push('project_active');
    if (options?.maintenance) allowedPolicies.push('maintenance_only');
    return this.prisma.projectCronjob.findMany({
      where: {
        project_id: projectId,
        status: 'active',
        enabled_policy: { in: allowedPolicies },
      },
      orderBy: { created_at: 'asc' },
    });
  }

  async updateStatus(projectId: string, cronjobId: string, status: string, input?: ProjectCronjobStatusUpdateInput) {
    this.assertStatus(status);
    const cronjob = await this.get(projectId, cronjobId);
    if (!cronjob) throw new Error(`ProjectCronjob ${cronjobId} not found in project ${projectId}`);
    return this.prisma.projectCronjob.update({
      where: { id: cronjob.id },
      data: {
        status,
        ...(input?.config_json !== undefined ? { config_json: stringifyJson(input.config_json) } : {}),
        ...(input?.last_run_at !== undefined ? { last_run_at: input.last_run_at } : {}),
      },
    });
  }

  async renderPrompt(projectId: string, cronjobId: string, input?: ProjectCronjobPromptRenderInput): Promise<string> {
    const cronjob = await this.get(projectId, cronjobId);
    if (!cronjob) throw new Error(`ProjectCronjob ${cronjobId} not found in project ${projectId}`);
    const config = parseJsonObject(cronjob.config_json);
    const template = typeof config.prompt_template === 'string' && config.prompt_template.trim()
      ? config.prompt_template
      : V8_WATCHDOG_PATROL_DEFAULT_TEMPLATE;
    const mode = input?.mode ?? (typeof config.mode === 'string' ? config.mode : 'watchdog');
    const values: Record<string, string> = {
      project_id: projectId,
      cronjob_id: cronjob.cronjob_id,
      name: cronjob.name,
      schedule: cronjob.schedule,
      status: cronjob.status,
      enabled_policy: cronjob.enabled_policy,
      owner_agent_id: cronjob.owner_agent_id ?? '',
      mode,
      maintenance_mode: String(input?.maintenance ?? false),
      now_iso: (input?.now ?? new Date()).toISOString(),
    };
    const rendered = renderCronjobPromptTemplate(template, values);
    return [
      rendered.trim(),
      '',
      V8_WATCHDOG_PATROL_READONLY_GUARDRAIL,
    ].join('\n').trim();
  }
}

export class ArtifactRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async create(projectId: string, input: ArtifactCreateInput) {
    const run = await this.prisma.run.findFirst({
      where: { run_id: input.run_id, project_id: projectId },
      select: { run_id: true, task_id: true },
    });
    if (!run) throw new Error(`Run ${input.run_id} not found in project ${projectId}`);
    if (input.task_id) {
      const task = await this.prisma.task.findFirst({
        where: { id: input.task_id, project_id: projectId },
        select: { id: true },
      });
      if (!task || run.task_id !== input.task_id) {
        throw new Error(`Task ${input.task_id} not found for run ${input.run_id} in project ${projectId}`);
      }
    }

    return this.prisma.artifact.create({
      data: {
        ...(input.id ? { id: input.id } : {}),
        project_id: projectId,
        task_id: input.task_id ?? undefined,
        run_id: input.run_id,
        artifact_type: input.artifact_type,
        payload: stringifyJson(input.payload) ?? '{}',
        payload_data: stringifyJson(input.payload_data ?? input.payload),
        proof: stringifyJson(input.proof),
        path: input.path ?? undefined,
        metadata_json: stringifyJson(input.metadata_json),
      },
    });
  }

  async getByPath(projectId: string, artifactType: string, path: string) {
    return this.prisma.artifact.findFirst({
      where: { project_id: projectId, artifact_type: artifactType, path },
    });
  }
}

export class ReportRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async create(projectId: string, input: ReportCreateInput) {
    const initialStatus = input.status ?? 'pending';
    if (!isV8State('report', initialStatus)) {
      throw new Error(`Unknown V8 report status: ${initialStatus}`);
    }
    if (input.task_id) {
      const task = await this.prisma.task.findFirst({
        where: { id: input.task_id, project_id: projectId },
        select: { id: true },
      });
      if (!task) throw new Error(`Task ${input.task_id} not found in project ${projectId}`);
    }
    if (input.run_id) {
      const run = await this.prisma.run.findFirst({
        where: { run_id: input.run_id, project_id: projectId },
        select: { run_id: true },
      });
      if (!run) throw new Error(`Run ${input.run_id} not found in project ${projectId}`);
    }
    if (input.dedupe_key) {
      const existing = await this.prisma.report.findFirst({
        where: { project_id: projectId, dedupe_key: input.dedupe_key },
      });
      if (existing) return existing;
    }

    try {
      return await this.prisma.report.create({
        data: {
          ...(input.id ? { id: input.id } : {}),
          project_id: projectId,
          task_id: input.task_id ?? undefined,
          run_id: input.run_id ?? undefined,
          message_type: input.message_type,
          status: initialStatus,
          summary: formatV8VisibleMessage({
            message_type: input.message_type,
            summary: input.visible_message ?? input.summary,
            payload_json: input.payload_json,
          }),
          payload_json: stringifyJson(input.payload_json) ?? '{}',
          delivery_json: stringifyJson(input.delivery_json),
          dedupe_key: input.dedupe_key ?? undefined,
        },
      });
    } catch (error: any) {
      if (input.dedupe_key && error?.code === 'P2002') {
        const existing = await this.prisma.report.findFirst({
          where: { project_id: projectId, dedupe_key: input.dedupe_key },
        });
        if (existing) return existing;
      }
      throw error;
    }
  }

  async get(projectId: string, reportId: string) {
    return this.prisma.report.findFirst({ where: { id: reportId, project_id: projectId } });
  }

  async list(projectId: string, filters?: { status?: string; message_type?: string; task_id?: string; dedupe_key?: string }) {
    return this.prisma.report.findMany({
      where: {
        project_id: projectId,
        ...(filters?.status ? { status: filters.status } : {}),
        ...(filters?.message_type ? { message_type: filters.message_type } : {}),
        ...(filters?.task_id ? { task_id: filters.task_id } : {}),
        ...(filters?.dedupe_key ? { dedupe_key: filters.dedupe_key } : {}),
      },
      orderBy: { created_at: 'asc' },
    });
  }

  async updateStatus(projectId: string, reportId: string, status: string, input?: { delivery_json?: unknown }) {
    const report = await this.get(projectId, reportId);
    if (!report) throw new Error(`Report ${reportId} not found in project ${projectId}`);
    if (!isV8State('report', status)) {
      throw new Error(`Unknown V8 report status: ${status}`);
    }
    assertV8TransitionAllowed('report', report.status, status);

    return this.prisma.report.update({
      where: { id: reportId },
      data: {
        status,
        ...(input?.delivery_json !== undefined ? { delivery_json: stringifyJson(input.delivery_json) } : {}),
      },
    });
  }
}
