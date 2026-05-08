/**
 * Nexus Dispatch API — /api/v1/* Routes
 * T2.6: All routes hardened with Ajv schema validation + standardized errors
 *
 * Auth is handled globally by server.ts middleware (bearerAuth on /api/v1 prefix).
 */

import { Router, Request, Response } from 'express';
import DAL from '../db/dal';
import { PrismaDAL } from '../db/prisma_dal';
import { ReviewEngine } from '../engine/review_engine';
import { v4 as uuidv4 } from 'uuid';
import Ajv from 'ajv';
import { stateEmitter } from './server';
import { validateBody, sendError, ErrorCodes } from './middleware';
import {
  taskClaimSchema,
  taskReleaseSchema,
  submitProofSchema,
  controllerConfigUpdateSchema,
  blueprintCreateSchema,
  projectInitSchema,
  agentRegisterSchema,
  taskCreateSchema,
  taskStatusUpdateSchema,
  runtimeProjectCreateSchema,
  runtimeTaskCreateSchema,
  runtimeRunCreateSchema,
  runtimeRunStatusUpdateSchema,
  runtimeReportCreateSchema,
  runtimeReportStatusUpdateSchema,
  taskTransitionSchema,
  taskBatchSchema,
  taskAcceptSchema,
  taskRejectSchema,
  // T3.1: Daemon tick API schemas
  taskClaimByIdSchema,
  runCreateSchema,
  taskRecoverTimeoutsSchema,
  runStatusUpdateSchema,
} from './schemas';
import { transitionTask, TransitionTaskError } from '../services/v8_transition_task_service';
import { V8RuntimeApiError, V8RuntimeApiService } from '../services/v8_runtime_api_service';

const ajv = new Ajv();

export function createApiRouter(dal: DAL, authToken: string = 'valid-token', prismaDal?: PrismaDAL) {
  const router = Router();

  // ═══════════════════════════════════════════════════════════════
  //  V8-R2 Runtime API + FSM Controller boundary
  //  主线 routes 只做 validation/HTTP 映射，所有业务读写走 V8RuntimeApiService
  //  或 transitionTask FSM service；legacy SQL endpoints 保留在下方旧区块并不冒充 V8。
  // ═══════════════════════════════════════════════════════════════

  function runtimeServiceOr503(res: Response): V8RuntimeApiService | undefined {
    if (!prismaDal) {
      sendError(res, 503, 'PrismaDAL not initialized', ErrorCodes.INTERNAL_ERROR);
      return undefined;
    }
    return new V8RuntimeApiService(prismaDal.client);
  }

  function sendRuntimeError(res: Response, error: any, fallback: string) {
    if (error instanceof V8RuntimeApiError) {
      return sendError(res, error.statusCode, error.message, error.code, error.details);
    }
    return sendError(res, 500, fallback, ErrorCodes.INTERNAL_ERROR, { message: error.message });
  }

  router.post('/runtime/projects', validateBody('runtimeProjectCreate', runtimeProjectCreateSchema), async (req: Request, res: Response) => {
    const service = runtimeServiceOr503(res);
    if (!service) return;
    try {
      const project = await service.createProject(req.body);
      return res.status(201).json({ project });
    } catch (error: any) {
      return sendRuntimeError(res, error, 'Failed to create runtime project');
    }
  });

  router.get('/runtime/projects/:id', async (req: Request, res: Response) => {
    const service = runtimeServiceOr503(res);
    if (!service) return;
    try {
      const project = await service.getProject(req.params.id as string);
      return res.status(200).json({ project });
    } catch (error: any) {
      return sendRuntimeError(res, error, 'Failed to get runtime project');
    }
  });

  router.post('/runtime/tasks', validateBody('runtimeTaskCreate', runtimeTaskCreateSchema), async (req: Request, res: Response) => {
    const service = runtimeServiceOr503(res);
    if (!service) return;
    const { project_id, ...taskInput } = req.body;
    try {
      const task = await service.createTask(project_id, taskInput);
      stateEmitter.emit('state_change', { type: 'task_created', data: { project_id, task_id: task.id, status: task.status } });
      return res.status(201).json({ task });
    } catch (error: any) {
      return sendRuntimeError(res, error, 'Failed to create runtime task');
    }
  });

  router.get('/runtime/tasks/:id', async (req: Request, res: Response) => {
    const service = runtimeServiceOr503(res);
    if (!service) return;
    const projectId = req.query.project_id as string | undefined;
    if (!projectId) return sendError(res, 400, 'project_id query is required', ErrorCodes.BAD_REQUEST);
    try {
      const task = await service.getTask(projectId, req.params.id as string);
      return res.status(200).json({ task });
    } catch (error: any) {
      return sendRuntimeError(res, error, 'Failed to get runtime task');
    }
  });

  router.post('/runtime/runs', validateBody('runtimeRunCreate', runtimeRunCreateSchema), async (req: Request, res: Response) => {
    const service = runtimeServiceOr503(res);
    if (!service) return;
    const { project_id, ...runInput } = req.body;
    try {
      const run = await service.createRun(project_id, runInput);
      stateEmitter.emit('state_change', { type: 'run_created', data: { project_id, run_id: run.run_id, task_id: run.task_id } });
      return res.status(201).json({ run });
    } catch (error: any) {
      return sendRuntimeError(res, error, 'Failed to create runtime run');
    }
  });

  router.patch('/runtime/runs/:id/status', validateBody('runtimeRunStatusUpdate', runtimeRunStatusUpdateSchema), async (req: Request, res: Response) => {
    const service = runtimeServiceOr503(res);
    if (!service) return;
    const { project_id, status, error_stack, result_summary } = req.body;
    try {
      const run = await service.updateRunStatus(project_id, req.params.id as string, status, { error_stack, result_summary });
      stateEmitter.emit('state_change', { type: 'run_status_updated', data: { project_id, run_id: run.run_id, status } });
      return res.status(200).json({ run });
    } catch (error: any) {
      return sendRuntimeError(res, error, 'Failed to update runtime run status');
    }
  });

  router.post('/runtime/reports', validateBody('runtimeReportCreate', runtimeReportCreateSchema), async (req: Request, res: Response) => {
    const service = runtimeServiceOr503(res);
    if (!service) return;
    const { project_id, ...reportInput } = req.body;
    try {
      const report = await service.createReport(project_id, reportInput);
      return res.status(201).json({ report });
    } catch (error: any) {
      return sendRuntimeError(res, error, 'Failed to create runtime report');
    }
  });

  router.patch('/runtime/reports/:id/status', validateBody('runtimeReportStatusUpdate', runtimeReportStatusUpdateSchema), async (req: Request, res: Response) => {
    const service = runtimeServiceOr503(res);
    if (!service) return;
    const { project_id, status, delivery_json } = req.body;
    try {
      const report = await service.updateReportStatus(project_id, req.params.id as string, status, { delivery_json });
      return res.status(200).json({ report });
    } catch (error: any) {
      return sendRuntimeError(res, error, 'Failed to update runtime report status');
    }
  });

  router.post('/runtime/tasks/transition', validateBody('taskTransition', taskTransitionSchema), async (req: Request, res: Response) => {
    if (!prismaDal) {
      return sendError(res, 503, 'PrismaDAL not initialized', ErrorCodes.INTERNAL_ERROR);
    }

    try {
      const result = await transitionTask({ prisma: prismaDal.client }, req.body);
      stateEmitter.emit('state_change', {
        type: 'task_transitioned',
        data: {
          project_id: result.audit.project_id,
          task_id: result.audit.task_id,
          event: result.audit.event,
          old_status: result.audit.from_status,
          new_status: result.audit.to_status,
        },
      });
      return res.status(200).json(result);
    } catch (error: any) {
      if (error instanceof TransitionTaskError) {
        return sendError(res, error.statusCode, error.message, error.code, error.details);
      }
      return sendError(res, 500, 'Failed to transition task', ErrorCodes.INTERNAL_ERROR, { message: error.message });
    }
  });

  // ═══════════════════════════════════════════════════════════════
  //  T2.1: 任务管理 API（5个接口）
  // ═══════════════════════════════════════════════════════════════

  // ─── POST /api/v1/tasks — 创建任务 ─────────────────────────────────
  router.post('/tasks', validateBody('taskCreate', taskCreateSchema), async (req: Request, res: Response) => {
    if (!prismaDal) {
      return sendError(res, 503, 'PrismaDAL not initialized', ErrorCodes.INTERNAL_ERROR);
    }
    const { project_id, title, objective, lane_required, task_group_id,
            payload, payload_schema, acceptance_criteria, dependencies, reviewer,
            acceptance_mode, max_retries } = req.body;

    try {
      // Verify project exists
      const project = await prismaDal.getProject(project_id);
      if (!project) {
        return sendError(res, 404, `Project '${project_id}' not found`, ErrorCodes.NOT_FOUND);
      }

      // If task_group_id provided (group_id string like 'test-p1'), verify it exists and resolve to internal UUID
      let resolvedTaskGroupId: string | undefined;
      if (task_group_id) {
        const group = await prismaDal.getTaskGroup(task_group_id);
        if (!group) {
          return sendError(res, 404, `TaskGroup '${task_group_id}' not found`, ErrorCodes.NOT_FOUND);
        }
        resolvedTaskGroupId = group.id;
      }

      const dependencyIds: string[] = dependencies ?? [];
      if (dependencyIds.length > 0) {
        const dependencyTasks = await prismaDal.client.task.findMany({
          where: { project_id, id: { in: dependencyIds } },
          select: { id: true },
        });
        if (dependencyTasks.length !== dependencyIds.length) {
          return sendError(res, 400, 'Task dependencies must belong to the same project', ErrorCodes.BAD_REQUEST);
        }
      }

      const task = await prismaDal.client.$transaction(async (tx) => {
        const created = await tx.task.create({
          data: {
            project_id,
            title,
            objective,
            lane_required,
            status: 'created',
            ...(resolvedTaskGroupId && { task_group_id: resolvedTaskGroupId }),
            ...(payload && { payload: JSON.stringify(payload) }),
            ...(payload_schema && { payload_schema: JSON.stringify(payload_schema) }),
            ...(acceptance_criteria && { acceptance_criteria: JSON.stringify(acceptance_criteria) }),
            ...(reviewer && { reviewer }),
            ...(acceptance_mode && { acceptance_mode }),
            ...(max_retries !== undefined && { max_retries }),
          },
        });
        if (dependencyIds.length > 0) {
          await tx.taskDependency.createMany({
            data: dependencyIds.map((dependsOnId) => ({
              project_id,
              task_id: created.id,
              depends_on_id: dependsOnId,
              dependency_type: 'blocks',
            })),
          });
        }
        return created;
      });

      stateEmitter.emit('state_change', {
        type: 'task_created',
        data: { task_id: task.id, project_id, title, status: 'created' },
      });

      return res.status(201).json({ task });
    } catch (error: any) {
      return sendError(res, 500, 'Failed to create task', ErrorCodes.INTERNAL_ERROR, { message: error.message });
    }
  });

  // ─── GET /api/v1/tasks/pending — 获取可派发任务（含 DAG 依赖检查）──
  router.get('/tasks/pending', async (req: Request, res: Response) => {
    if (!prismaDal) {
      return sendError(res, 503, 'PrismaDAL not initialized', ErrorCodes.INTERNAL_ERROR);
    }
    const projectId = req.query.project_id as string | undefined;
    const lane = req.query.lane as string | undefined;

    try {
      // 1. Find all 'created' tasks (optionally filtered by project and lane)
      const whereClause: any = { status: 'created' };
      if (projectId) whereClause.project_id = projectId;
      if (lane) whereClause.lane_required = lane;

      const createdTasks = await prismaDal.client.task.findMany({
        where: whereClause,
        orderBy: { created_at: 'asc' },
        include: {
          outgoing_deps: {
            where: projectId ? { project_id: projectId } : undefined,
            select: { depends_on_id: true },
          },
        },
      });

      // 2. DAG dependency check: only return tasks whose ALL dependencies are completed
      // outgoing_deps = TaskDependency rows where task_id = this task (this task depends on others)
      const dispatchable = [];
      for (const task of createdTasks) {
        if (!task.outgoing_deps || task.outgoing_deps.length === 0) {
          dispatchable.push(task);
          continue;
        }

        // Check each dependency — all must be 'completed'
        const depIds = task.outgoing_deps.map((d: any) => d.depends_on_id);
        const depTasks = await prismaDal.client.task.findMany({
          where: { id: { in: depIds }, project_id: task.project_id },
          select: { id: true, status: true },
        });

        const allCompleted = depTasks.length === depIds.length && depTasks.every((d: any) => d.status === 'completed');
        if (allCompleted) {
          dispatchable.push(task);
        }
      }

      // Strip internal relation info from response
      const cleaned = dispatchable.map((t: any) => {
        const { incoming_deps, outgoing_deps, project, taskGroup, runs, ...rest } = t;
        return rest;
      });

      return res.status(200).json({ tasks: cleaned, total: cleaned.length });
    } catch (error: any) {
      return sendError(res, 500, 'Failed to fetch pending tasks', ErrorCodes.INTERNAL_ERROR, { message: error.message });
    }
  });

  // ─── GET /api/v1/tasks/:id — 单任务详情 ─────────────────────────────
  router.get('/tasks/:id', async (req: Request, res: Response) => {
    if (!prismaDal) {
      return sendError(res, 503, 'PrismaDAL not initialized', ErrorCodes.INTERNAL_ERROR);
    }
    const taskId = req.params.id as string;
    const projectId = req.query.project_id as string | undefined;

    try {
      const task = projectId
        ? await prismaDal.getTaskInProject(taskId, projectId)
        : await prismaDal.getTask(taskId);

      if (!task) {
        return sendError(res, 404, `Task '${taskId}' not found`, ErrorCodes.NOT_FOUND);
      }

      return res.status(200).json({ task });
    } catch (error: any) {
      return sendError(res, 500, 'Failed to get task', ErrorCodes.INTERNAL_ERROR, { message: error.message });
    }
  });

  // ─── PATCH /api/v1/tasks/:id/status — 状态更新 ──────────────────────
  router.patch('/tasks/:id/status', validateBody('taskStatusUpdate', taskStatusUpdateSchema), async (req: Request, res: Response) => {
    if (!prismaDal) {
      return sendError(res, 503, 'PrismaDAL not initialized', ErrorCodes.INTERNAL_ERROR);
    }
    const taskId = req.params.id as string;
    const { status, proof_data, ext_meta } = req.body;

    try {
      const existing = await prismaDal.getTask(taskId);
      if (!existing) {
        return sendError(res, 404, `Task '${taskId}' not found`, ErrorCodes.NOT_FOUND);
      }

      // Build update data
      const updateData: any = { status };
      if (proof_data !== undefined) updateData.proof_data = proof_data;
      if (ext_meta !== undefined) updateData.ext_meta = ext_meta;

      const updated = await prismaDal.client.task.update({
        where: { id: taskId },
        data: updateData,
      });

      stateEmitter.emit('state_change', {
        type: 'task_status_updated',
        data: { task_id: taskId, old_status: existing.status, new_status: status },
      });

      return res.status(200).json({ task: updated });
    } catch (error: any) {
      return sendError(res, 500, 'Failed to update task status', ErrorCodes.INTERNAL_ERROR, { message: error.message });
    }
  });

  // ─── POST /api/v1/tasks/batch — 批量注入（冷冻库解冻用） ────────────
  router.post('/tasks/batch', validateBody('taskBatch', taskBatchSchema), async (req: Request, res: Response) => {
    if (!prismaDal) {
      return sendError(res, 503, 'PrismaDAL not initialized', ErrorCodes.INTERNAL_ERROR);
    }
    const { project_id, group_id, tasks } = req.body;

    try {
      // Verify project exists
      const project = await prismaDal.getProject(project_id);
      if (!project) {
        return sendError(res, 404, `Project '${project_id}' not found`, ErrorCodes.NOT_FOUND);
      }

      // Verify group exists
      const group = await prismaDal.getTaskGroup(group_id);
      if (!group) {
        return sendError(res, 404, `TaskGroup '${group_id}' not found`, ErrorCodes.NOT_FOUND);
      }

      // Use DAL's inject_phase_tasks for atomic batch creation
      const injectedIds = await prismaDal.inject_phase_tasks(
        project_id,
        group_id,
        tasks.map((t: any) => ({
          title: t.title,
          objective: t.objective,
          lane_required: t.lane_required,
          payload: t.payload,
          payload_schema: t.payload_schema,
          acceptance_criteria: t.acceptance_criteria,
          dependencies: t.dependencies,
          reviewer: t.reviewer,
          acceptance_mode: t.acceptance_mode,
        })),
      );

      stateEmitter.emit('state_change', {
        type: 'tasks_batch_injected',
        data: { project_id, group_id, count: injectedIds.length, task_ids: injectedIds },
      });

      return res.status(201).json({
        injected: injectedIds.length,
        task_ids: injectedIds,
        project_id,
        group_id,
      });
    } catch (error: any) {
      return sendError(res, 500, 'Failed to batch inject tasks', ErrorCodes.INTERNAL_ERROR, { message: error.message });
    }
  });

  // ─── POST /api/v1/tasks/claim ─────────────────────────────────────
  router.post('/tasks/claim', validateBody('taskClaim', taskClaimSchema), (req: Request, res: Response) => {
    try {
      const tx = (dal as any).db.transaction(() => {
        const stmt = (dal as any).db.prepare(`
          UPDATE nexus_tasks
          SET status = 'dispatched'
          WHERE id = (
            SELECT id FROM nexus_tasks
            WHERE status = 'created'
            LIMIT 1
          )
          RETURNING *;
        `);
        return stmt.get();
      });
      const task = tx();

      if (!task) {
        return sendError(res, 404, 'No tasks available to claim', ErrorCodes.NOT_FOUND);
      }
      return res.status(200).json({ task });
    } catch (error: any) {
      return sendError(res, 500, 'Failed to claim task', ErrorCodes.INTERNAL_ERROR, { message: error.message });
    }
  });

  // ─── POST /api/v1/tasks/:id/release ───────────────────────────────
  router.post('/tasks/:id/release', validateBody('taskRelease', taskReleaseSchema), (req: Request, res: Response) => {
    const taskId = req.params.id as string;
    try {
      const tx = (dal as any).db.transaction(() => {
        (dal as any).db.prepare(`
          UPDATE nexus_tasks
          SET status = 'created', retry_count = retry_count + 1
          WHERE id = ?
        `).run(taskId);
      });
      tx();
      return res.status(200).json({ message: 'Task released' });
    } catch (error: any) {
      return sendError(res, 500, 'Failed to release task', ErrorCodes.INTERNAL_ERROR, { message: error.message });
    }
  });

  // ─── POST /api/v1/tasks/:id/submit_proof ──────────────────────────
  router.post('/tasks/:id/submit_proof', validateBody('submitProof', submitProofSchema), (req: Request, res: Response) => {
    const taskId = req.params.id as string;
    const { run_id, artifact_type, payload } = req.body;

    const task = dal.getTask(taskId);
    if (!task) {
      return sendError(res, 404, 'Task not found', ErrorCodes.NOT_FOUND);
    }

    const run = dal.getRun(run_id);
    if (!run) {
      return sendError(res, 404, 'Run not found', ErrorCodes.NOT_FOUND);
    }

    if (run.task_id !== taskId) {
      return sendError(res, 400, 'Run does not belong to this task', ErrorCodes.BAD_REQUEST, { run_task_id: run.task_id, requested_task_id: taskId });
    }

    if (run.status !== 'running') {
      return sendError(res, 400, 'Run is not in running state', ErrorCodes.BAD_REQUEST, { run_status: run.status });
    }

    if (task.status !== 'dispatched' && task.status !== 'created') {
      return sendError(res, 400, `Cannot submit proof for task in ${task.status} state`, ErrorCodes.BAD_REQUEST, { task_status: task.status });
    }

    // Schema validation against task's payload_schema
    if (task.payload_schema && Object.keys(task.payload_schema).length > 0) {
      try {
        const validate = ajv.compile(task.payload_schema);
        const isValid = validate(payload) as boolean;
        if (!isValid) {
          const errors = validate.errors?.map(e => ({
            field: (e.instancePath || '/').replace(/^\//, '') || 'root',
            message: e.message || 'Validation failed',
            params: e.params,
          }));
          return sendError(res, 422, 'Payload validation failed', ErrorCodes.VALIDATION_ERROR, errors);
        }
      } catch (err) {
        return sendError(res, 500, 'Invalid schema defined in task', ErrorCodes.INTERNAL_ERROR);
      }
    }

    try {
      const tx = (dal as any).db.transaction(() => {
        const updateRunStmt = (dal as any).db.prepare(`
          UPDATE nexus_runs SET status = 'success', ended_at = CURRENT_TIMESTAMP WHERE run_id = ?
        `);
        updateRunStmt.run(run_id);

        const updateTaskStmt = (dal as any).db.prepare(`
          UPDATE nexus_tasks SET status = 'validating' WHERE id = ?
        `);
        updateTaskStmt.run(taskId);

        const insertArtifactStmt = (dal as any).db.prepare(`
          INSERT INTO nexus_artifacts (id, run_id, artifact_type, payload_data) VALUES (?, ?, ?, ?)
        `);
        insertArtifactStmt.run(uuidv4(), run_id, artifact_type, JSON.stringify(payload));

        try {
          stateEmitter.emit('state_change', { type: 'run_status_updated', data: { run_id, status: 'success' } });
          stateEmitter.emit('state_change', { type: 'task_status_updated', data: { task_id: taskId, status: 'validating' } });
        } catch (err) {}
      });
      tx();

      return res.status(201).json({ message: 'Proof submitted successfully, task is now validating' });
    } catch (err: any) {
      return sendError(res, 500, 'Database transaction failed', ErrorCodes.INTERNAL_ERROR, { message: err.message });
    }
  });

  // ─── GET /api/v1/controllers — 列出所有 FSM 控制器 ────────────────
  router.get('/controllers', async (req: Request, res: Response) => {
    if (!prismaDal) {
      return sendError(res, 503, 'PrismaDAL not initialized', ErrorCodes.INTERNAL_ERROR);
    }
    try {
      const entityType = typeof req.query.entity_type === 'string' ? req.query.entity_type : undefined;
      const controllers = await prismaDal.list_controllers(entityType);
      return res.status(200).json({ controllers });
    } catch (error: any) {
      return sendError(res, 500, 'Failed to list controllers', ErrorCodes.INTERNAL_ERROR, { message: error.message });
    }
  });

  // ─── PUT /api/v1/controllers/:id/config — 热更新 FSM 配置 ────────
  router.put('/controllers/:id/config', validateBody('controllerConfigUpdate', controllerConfigUpdateSchema), async (req: Request, res: Response) => {
    if (!prismaDal) {
      return sendError(res, 503, 'PrismaDAL not initialized', ErrorCodes.INTERNAL_ERROR);
    }
    const controllerId = req.params.id as string;
    try {
      const updated = await prismaDal.update_controller_config(controllerId, req.body);
      if (!updated) {
        return sendError(res, 404, `Controller '${controllerId}' not found`, ErrorCodes.NOT_FOUND);
      }

      // 广播 config_updated 事件，Daemon 下一个 tick 即时生效
      stateEmitter.emit('state_change', {
        type: 'controller_config_updated',
        data: { controller_id: controllerId, updated_config: updated },
      });

      return res.status(200).json({ controller: updated });
    } catch (error: any) {
      return sendError(res, 500, 'Failed to update controller config', ErrorCodes.INTERNAL_ERROR, { message: error.message });
    }
  });

  // ─── GET /api/v1/events/stream — SSE 实时推送 + 心跳 ──────────────
  router.get('/events/stream', (req: Request, res: Response) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no'); // 防止 nginx 缓冲

    // 初始连接事件
    res.write(`data: ${JSON.stringify({ type: 'connected', message: 'SSE connection established', timestamp: Date.now() })}\n\n`);

    // 心跳 keep-alive（每 15 秒）
    const heartbeat = setInterval(() => {
      try {
        res.write(`:heartbeat\n\n`);  // SSE comment as heartbeat
        res.write(`data: ${JSON.stringify({ type: 'ping', timestamp: Date.now() })}\n\n`);
      } catch (e) {
        clearInterval(heartbeat);
      }
    }, 15000);

    // 监听 stateEmitter 事件
    const onStateChange = (event: any) => {
      try {
        res.write(`event: state_change\ndata: ${JSON.stringify(event)}\n\n`);
      } catch (e) {
        // 连接已关闭
      }
    };

    stateEmitter.on('state_change', onStateChange);

    req.on('close', () => {
      clearInterval(heartbeat);
      stateEmitter.off('state_change', onStateChange);
    });
  });

  // ═══════════════════════════════════════════════════════════════
  //  T3.1: Daemon Tick API（4个接口）
  // ═══════════════════════════════════════════════════════════════

  // ─── POST /api/v1/tasks/recover-timeouts — 超时任务回收 ──────────
  // 注册在 /tasks/:id/claim 之前，避免 Express 路由冲突
  router.post('/tasks/recover-timeouts', validateBody('taskRecoverTimeouts', taskRecoverTimeoutsSchema), async (req: Request, res: Response) => {
    if (!prismaDal) {
      return sendError(res, 503, 'PrismaDAL not initialized', ErrorCodes.INTERNAL_ERROR);
    }
    const timeoutMinutes = req.body.timeout_minutes || 15;
    const cutoff = new Date(Date.now() - timeoutMinutes * 60 * 1000);

    try {
      // 查找 dispatched 且有 running run 超过阈值的任务
      const staleTasks = await prismaDal.client.task.findMany({
        where: {
          status: 'dispatched',
          runs: {
            some: {
              status: 'running',
              started_at: { lt: cutoff },
            },
          },
        },
      });

      const recoveredIds: string[] = [];
      for (const task of staleTasks) {
        // 原子恢复：task → created, runs → failed
        await prismaDal.client.$transaction(async (tx: any) => {
          await tx.task.update({
            where: { id: task.id },
            data: { status: 'created' },
          });
          await tx.run.updateMany({
            where: { task_id: task.id, status: 'running' },
            data: { status: 'failed', error_stack: 'Timeout: recovered by daemon', ended_at: new Date() },
          });
        });
        recoveredIds.push(task.id);
      }

      if (recoveredIds.length > 0) {
        stateEmitter.emit('state_change', {
          type: 'tasks_recovered',
          data: { task_ids: recoveredIds, count: recoveredIds.length },
        });
      }

      return res.status(200).json({ recovered: recoveredIds.length, task_ids: recoveredIds });
    } catch (error: any) {
      return sendError(res, 500, 'Failed to recover timed-out tasks', ErrorCodes.INTERNAL_ERROR, { message: error.message });
    }
  });

  // ─── POST /api/v1/tasks/:id/claim — 原子 claim 特定任务 ──────────
  router.post('/tasks/:id/claim', validateBody('taskClaimById', taskClaimByIdSchema), async (req: Request, res: Response) => {
    if (!prismaDal) {
      return sendError(res, 503, 'PrismaDAL not initialized', ErrorCodes.INTERNAL_ERROR);
    }
    const taskId = req.params.id as string;

    try {
      // 原子 claim：在事务内检查状态并更新，防止竞态
      const claimed = await prismaDal.client.$transaction(async (tx: any) => {
        const task = await tx.task.findUnique({ where: { id: taskId } });
        if (!task) return null;
        if (task.status !== 'created') return 'ALREADY_CLAIMED';
        return await tx.task.update({
          where: { id: taskId },
          data: { status: 'dispatched' },
        });
      });

      if (claimed === null) {
        return sendError(res, 404, `Task '${taskId}' not found`, ErrorCodes.NOT_FOUND);
      }
      if (claimed === 'ALREADY_CLAIMED') {
        return sendError(res, 409, `Task '${taskId}' is not in 'created' state (already claimed)`, ErrorCodes.BAD_REQUEST);
      }

      stateEmitter.emit('state_change', {
        type: 'task_status_updated',
        data: { task_id: taskId, old_status: 'created', new_status: 'dispatched' },
      });

      return res.status(200).json({ task: claimed });
    } catch (error: any) {
      return sendError(res, 500, 'Failed to claim task', ErrorCodes.INTERNAL_ERROR, { message: error.message });
    }
  });

  // ─── POST /api/v1/runs — 创建 Run 记录 ─────────────────────────
  router.post('/runs', validateBody('runCreate', runCreateSchema), async (req: Request, res: Response) => {
    if (!prismaDal) {
      return sendError(res, 503, 'PrismaDAL not initialized', ErrorCodes.INTERNAL_ERROR);
    }
    const { task_id, agent_id, idempotency_key } = req.body;

    try {
      // 1. 校验 task 存在
      const task = await prismaDal.getTask(task_id);
      if (!task) {
        return sendError(res, 404, `Task '${task_id}' not found`, ErrorCodes.NOT_FOUND);
      }

      // 2. 解析 agent_id（人类可读 ID → UUID PK）
      const agent = await prismaDal.client.agent.findUnique({ where: { agent_id } });
      if (!agent) {
        return sendError(res, 404, `Agent '${agent_id}' not found`, ErrorCodes.NOT_FOUND);
      }

      // 3. 创建 Run（agent_id 使用 UUID PK）
      const run = await prismaDal.client.run.create({
        data: {
          task_id,
          agent_id: agent.id,
          idempotency_key: idempotency_key || `run-${task_id}-${Date.now()}`,
          status: 'running',
        },
      });

      stateEmitter.emit('state_change', {
        type: 'run_created',
        data: { run_id: run.run_id, task_id, agent_id },
      });

      return res.status(201).json({ run });
    } catch (error: any) {
      if (error.code === 'P2002') {
        return sendError(res, 409, 'Duplicate idempotency_key', ErrorCodes.BAD_REQUEST);
      }
      return sendError(res, 500, 'Failed to create run', ErrorCodes.INTERNAL_ERROR, { message: error.message });
    }
  });

  // ─── PATCH /api/v1/runs/:id/status — Run 状态更新 ────────────────
  router.patch('/runs/:id/status', validateBody('runStatusUpdate', runStatusUpdateSchema), async (req: Request, res: Response) => {
    if (!prismaDal) {
      return sendError(res, 503, 'PrismaDAL not initialized', ErrorCodes.INTERNAL_ERROR);
    }
    const runId = req.params.id as string;
    const { status, error_stack } = req.body;

    try {
      const existing = await prismaDal.client.run.findUnique({ where: { run_id: runId } });
      if (!existing) {
        return sendError(res, 404, `Run '${runId}' not found`, ErrorCodes.NOT_FOUND);
      }

      const updated = await prismaDal.client.run.update({
        where: { run_id: runId },
        data: {
          status,
          ...(error_stack !== undefined && { error_stack }),
          ended_at: status !== 'running' ? new Date() : undefined,
        },
      });

      stateEmitter.emit('state_change', {
        type: 'run_status_updated',
        data: { run_id: runId, status },
      });

      return res.status(200).json({ run: updated });
    } catch (error: any) {
      return sendError(res, 500, 'Failed to update run status', ErrorCodes.INTERNAL_ERROR, { message: error.message });
    }
  });

  // ═══════════════════════════════════════════════════════════════
  //  T2.3: Agent 管理 API（3个接口）
  // ═══════════════════════════════════════════════════════════════

  // ─── POST /api/v1/agents/register — 注册/心跳续约 ────────────
  router.post('/agents/register', validateBody('agentRegister', agentRegisterSchema), async (req: Request, res: Response) => {
    if (!prismaDal) {
      return sendError(res, 503, 'PrismaDAL not initialized', ErrorCodes.INTERNAL_ERROR);
    }
    const { id, lane, endpoint, dialect, soul_prompt, tools_allowed } = req.body;

    try {
      const agent = await prismaDal.registerAgent({
        id,
        lane,
        endpoint,
        dialect,
        soul_prompt,
        tools_allowed,
      });

      // T4.2: Broadcast agent registration to SSE subscribers
      stateEmitter.emit('state_change', {
        type: 'agent_registered',
        data: {
          agent_id: agent.agent_id,
          lane: agent.lane,
          endpoint: agent.endpoint,
          dialect: agent.dialect,
          status: agent.status,
          last_heartbeat: agent.last_heartbeat,
        },
      });

      return res.status(200).json({
        agent_id: agent.agent_id,
        lane: agent.lane,
        endpoint: agent.endpoint,
        dialect: agent.dialect,
        status: agent.status,
        last_heartbeat: agent.last_heartbeat,
      });
    } catch (error: any) {
      return sendError(res, 500, 'Failed to register agent', ErrorCodes.INTERNAL_ERROR, { message: error.message });
    }
  });

  // ─── GET /api/v1/agents — 列出所有 Agent 状态 ────────────────
  router.get('/agents', async (req: Request, res: Response) => {
    if (!prismaDal) {
      return sendError(res, 503, 'PrismaDAL not initialized', ErrorCodes.INTERNAL_ERROR);
    }

    try {
      const agents = await prismaDal.listAgents();
      return res.status(200).json({ agents });
    } catch (error: any) {
      return sendError(res, 500, 'Failed to list agents', ErrorCodes.INTERNAL_ERROR, { message: error.message });
    }
  });

  // ─── GET /api/v1/agents/:id/health — 单个探活 ────────────────
  router.get('/agents/:id/health', async (req: Request, res: Response) => {
    if (!prismaDal) {
      return sendError(res, 503, 'PrismaDAL not initialized', ErrorCodes.INTERNAL_ERROR);
    }
    const agentId = req.params.id as string;

    try {
      const health = await prismaDal.getAgentHealth(agentId);
      if (!health) {
        return sendError(res, 404, `Agent '${agentId}' not found`, ErrorCodes.NOT_FOUND);
      }

      return res.status(200).json(health);
    } catch (error: any) {
      return sendError(res, 500, 'Failed to check agent health', ErrorCodes.INTERNAL_ERROR, { message: error.message });
    }
  });

  // ═══════════════════════════════════════════════════════════════
  //  T2.4: 项目蓝图 API（4个接口）
  // ═══════════════════════════════════════════════════════════════

  // ─── POST /api/v1/projects/init — 项目初始化（骨架+建档） ───────
  router.post('/projects/init', validateBody('projectInit', projectInitSchema), async (req: Request, res: Response) => {
    if (!prismaDal) {
      return sendError(res, 503, 'PrismaDAL not initialized', ErrorCodes.INTERNAL_ERROR);
    }
    const { name, description } = req.body;

    try {
      // Check duplicate name
      const existing = await prismaDal.getProjectByName(name);
      if (existing) {
        return sendError(res, 409, `Project with name '${name}' already exists`, ErrorCodes.BAD_REQUEST);
      }

      // Create project in DB
      const project = await prismaDal.createProject({
        name,
        ...(description && { channel_config: JSON.stringify({ description }) }),
      });

      return res.status(201).json({
        id: project.id,
        name: project.name,
        status: project.status,
        description: description || null,
        created_at: project.created_at,
      });
    } catch (error: any) {
      return sendError(res, 500, 'Failed to init project', ErrorCodes.INTERNAL_ERROR, { message: error.message });
    }
  });

  // ─── GET /api/v1/projects/:id — 查询项目状态 ─────────────────────
  router.get('/projects/:id', async (req: Request, res: Response) => {
    if (!prismaDal) {
      return sendError(res, 503, 'PrismaDAL not initialized', ErrorCodes.INTERNAL_ERROR);
    }
    const projectId = req.params.id as string;

    try {
      const project = await prismaDal.getProject(projectId);
      if (!project) {
        return sendError(res, 404, `Project '${projectId}' not found`, ErrorCodes.NOT_FOUND);
      }

      // Extract description from channel_config if present
      let description: string | null = null;
      if (project.channel_config) {
        try {
          const config = JSON.parse(project.channel_config);
          description = config.description || null;
        } catch {}
      }

      return res.status(200).json({
        id: project.id,
        name: project.name,
        status: project.status,
        description,
        pm_soul_prompt: project.pm_soul_prompt,
        created_at: project.created_at,
      });
    } catch (error: any) {
      return sendError(res, 500, 'Failed to get project', ErrorCodes.INTERNAL_ERROR, { message: error.message });
    }
  });

  // ─── POST /api/v1/blueprints — 存入大盘规划 ─────────────────────
  router.post('/blueprints', validateBody('blueprintCreate', blueprintCreateSchema), async (req: Request, res: Response) => {
    if (!prismaDal) {
      return sendError(res, 503, 'PrismaDAL not initialized', ErrorCodes.INTERNAL_ERROR);
    }
    const { project_id, name, blueprint_id, version, schema_json } = req.body;

    try {
      // Verify project exists
      const project = await prismaDal.getProject(project_id);
      if (!project) {
        return sendError(res, 404, `Project '${project_id}' not found`, ErrorCodes.NOT_FOUND);
      }

      // Create blueprint via PrismaDAL
      const blueprint = await prismaDal.createBlueprint({
        project_id,
        name,
        blueprint_id,
        version: version || '1.0',
        schema_json: JSON.stringify(schema_json),
      });

      return res.status(201).json({
        id: blueprint.id,
        blueprint_id: blueprint.blueprint_id,
        name: blueprint.name,
        project_id: blueprint.project_id,
        version: blueprint.version,
        status: blueprint.status,
        created_at: blueprint.created_at,
      });
    } catch (error: any) {
      // Prisma unique constraint violation → duplicate blueprint_id
      if (error.code === 'P2002') {
        return sendError(res, 409, `Blueprint with id '${blueprint_id}' already exists`, ErrorCodes.BAD_REQUEST);
      }
      return sendError(res, 500, 'Failed to create blueprint', ErrorCodes.INTERNAL_ERROR, { message: error.message });
    }
  });

  // ─── GET /api/v1/blueprints/:projectId/next_phase — 获取下一 Phase ──
  router.get('/blueprints/:projectId/next_phase', async (req: Request, res: Response) => {
    if (!prismaDal) {
      return sendError(res, 503, 'PrismaDAL not initialized', ErrorCodes.INTERNAL_ERROR);
    }
    const projectId = req.params.projectId as string;

    try {
      // Verify project exists
      const project = await prismaDal.getProject(projectId);
      if (!project) {
        return sendError(res, 404, `Project '${projectId}' not found`, ErrorCodes.NOT_FOUND);
      }

      // Get all blueprints for this project (most recent first)
      const blueprints = await prismaDal.getBlueprintsByProject(projectId);
      if (!blueprints || blueprints.length === 0) {
        return sendError(res, 404, `No blueprints found for project '${projectId}'`, ErrorCodes.NOT_FOUND);
      }

      // Use the latest blueprint (first one, ordered by updated_at desc)
      const blueprint = blueprints[0];
      const schema = JSON.parse(blueprint.schema_json);
      const phases = schema.phases || [];

      // Find the first phase that is NOT 'completed'
      const nextIndex = phases.findIndex((p: any) => p.status !== 'completed');

      if (nextIndex === -1) {
        // All phases completed
        return res.status(204).send();
      }

      return res.status(200).json({
        phase: phases[nextIndex],
        phase_index: nextIndex,
        total_phases: phases.length,
        blueprint_id: blueprint.blueprint_id,
      });
    } catch (error: any) {
      return sendError(res, 500, 'Failed to get next phase', ErrorCodes.INTERNAL_ERROR, { message: error.message });
    }
  });

  // ═══════════════════════════════════════════════════════════════
  //  T3.3: 动态审核派单引擎（3个接口）
  // ═══════════════════════════════════════════════════════════════

  // ─── POST /api/v1/tasks/:id/submit_proof_v2 — PrismaDAL 驱动的 proof 提交 ──
  router.post('/tasks/:id/submit_proof_v2', validateBody('submitProof', submitProofSchema), async (req: Request, res: Response) => {
    if (!prismaDal) {
      return sendError(res, 503, 'PrismaDAL not initialized', ErrorCodes.INTERNAL_ERROR);
    }
    const taskId = req.params.id as string;
    const { run_id, artifact_type, payload } = req.body;

    try {
      // 1. Validate task and run
      const task = await prismaDal.getTask(taskId);
      if (!task) {
        return sendError(res, 404, `Task '${taskId}' not found`, ErrorCodes.NOT_FOUND);
      }

      const run = await (prismaDal as any).prisma.run.findUnique({ where: { run_id } });
      if (!run) {
        return sendError(res, 404, `Run '${run_id}' not found`, ErrorCodes.NOT_FOUND);
      }

      if (run.task_id !== taskId) {
        return sendError(res, 400, 'Run does not belong to this task', ErrorCodes.BAD_REQUEST);
      }

      if (run.status !== 'running') {
        return sendError(res, 400, 'Run is not in running state', ErrorCodes.BAD_REQUEST, { run_status: run.status });
      }

      if (task.status !== 'dispatched' && task.status !== 'created') {
        return sendError(res, 400, `Cannot submit proof for task in ${task.status} state`, ErrorCodes.BAD_REQUEST);
      }

      // 2. Schema validation (if defined)
      if (task.payload_schema) {
        try {
          const schema = JSON.parse(task.payload_schema);
          if (schema && Object.keys(schema).length > 0) {
            const validate = ajv.compile(schema);
            const isValid = validate(payload) as boolean;
            if (!isValid) {
              const errors = validate.errors?.map(e => ({
                field: (e.instancePath || '/').replace(/^\//, '') || 'root',
                message: e.message || 'Validation failed',
                params: e.params,
              }));
              return sendError(res, 422, 'Payload validation failed', ErrorCodes.VALIDATION_ERROR, errors);
            }
          }
        } catch { /* invalid schema, skip validation */ }
      }

      // 3. Update run → success, create artifact
      await (prismaDal as any).prisma.run.update({
        where: { run_id },
        data: { status: 'success', ended_at: new Date() },
      });

      const newArtifact = await (prismaDal as any).prisma.artifact.create({
        data: {
          run_id,
          artifact_type,
          payload: JSON.stringify(payload),
        },
      });

      // T4.2: Broadcast artifact creation to SSE subscribers
      stateEmitter.emit('state_change', {
        type: 'artifact_created',
        data: {
          id: newArtifact.id,
          run_id,
          artifact_type,
          task_id: taskId,
          payload: typeof payload === 'object' ? payload : { raw: payload },
          created_at: new Date().toISOString(),
        },
      });

      // 4. Transition task to 'validating'
      await prismaDal.updateTaskStatus(taskId, 'validating');

      stateEmitter.emit('state_change', {
        type: 'run_status_updated',
        data: { run_id, status: 'success' },
      });
      stateEmitter.emit('state_change', {
        type: 'task_status_updated',
        data: { task_id: taskId, status: 'validating' },
      });

      // 5. evaluate_task: acceptance_mode routing
      const engine = new ReviewEngine(prismaDal);
      const evalResult = await engine.evaluate_task(taskId, task.project_id);

      stateEmitter.emit('state_change', {
        type: 'task_status_updated',
        data: { task_id: taskId, old_status: 'validating', new_status: evalResult.new_status },
      });

      if (evalResult.review_spawned) {
        stateEmitter.emit('state_change', {
          type: 'review_spawned',
          data: {
            task_id: taskId,
            review_task_id: evalResult.review_task_id,
            review_run_id: evalResult.review_run_id,
          },
        });
      }

      return res.status(201).json({
        message: 'Proof submitted successfully',
        review_spawned: evalResult.review_spawned,
        ...(evalResult.review_task_id && { review_task_id: evalResult.review_task_id }),
        ...(evalResult.review_run_id && { review_run_id: evalResult.review_run_id }),
        new_status: evalResult.new_status,
      });
    } catch (error: any) {
      return sendError(res, 500, 'Submit proof failed', ErrorCodes.INTERNAL_ERROR, { message: error.message });
    }
  });

  // ─── POST /api/v1/tasks/:id/accept — 审核通过 ─────────────────────
  router.post('/tasks/:id/accept', validateBody('taskAccept', taskAcceptSchema), async (req: Request, res: Response) => {
    if (!prismaDal) {
      return sendError(res, 503, 'PrismaDAL not initialized', ErrorCodes.INTERNAL_ERROR);
    }
    const taskId = req.params.id as string;
    const { reviewer_id, note } = req.body;

    try {
      const task = await prismaDal.getTask(taskId);
      if (!task) {
        return sendError(res, 404, `Task '${taskId}' not found`, ErrorCodes.NOT_FOUND);
      }

      if (task.status !== 'review_spawned' && task.status !== 'validating') {
        return sendError(res, 400, `Cannot accept task in '${task.status}' state, expected 'review_spawned' or 'validating'`, ErrorCodes.BAD_REQUEST);
      }

      const engine = new ReviewEngine(prismaDal);
      const result = await engine.accept_review(taskId, reviewer_id || 'unknown', note);

      stateEmitter.emit('state_change', {
        type: 'task_accepted',
        data: { task_id: taskId, reviewer_id: reviewer_id || 'unknown' },
      });

      const updatedTask = await prismaDal.getTask(taskId);
      return res.status(200).json({ task: updatedTask });
    } catch (error: any) {
      if (error.message.startsWith('INVALID_STATE:')) {
        return sendError(res, 400, error.message.replace('INVALID_STATE: ', ''), ErrorCodes.BAD_REQUEST);
      }
      return sendError(res, 500, 'Accept failed', ErrorCodes.INTERNAL_ERROR, { message: error.message });
    }
  });

  // ─── POST /api/v1/tasks/:id/reject — 审核驳回 ─────────────────────
  router.post('/tasks/:id/reject', validateBody('taskReject', taskRejectSchema), async (req: Request, res: Response) => {
    if (!prismaDal) {
      return sendError(res, 503, 'PrismaDAL not initialized', ErrorCodes.INTERNAL_ERROR);
    }
    const taskId = req.params.id as string;
    const { reviewer_id, reason } = req.body;

    try {
      const task = await prismaDal.getTask(taskId);
      if (!task) {
        return sendError(res, 404, `Task '${taskId}' not found`, ErrorCodes.NOT_FOUND);
      }

      if (task.status !== 'review_spawned' && task.status !== 'validating') {
        return sendError(res, 400, `Cannot reject task in '${task.status}' state, expected 'review_spawned' or 'validating'`, ErrorCodes.BAD_REQUEST);
      }

      const engine = new ReviewEngine(prismaDal);
      const result = await engine.reject_review(taskId, reviewer_id || 'unknown', reason);

      stateEmitter.emit('state_change', {
        type: 'task_rejected',
        data: { task_id: taskId, reason, retry_count: result.retry_count },
      });

      const updatedTask = await prismaDal.getTask(taskId);
      return res.status(200).json({ task: updatedTask });
    } catch (error: any) {
      if (error.message.startsWith('INVALID_STATE:')) {
        return sendError(res, 400, error.message.replace('INVALID_STATE: ', ''), ErrorCodes.BAD_REQUEST);
      }
      return sendError(res, 500, 'Reject failed', ErrorCodes.INTERNAL_ERROR, { message: error.message });
    }
  });

  return router;
}
