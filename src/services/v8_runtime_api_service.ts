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

export class V8RuntimeApiService {
  private readonly projects: ProjectRepository;
  private readonly agents: AgentRepository;
  private readonly tasks: TaskRepository;
  private readonly taskGroups: TaskGroupRepository;
  private readonly runs: RunRepository;
  private readonly artifacts: ArtifactRepository;
  private readonly cronjobs: ProjectCronjobRepository;
  private readonly reviewPolicies: ReviewPolicyRepository;
  private readonly reports: ReportRepository;

  constructor(private readonly prisma: PrismaClient) {
    this.projects = new ProjectRepository(prisma);
    this.agents = new AgentRepository(prisma);
    this.tasks = new TaskRepository(prisma);
    this.taskGroups = new TaskGroupRepository(prisma);
    this.runs = new RunRepository(prisma);
    this.artifacts = new ArtifactRepository(prisma);
    this.cronjobs = new ProjectCronjobRepository(prisma);
    this.reviewPolicies = new ReviewPolicyRepository(prisma);
    this.reports = new ReportRepository(prisma);
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

  async listAgents(projectId: string, filters?: { lane?: string; status?: string }) {
    await this.getProject(projectId);
    return this.agents.listAgents(projectId, filters);
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
