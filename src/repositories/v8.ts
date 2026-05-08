import { Prisma, PrismaClient } from '@prisma/client';

export type JsonInput = Prisma.InputJsonValue | Record<string, unknown> | unknown[];

function stringifyJson(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined;
  return typeof value === 'string' ? value : JSON.stringify(value);
}

function terminalEndedAt(status: string): Date | undefined {
  return ['success', 'failed', 'cancelled'].includes(status) ? new Date() : undefined;
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
}

export class ReportRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async create(projectId: string, input: ReportCreateInput) {
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

    return this.prisma.report.create({
      data: {
        ...(input.id ? { id: input.id } : {}),
        project_id: projectId,
        task_id: input.task_id ?? undefined,
        run_id: input.run_id ?? undefined,
        message_type: input.message_type,
        status: input.status ?? 'pending',
        summary: input.summary ?? undefined,
        payload_json: stringifyJson(input.payload_json) ?? '{}',
        delivery_json: stringifyJson(input.delivery_json),
      },
    });
  }

  async get(projectId: string, reportId: string) {
    return this.prisma.report.findFirst({ where: { id: reportId, project_id: projectId } });
  }

  async list(projectId: string, filters?: { status?: string; message_type?: string; task_id?: string }) {
    return this.prisma.report.findMany({
      where: {
        project_id: projectId,
        ...(filters?.status ? { status: filters.status } : {}),
        ...(filters?.message_type ? { message_type: filters.message_type } : {}),
        ...(filters?.task_id ? { task_id: filters.task_id } : {}),
      },
      orderBy: { created_at: 'asc' },
    });
  }

  async updateStatus(projectId: string, reportId: string, status: string, input?: { delivery_json?: unknown }) {
    const report = await this.get(projectId, reportId);
    if (!report) throw new Error(`Report ${reportId} not found in project ${projectId}`);

    return this.prisma.report.update({
      where: { id: reportId },
      data: {
        status,
        ...(input?.delivery_json !== undefined ? { delivery_json: stringifyJson(input.delivery_json) } : {}),
      },
    });
  }
}
