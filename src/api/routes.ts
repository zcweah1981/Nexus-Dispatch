/**
 * Nexus Dispatch API — /api/v1/* Routes
 * T2.6: All routes hardened with Ajv schema validation + standardized errors
 *
 * Auth is handled globally by server.ts middleware (bearerAuth on /api/v1 prefix).
 */

import { Router, Request, Response } from 'express';
import DAL from '../db/dal';
import { PrismaDAL } from '../db/prisma_dal';
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
} from './schemas';

const ajv = new Ajv();

export function createApiRouter(dal: DAL, authToken: string = 'valid-token', prismaDal?: PrismaDAL) {
  const router = Router();

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

  return router;
}
