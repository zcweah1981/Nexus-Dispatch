/**
 * Nexus Dispatch API — /api/v1/* Routes
 * T2.6: All routes hardened with Ajv schema validation + standardized errors
 *
 * Auth is handled globally by server.ts middleware (bearerAuth on /api/v1 prefix).
 */

import { Router, Request, Response } from 'express';
import { PrismaDAL } from '../db/prisma_dal';
import { stateEmitter } from './server';
import { validateBody, sendError, ErrorCodes } from './middleware';
import {
  controllerConfigUpdateSchema,
  blueprintCreateSchema,
  projectInitSchema,
  agentRegisterSchema,
  taskCreateSchema,
  taskStatusUpdateSchema,
  runtimeProjectCreateSchema,
  runtimeAgentRegisterSchema,
  runtimeBlueprintFreezeSchema,
  runtimeBlueprintThawCurrentPhaseSchema,
  runtimeBlueprintAdvancePhaseSchema,
  runtimeTaskCreateSchema,
  runtimeRunCreateSchema,
  runtimeRunStatusUpdateSchema,
  runtimeArtifactCreateSchema,
  runtimeCronjobBindSchema,
  runtimeCronjobStatusUpdateSchema,
  runtimeVisibleLanguageUpdateSchema,
  runtimeControlledTaskActionSchema,
  runtimeControlledSettingsPatchSchema,
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

export function createApiRouter(authToken: string = 'valid-token', prismaDal?: PrismaDAL) {
  void authToken;
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

  router.get('/runtime/projects/:projectId/summary', async (req: Request, res: Response) => {
    const service = runtimeServiceOr503(res);
    if (!service) return;
    try {
      const summary = await service.getProjectSummary(req.params.projectId as string);
      return res.status(200).json({ summary });
    } catch (error: any) {
      return sendRuntimeError(res, error, 'Failed to get runtime project summary');
    }
  });

  router.get('/runtime/projects/:projectId/tasks', async (req: Request, res: Response) => {
    const service = runtimeServiceOr503(res);
    if (!service) return;
    try {
      const tasks = await service.listTasksForWebUI(req.params.projectId as string, {
        status: req.query.status as string | undefined,
        lane_required: req.query.lane as string | undefined,
        task_group_id: req.query.task_group_id as string | undefined,
        include_graph: req.query.include_graph === 'true',
        limit: req.query.limit ? Number(req.query.limit) : undefined,
      });
      return res.status(200).json({ project_id: req.params.projectId, tasks, total: tasks.length });
    } catch (error: any) {
      return sendRuntimeError(res, error, 'Failed to list runtime project tasks');
    }
  });

  router.get('/runtime/projects/:projectId/groups', async (req: Request, res: Response) => {
    const service = runtimeServiceOr503(res);
    if (!service) return;
    try {
      const groups = await service.listTaskGroupsForWebUI(req.params.projectId as string, {
        include_tasks: req.query.include_tasks === 'true',
        limit: req.query.limit ? Number(req.query.limit) : undefined,
      });
      return res.status(200).json({ project_id: req.params.projectId, groups, total: groups.length });
    } catch (error: any) {
      return sendRuntimeError(res, error, 'Failed to list runtime project groups');
    }
  });

  router.get('/runtime/projects/:projectId/dispatch/live', async (req: Request, res: Response) => {
    const service = runtimeServiceOr503(res);
    if (!service) return;
    try {
      const dispatchLive = await service.getDispatchLive(req.params.projectId as string, { limit: req.query.limit ? Number(req.query.limit) : undefined });
      return res.status(200).json({ dispatch_live: dispatchLive });
    } catch (error: any) {
      return sendRuntimeError(res, error, 'Failed to get runtime dispatch live view');
    }
  });

  router.get('/runtime/projects/:projectId/reports', async (req: Request, res: Response) => {
    const service = runtimeServiceOr503(res);
    if (!service) return;
    try {
      const reports = await service.listReportsForWebUI(req.params.projectId as string, {
        message_type: req.query.message_type as string | undefined,
        status: req.query.status as string | undefined,
        task_id: req.query.task_id as string | undefined,
        limit: req.query.limit ? Number(req.query.limit) : undefined,
      });
      return res.status(200).json({ project_id: req.params.projectId, reports, total: reports.length });
    } catch (error: any) {
      return sendRuntimeError(res, error, 'Failed to list runtime project reports');
    }
  });

  router.get('/runtime/projects/:projectId/artifacts', async (req: Request, res: Response) => {
    const service = runtimeServiceOr503(res);
    if (!service) return;
    try {
      const artifacts = await service.listArtifactsForWebUI(req.params.projectId as string, {
        task_id: req.query.task_id as string | undefined,
        run_id: req.query.run_id as string | undefined,
        artifact_type: req.query.artifact_type as string | undefined,
        limit: req.query.limit ? Number(req.query.limit) : undefined,
      });
      return res.status(200).json({ project_id: req.params.projectId, artifacts, total: artifacts.length });
    } catch (error: any) {
      return sendRuntimeError(res, error, 'Failed to list runtime project artifacts');
    }
  });

  router.get('/runtime/projects/:projectId/settings', async (req: Request, res: Response) => {
    const service = runtimeServiceOr503(res);
    if (!service) return;
    try {
      const settings = await service.getProjectSettingsForWebUI(req.params.projectId as string);
      return res.status(200).json({ settings });
    } catch (error: any) {
      return sendRuntimeError(res, error, 'Failed to get runtime project settings');
    }
  });

  router.patch('/runtime/projects/:projectId/settings', validateBody('runtimeControlledSettingsPatch', runtimeControlledSettingsPatchSchema), async (req: Request, res: Response) => {
    const service = runtimeServiceOr503(res);
    if (!service) return;
    const projectId = req.params.projectId as string;
    try {
      const result = await service.updateControlledSettings(projectId, req.body);
      stateEmitter.emit('state_change', { type: 'audit_event_created', data: { project_id: projectId, audit_event_id: result.audit_event.id, action: result.audit_event.action } });
      return res.status(200).json(result);
    } catch (error: any) {
      return sendRuntimeError(res, error, 'Failed to update runtime project settings');
    }
  });

  router.get('/runtime/projects/:projectId/audit-events', async (req: Request, res: Response) => {
    const service = runtimeServiceOr503(res);
    if (!service) return;
    const projectId = req.params.projectId as string;
    try {
      const auditEvents = await service.listAuditEvents(projectId, {
        action: req.query.action as string | undefined,
        target_type: req.query.target_type as string | undefined,
        target_id: req.query.target_id as string | undefined,
        limit: req.query.limit ? Number(req.query.limit) : undefined,
      });
      return res.status(200).json({ project_id: projectId, audit_events: auditEvents, total: auditEvents.length });
    } catch (error: any) {
      return sendRuntimeError(res, error, 'Failed to list runtime project audit events');
    }
  });

  router.get('/runtime/projects/:projectId/directories', async (req: Request, res: Response) => {
    const service = runtimeServiceOr503(res);
    if (!service) return;
    try {
      const directories = await service.getProjectDirectoriesForWebUI(req.params.projectId as string);
      return res.status(200).json({ directories });
    } catch (error: any) {
      return sendRuntimeError(res, error, 'Failed to get runtime project directories');
    }
  });


  router.get('/runtime/projects/:projectId/ops/status', async (req: Request, res: Response) => {
    const service = runtimeServiceOr503(res);
    if (!service) return;
    const projectId = req.params.projectId as string;
    try {
      const opsStatus = await service.getOpsStatus(projectId);
      return res.status(200).json({ ops_status: opsStatus });
    } catch (error: any) {
      return sendRuntimeError(res, error, 'Failed to get runtime ops status');
    }
  });

  router.get('/runtime/projects/:projectId/templates', async (req: Request, res: Response) => {
    const service = runtimeServiceOr503(res);
    if (!service) return;
    const projectId = req.params.projectId as string;
    try {
      const templates = await service.listRuntimeTemplates(projectId, {
        category: req.query.category as string | undefined,
        limit: req.query.limit ? Number(req.query.limit) : undefined,
        offset: req.query.offset ? Number(req.query.offset) : undefined,
      });
      const offset = req.query.offset ? Number(req.query.offset) : 0;
      return res.status(200).json({ project_id: projectId, templates, total: templates.length, next_cursor: String(offset + templates.length) });
    } catch (error: any) {
      return sendRuntimeError(res, error, 'Failed to list runtime templates');
    }
  });

  router.get('/runtime/projects/:projectId/observability', async (req: Request, res: Response) => {
    const service = runtimeServiceOr503(res);
    if (!service) return;
    try {
      const observability = await service.getObservabilityForWebUI(req.params.projectId as string);
      return res.status(200).json({ observability });
    } catch (error: any) {
      return sendRuntimeError(res, error, 'Failed to get runtime project observability');
    }
  });

  router.get('/runtime/projects/:projectId/release/readiness', async (req: Request, res: Response) => {
    const service = runtimeServiceOr503(res);
    if (!service) return;
    try {
      const releaseReadiness = await service.getReleaseReadiness(req.params.projectId as string);
      return res.status(200).json({ release_readiness: releaseReadiness });
    } catch (error: any) {
      return sendRuntimeError(res, error, 'Failed to get runtime release readiness');
    }
  });

  router.get('/runtime/projects/:projectId/leak-scan/summary', async (req: Request, res: Response) => {
    const service = runtimeServiceOr503(res);
    if (!service) return;
    try {
      const leakScanSummary = await service.getLeakScanSummary(req.params.projectId as string);
      return res.status(200).json({ leak_scan_summary: leakScanSummary });
    } catch (error: any) {
      return sendRuntimeError(res, error, 'Failed to get runtime leak scan summary');
    }
  });

  router.get('/runtime/projects/:projectId/proofs', async (req: Request, res: Response) => {
    const service = runtimeServiceOr503(res);
    if (!service) return;
    const projectId = req.params.projectId as string;
    try {
      const proofs = await service.searchProofs(projectId, {
        query: req.query.query as string | undefined,
        artifact_type: req.query.artifact_type as string | undefined,
        task_id: req.query.task_id as string | undefined,
        run_id: req.query.run_id as string | undefined,
        limit: req.query.limit ? Number(req.query.limit) : undefined,
      });
      return res.status(200).json({ project_id: projectId, proofs, total: proofs.length });
    } catch (error: any) {
      return sendRuntimeError(res, error, 'Failed to search runtime proofs');
    }
  });

  router.get('/runtime/projects/:projectId/observability/metrics', async (req: Request, res: Response) => {
    const service = runtimeServiceOr503(res);
    if (!service) return;
    try {
      const metrics = await service.getObservabilityMetrics(req.params.projectId as string);
      return res.status(200).json({ metrics });
    } catch (error: any) {
      return sendRuntimeError(res, error, 'Failed to get runtime observability metrics');
    }
  });

  router.get('/runtime/projects/:projectId/agents/performance', async (req: Request, res: Response) => {
    const service = runtimeServiceOr503(res);
    if (!service) return;
    const projectId = req.params.projectId as string;
    try {
      const agentPerformance = await service.getAgentPerformance(projectId);
      return res.status(200).json({ project_id: projectId, agent_performance: agentPerformance, total: agentPerformance.length });
    } catch (error: any) {
      return sendRuntimeError(res, error, 'Failed to get runtime agent performance');
    }
  });

  router.get('/runtime/projects/:projectId/settings/visible-language', async (req: Request, res: Response) => {
    const service = runtimeServiceOr503(res);
    if (!service) return;
    const projectId = req.params.projectId as string;
    try {
      const setting = await service.getVisibleLanguage(projectId);
      return res.status(200).json(setting);
    } catch (error: any) {
      return sendRuntimeError(res, error, 'Failed to get runtime project visible language');
    }
  });

  router.patch('/runtime/projects/:projectId/settings/visible-language', validateBody('runtimeVisibleLanguageUpdate', runtimeVisibleLanguageUpdateSchema), async (req: Request, res: Response) => {
    const service = runtimeServiceOr503(res);
    if (!service) return;
    const projectId = req.params.projectId as string;
    try {
      const setting = await service.updateVisibleLanguage(projectId, req.body.visible_language);
      stateEmitter.emit('state_change', { type: 'project_visible_language_updated', data: { project_id: projectId, visible_language: setting.visible_language } });
      return res.status(200).json(setting);
    } catch (error: any) {
      return sendRuntimeError(res, error, 'Failed to update runtime project visible language');
    }
  });

  router.post('/runtime/projects/:projectId/agents', validateBody('runtimeAgentRegister', runtimeAgentRegisterSchema), async (req: Request, res: Response) => {
    const service = runtimeServiceOr503(res);
    if (!service) return;
    const projectId = req.params.projectId as string;
    try {
      const agent = await service.registerAgent(projectId, req.body);
      stateEmitter.emit('state_change', { type: 'agent_registered', data: { project_id: projectId, agent_id: agent.agent_id, lane: agent.lane, status: agent.status } });
      return res.status(201).json({ agent });
    } catch (error: any) {
      return sendRuntimeError(res, error, 'Failed to register runtime project agent');
    }
  });

  router.post('/runtime/blueprints/freeze', validateBody('runtimeBlueprintFreeze', runtimeBlueprintFreezeSchema), async (req: Request, res: Response) => {
    const service = runtimeServiceOr503(res);
    if (!service) return;
    try {
      const result = await service.freezeBlueprint(req.body);
      stateEmitter.emit('state_change', { type: 'blueprint_frozen', data: { project_id: result.project_id, blueprint_id: result.blueprint_id, status: result.status } });
      return res.status(201).json({ result });
    } catch (error: any) {
      return sendRuntimeError(res, error, 'Failed to freeze runtime blueprint');
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

  router.get('/runtime/tasks/pending', async (req: Request, res: Response) => {
    const service = runtimeServiceOr503(res);
    if (!service) return;
    const projectId = req.query.project_id as string | undefined;
    if (!projectId) return sendError(res, 400, 'project_id query is required', ErrorCodes.BAD_REQUEST);
    const lane = req.query.lane as string | undefined;
    try {
      const tasks = await service.listPendingTasks(projectId, lane ? { lane_required: lane } : undefined);
      return res.status(200).json({ tasks, total: tasks.length });
    } catch (error: any) {
      return sendRuntimeError(res, error, 'Failed to list pending runtime tasks');
    }
  });

  router.post('/runtime/projects/:projectId/tasks/:taskId/dispatch', validateBody('runtimeControlledTaskAction', runtimeControlledTaskActionSchema), async (req: Request, res: Response) => {
    const service = runtimeServiceOr503(res);
    if (!service) return;
    const { projectId, taskId } = req.params as { projectId: string; taskId: string };
    try {
      const result = await service.controlledTaskAction(projectId, taskId, 'dispatch', req.body);
      stateEmitter.emit('state_change', { type: 'task_transitioned', data: { project_id: projectId, task_id: taskId, new_status: result.task.status } });
      stateEmitter.emit('state_change', { type: 'audit_event_created', data: { project_id: projectId, audit_event_id: result.audit_event.id, action: result.audit_event.action } });
      return res.status(200).json(result);
    } catch (error: any) {
      return sendRuntimeError(res, error, 'Failed to dispatch task through controlled runtime action');
    }
  });

  router.post('/runtime/projects/:projectId/tasks/:taskId/retry', validateBody('runtimeControlledTaskAction', runtimeControlledTaskActionSchema), async (req: Request, res: Response) => {
    const service = runtimeServiceOr503(res);
    if (!service) return;
    const { projectId, taskId } = req.params as { projectId: string; taskId: string };
    try {
      const result = await service.controlledTaskAction(projectId, taskId, 'retry', req.body);
      stateEmitter.emit('state_change', { type: 'task_transitioned', data: { project_id: projectId, task_id: taskId, new_status: result.task.status } });
      stateEmitter.emit('state_change', { type: 'audit_event_created', data: { project_id: projectId, audit_event_id: result.audit_event.id, action: result.audit_event.action } });
      return res.status(200).json(result);
    } catch (error: any) {
      return sendRuntimeError(res, error, 'Failed to retry task through controlled runtime action');
    }
  });

  router.post('/runtime/projects/:projectId/tasks/:taskId/cancel', validateBody('runtimeControlledTaskAction', runtimeControlledTaskActionSchema), async (req: Request, res: Response) => {
    const service = runtimeServiceOr503(res);
    if (!service) return;
    const { projectId, taskId } = req.params as { projectId: string; taskId: string };
    try {
      const result = await service.controlledTaskAction(projectId, taskId, 'cancel', req.body);
      stateEmitter.emit('state_change', { type: 'task_transitioned', data: { project_id: projectId, task_id: taskId, new_status: result.task.status } });
      stateEmitter.emit('state_change', { type: 'audit_event_created', data: { project_id: projectId, audit_event_id: result.audit_event.id, action: result.audit_event.action } });
      return res.status(200).json(result);
    } catch (error: any) {
      return sendRuntimeError(res, error, 'Failed to cancel task through controlled runtime action');
    }
  });

  router.post('/runtime/tasks/recover-timeouts', validateBody('taskRecoverTimeouts', taskRecoverTimeoutsSchema), async (req: Request, res: Response) => {
    const service = runtimeServiceOr503(res);
    if (!service) return;
    const { project_id, timeout_minutes } = req.body;
    try {
      const recoveredIds = await service.recoverTimeouts(project_id, timeout_minutes || 15);
      if (recoveredIds.length > 0) {
        stateEmitter.emit('state_change', { type: 'tasks_recovered', data: { project_id, task_ids: recoveredIds, count: recoveredIds.length } });
      }
      return res.status(200).json({ recovered: recoveredIds.length, task_ids: recoveredIds });
    } catch (error: any) {
      return sendRuntimeError(res, error, 'Failed to recover runtime task timeouts');
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

  router.post('/runtime/tasks/:id/claim', validateBody('taskClaimById', taskClaimByIdSchema), async (req: Request, res: Response) => {
    const service = runtimeServiceOr503(res);
    if (!service) return;
    const { project_id } = req.body;
    try {
      const task = await service.claimTask(project_id, req.params.id as string);
      stateEmitter.emit('state_change', { type: 'task_status_updated', data: { project_id, task_id: task.id, old_status: 'created', new_status: 'dispatched' } });
      return res.status(200).json({ task });
    } catch (error: any) {
      return sendRuntimeError(res, error, 'Failed to claim runtime task');
    }
  });

  router.patch('/runtime/tasks/:id/status', validateBody('taskStatusUpdate', taskStatusUpdateSchema), async (req: Request, res: Response) => {
    const service = runtimeServiceOr503(res);
    if (!service) return;
    const { project_id, status, proof_data, ext_meta } = req.body;
    try {
      const existing = await service.getTask(project_id, req.params.id as string);
      const task = await service.setTaskStatus(project_id, req.params.id as string, status, { proof_data, ext_meta });
      stateEmitter.emit('state_change', { type: 'task_status_updated', data: { project_id, task_id: task.id, old_status: existing.status, new_status: status } });
      return res.status(200).json({ task });
    } catch (error: any) {
      return sendRuntimeError(res, error, 'Failed to update runtime task status');
    }
  });

  router.post('/runtime/blueprints/thaw-current-phase', validateBody('runtimeBlueprintThawCurrentPhase', runtimeBlueprintThawCurrentPhaseSchema), async (req: Request, res: Response) => {
    const service = runtimeServiceOr503(res);
    if (!service) return;
    try {
      const result = await service.thawCurrentPhase(req.body);
      stateEmitter.emit('state_change', {
        type: 'blueprint_phase_thawed',
        data: {
          project_id: result.project_id,
          blueprint_id: result.blueprint_id,
          phase_id: result.phase_id,
          group_id: result.group_id,
          created_task_ids: result.created_task_ids,
        },
      });
      if (result.created_group) {
        stateEmitter.emit('state_change', {
          type: 'group_status_updated',
          data: { project_id: result.project_id, group_id: result.group_id, status: 'active' },
        });
      }
      return res.status(result.created_task_ids.length > 0 || result.created_group ? 201 : 200).json({ result });
    } catch (error: any) {
      return sendRuntimeError(res, error, 'Failed to thaw runtime blueprint phase');
    }
  });

  router.post('/runtime/blueprints/advance-phase', validateBody('runtimeBlueprintAdvancePhase', runtimeBlueprintAdvancePhaseSchema), async (req: Request, res: Response) => {
    const service = runtimeServiceOr503(res);
    if (!service) return;
    try {
      const result = await service.advancePhase(req.body);
      if (!result) return res.status(204).send();
      stateEmitter.emit('state_change', {
        type: 'blueprint_phase_advanced',
        data: {
          project_id: result.project_id,
          blueprint_id: result.blueprint_id,
          phase_id: result.phase_id,
          group_id: result.group_id,
          created_task_ids: result.created_task_ids,
        },
      });
      if (result.created_group) {
        stateEmitter.emit('state_change', {
          type: 'group_status_updated',
          data: { project_id: result.project_id, group_id: result.group_id, status: 'active' },
        });
      }
      return res.status(result.created_task_ids.length > 0 || result.created_group ? 201 : 200).json({ result });
    } catch (error: any) {
      return sendRuntimeError(res, error, 'Failed to advance runtime blueprint phase');
    }
  });

  router.get('/runtime/projects/:projectId/agents', async (req: Request, res: Response) => {
    const service = runtimeServiceOr503(res);
    if (!service) return;
    const projectId = req.params.projectId as string;
    const lane = req.query.lane as string | undefined;
    const status = req.query.status as string | undefined;
    try {
      const agents = await service.listAgents(projectId, {
        ...(lane ? { lane } : {}),
        ...(status ? { status } : {}),
      });
      return res.status(200).json({ agents });
    } catch (error: any) {
      return sendRuntimeError(res, error, 'Failed to list runtime project agents');
    }
  });

  router.get('/runtime/projects/:projectId/review-policies', async (req: Request, res: Response) => {
    const service = runtimeServiceOr503(res);
    if (!service) return;
    const projectId = req.params.projectId as string;
    const enabled = req.query.enabled === undefined ? undefined : req.query.enabled === 'true';
    const agentId = req.query.agent_id as string | undefined;
    const lane = req.query.lane as string | undefined;
    try {
      const reviewPolicies = await service.listReviewPolicies(projectId, {
        ...(enabled !== undefined ? { enabled } : {}),
        ...(agentId ? { agent_id: agentId } : {}),
        ...(lane ? { lane } : {}),
      });
      return res.status(200).json({ review_policies: reviewPolicies, reviewPolicies });
    } catch (error: any) {
      return sendRuntimeError(res, error, 'Failed to list runtime review policies');
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

  router.post('/runtime/artifacts', validateBody('runtimeArtifactCreate', runtimeArtifactCreateSchema), async (req: Request, res: Response) => {
    const service = runtimeServiceOr503(res);
    if (!service) return;
    const { project_id, ...artifactInput } = req.body;
    try {
      const artifact = await service.createArtifact(project_id, artifactInput);
      stateEmitter.emit('state_change', {
        type: 'artifact_created',
        data: { project_id, id: artifact.id, run_id: artifact.run_id, task_id: artifact.task_id, artifact_type: artifact.artifact_type },
      });
      return res.status(201).json({ artifact });
    } catch (error: any) {
      return sendRuntimeError(res, error, 'Failed to create runtime artifact');
    }
  });

  router.post('/runtime/projects/cronjobs', validateBody('runtimeCronjobBind', runtimeCronjobBindSchema), async (req: Request, res: Response) => {
    const service = runtimeServiceOr503(res);
    if (!service) return;
    const { project_id, ...cronjobInput } = req.body;
    try {
      const cronjob = await service.bindCronjob(project_id, cronjobInput);
      stateEmitter.emit('state_change', { type: 'project_cronjob_bound', data: { project_id, cronjob_id: cronjob.cronjob_id, status: cronjob.status } });
      return res.status(201).json({ cronjob });
    } catch (error: any) {
      return sendRuntimeError(res, error, 'Failed to bind runtime project cronjob');
    }
  });

  router.get('/runtime/projects/:projectId/cronjobs', async (req: Request, res: Response) => {
    const service = runtimeServiceOr503(res);
    if (!service) return;
    const projectId = req.params.projectId as string;
    const status = req.query.status as string | undefined;
    const enabledPolicy = req.query.enabled_policy as string | undefined;
    const eligible = req.query.eligible === 'true';
    const maintenance = req.query.maintenance === 'true';
    try {
      const cronjobs = eligible
        ? await service.listEligibleCronjobs(projectId, { maintenance })
        : await service.listCronjobs(projectId, {
          ...(status ? { status } : {}),
          ...(enabledPolicy ? { enabled_policy: enabledPolicy } : {}),
        });
      return res.status(200).json({ cronjobs });
    } catch (error: any) {
      return sendRuntimeError(res, error, 'Failed to list runtime project cronjobs');
    }
  });

  router.patch('/runtime/projects/:projectId/cronjobs/:cronjobId/status', validateBody('runtimeCronjobStatusUpdate', runtimeCronjobStatusUpdateSchema), async (req: Request, res: Response) => {
    const service = runtimeServiceOr503(res);
    if (!service) return;
    const projectId = req.params.projectId as string;
    const cronjobId = req.params.cronjobId as string;
    const { status, config_json, last_run_at } = req.body;
    try {
      const cronjob = await service.updateCronjobStatus(projectId, cronjobId, status, {
        config_json,
        last_run_at: last_run_at ? new Date(last_run_at) : undefined,
      });
      stateEmitter.emit('state_change', { type: 'project_cronjob_status_updated', data: { project_id: projectId, cronjob_id: cronjob.cronjob_id, status: cronjob.status } });
      return res.status(200).json({ cronjob });
    } catch (error: any) {
      return sendRuntimeError(res, error, 'Failed to update runtime project cronjob status');
    }
  });

  router.post('/runtime/reports', validateBody('runtimeReportCreate', runtimeReportCreateSchema), async (req: Request, res: Response) => {
    const service = runtimeServiceOr503(res);
    if (!service) return;
    const { project_id, ...reportInput } = req.body;
    try {
      const report = await service.createReport(project_id, reportInput);
      stateEmitter.emit('state_change', {
        type: report.message_type === 'group_summary' ? 'group_summary_created' : 'report_created',
        data: {
          project_id,
          id: report.id,
          report_id: report.id,
          message_type: report.message_type,
          status: report.status,
          summary: report.summary,
          created_at: report.created_at,
        },
      });
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
      stateEmitter.emit('state_change', {
        type: report.message_type === 'group_summary' ? 'group_summary_created' : 'report_status_updated',
        data: {
          project_id,
          id: report.id,
          report_id: report.id,
          message_type: report.message_type,
          status: report.status,
          summary: report.summary,
          updated_at: new Date().toISOString(),
        },
      });
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

  // ─── POST /api/v1/tasks — V8 compatibility shim; writes through Runtime service ──
  router.post('/tasks', validateBody('taskCreate', taskCreateSchema), async (req: Request, res: Response) => {
    const service = runtimeServiceOr503(res);
    if (!service) return;
    const { project_id, ...taskInput } = req.body;
    try {
      const task = await service.createTask(project_id, taskInput);
      stateEmitter.emit('state_change', {
        type: 'task_created',
        data: { task_id: task.id, project_id, title: task.title, status: task.status },
      });
      return res.status(201).json({ task });
    } catch (error: any) {
      return sendRuntimeError(res, error, 'Failed to create task');
    }
  });

  // ─── GET /api/v1/tasks/pending — V8 compatibility shim; reads through Runtime service ──
  router.get('/tasks/pending', async (req: Request, res: Response) => {
    const service = runtimeServiceOr503(res);
    if (!service) return;
    const projectId = req.query.project_id as string | undefined;
    if (!projectId) return sendError(res, 400, 'project_id query is required', ErrorCodes.BAD_REQUEST);
    const lane = req.query.lane as string | undefined;

    try {
      const tasks = await service.listPendingTasks(projectId, lane ? { lane_required: lane } : undefined);
      return res.status(200).json({ tasks, total: tasks.length });
    } catch (error: any) {
      return sendRuntimeError(res, error, 'Failed to fetch pending tasks');
    }
  });

  // ─── GET /api/v1/tasks/:id — V8 compatibility shim; project scoped ──
  router.get('/tasks/:id', async (req: Request, res: Response) => {
    const service = runtimeServiceOr503(res);
    if (!service) return;
    const taskId = req.params.id as string;
    const projectId = req.query.project_id as string | undefined;
    if (!projectId) return sendError(res, 400, 'project_id query is required', ErrorCodes.BAD_REQUEST);

    try {
      const task = await service.getTask(projectId, taskId);
      return res.status(200).json({ task });
    } catch (error: any) {
      return sendRuntimeError(res, error, 'Failed to get task');
    }
  });

  // ─── PATCH /api/v1/tasks/:id/status — V8 compatibility shim; writes through Runtime service ──
  router.patch('/tasks/:id/status', validateBody('taskStatusUpdate', taskStatusUpdateSchema), async (req: Request, res: Response) => {
    const service = runtimeServiceOr503(res);
    if (!service) return;
    const taskId = req.params.id as string;
    const { project_id, status, proof_data, ext_meta } = req.body;
    if (!project_id) return sendError(res, 400, 'project_id body field is required', ErrorCodes.BAD_REQUEST);

    try {
      const existing = await service.getTask(project_id, taskId);
      const updated = await service.setTaskStatus(project_id, taskId, status, { proof_data, ext_meta });
      stateEmitter.emit('state_change', {
        type: 'task_status_updated',
        data: { task_id: taskId, old_status: existing.status, new_status: status },
      });
      return res.status(200).json({ task: updated });
    } catch (error: any) {
      return sendRuntimeError(res, error, 'Failed to update task status');
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

  // V8-R10: legacy direct-DB task claim/release/submit_proof routes retired from production router.

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

  // ─── POST /api/v1/tasks/recover-timeouts — V8 compatibility shim ──
  router.post('/tasks/recover-timeouts', validateBody('taskRecoverTimeouts', taskRecoverTimeoutsSchema), async (req: Request, res: Response) => {
    const service = runtimeServiceOr503(res);
    if (!service) return;
    const { project_id, timeout_minutes } = req.body;
    if (!project_id) return sendError(res, 400, 'project_id body field is required', ErrorCodes.BAD_REQUEST);

    try {
      const recoveredIds = await service.recoverTimeouts(project_id, timeout_minutes || 15);
      if (recoveredIds.length > 0) {
        stateEmitter.emit('state_change', { type: 'tasks_recovered', data: { task_ids: recoveredIds, count: recoveredIds.length } });
      }
      return res.status(200).json({ recovered: recoveredIds.length, task_ids: recoveredIds });
    } catch (error: any) {
      return sendRuntimeError(res, error, 'Failed to recover timed-out tasks');
    }
  });

  // ─── POST /api/v1/tasks/:id/claim — V8 compatibility shim ──
  router.post('/tasks/:id/claim', validateBody('taskClaimById', taskClaimByIdSchema), async (req: Request, res: Response) => {
    const service = runtimeServiceOr503(res);
    if (!service) return;
    const taskId = req.params.id as string;
    const { project_id } = req.body;
    if (!project_id) return sendError(res, 400, 'project_id body field is required', ErrorCodes.BAD_REQUEST);

    try {
      const claimed = await service.claimTask(project_id, taskId);
      stateEmitter.emit('state_change', { type: 'task_status_updated', data: { task_id: taskId, old_status: 'created', new_status: 'dispatched' } });
      return res.status(200).json({ task: claimed });
    } catch (error: any) {
      return sendRuntimeError(res, error, 'Failed to claim task');
    }
  });

  // ─── POST /api/v1/runs — V8 compatibility shim ──
  router.post('/runs', validateBody('runCreate', runCreateSchema), async (req: Request, res: Response) => {
    const service = runtimeServiceOr503(res);
    if (!service) return;
    const { project_id, ...runInput } = req.body;
    if (!project_id) return sendError(res, 400, 'project_id body field is required', ErrorCodes.BAD_REQUEST);

    try {
      const run = await service.createRun(project_id, runInput);
      stateEmitter.emit('state_change', { type: 'run_created', data: { run_id: run.run_id, task_id: run.task_id, agent_id: run.agent_id } });
      return res.status(201).json({ run });
    } catch (error: any) {
      return sendRuntimeError(res, error, 'Failed to create run');
    }
  });

  // ─── PATCH /api/v1/runs/:id/status — V8 compatibility shim ──
  router.patch('/runs/:id/status', validateBody('runStatusUpdate', runStatusUpdateSchema), async (req: Request, res: Response) => {
    const service = runtimeServiceOr503(res);
    if (!service) return;
    const runId = req.params.id as string;
    const { project_id, status, error_stack, result_summary } = req.body;
    if (!project_id) return sendError(res, 400, 'project_id body field is required', ErrorCodes.BAD_REQUEST);

    try {
      const run = await service.updateRunStatus(project_id, runId, status, { error_stack, result_summary });
      stateEmitter.emit('state_change', { type: 'run_status_updated', data: { run_id: runId, status } });
      return res.status(200).json({ run });
    } catch (error: any) {
      return sendRuntimeError(res, error, 'Failed to update run status');
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

  // V8-R10: legacy dynamic review /tasks/:id submit_proof_v2/accept/reject routes retired.

  return router;
}
