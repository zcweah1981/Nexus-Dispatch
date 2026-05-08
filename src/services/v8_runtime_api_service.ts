import { PrismaClient } from '@prisma/client';
import { thawV8CurrentPhase, V8BlueprintThawError } from '../engine/v8_blueprint_thaw';
import {
  ProjectCreateInput,
  ProjectRepository,
  ReportCreateInput,
  ReportRepository,
  RunCreateInput,
  RunRepository,
  RunStatusUpdateInput,
  TaskCreateInput,
  TaskRepository,
} from '../repositories/v8';

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
  private readonly tasks: TaskRepository;
  private readonly runs: RunRepository;
  private readonly reports: ReportRepository;

  constructor(private readonly prisma: PrismaClient) {
    this.projects = new ProjectRepository(prisma);
    this.tasks = new TaskRepository(prisma);
    this.runs = new RunRepository(prisma);
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

  async thawCurrentPhase(input: { project_id: string; blueprint_id: string; phase_id?: string; group_id?: string }) {
    await this.getProject(input.project_id);
    try {
      return await thawV8CurrentPhase({ prisma: this.prisma, ...input });
    } catch (error) {
      return asNotFound(error, `Blueprint phase/group could not be thawed in project ${input.project_id}`);
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
    } catch (error) {
      return asNotFound(error, `Report '${reportId}' not found in project '${projectId}'`);
    }
  }
}
