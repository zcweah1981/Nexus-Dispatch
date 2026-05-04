/**
 * Nexus Dispatch API Server
 * T2.6: Hardened with global Bearer auth + Ajv validation + standardized errors
 */

import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import Ajv from 'ajv';
import DAL from '../db/dal';
import EventEmitter from 'events';
import { v4 as uuidv4 } from 'uuid';
import * as fs from 'fs';
import * as path from 'path';

import { createApiRouter } from './routes';
import {
  bearerAuth,
  validateBody,
  notFoundHandler,
  globalErrorHandler,
  sendError,
  ErrorCodes,
} from './middleware';
import {
  projectInitSchema,
  agentRegisterSchema,
  taskAckSchema,
  webhookArtifactsSchema,
} from './schemas';

const ajv = new Ajv();

// Event emitter to broadcast state changes
export const stateEmitter = new EventEmitter();

export function createServer(dal: DAL, authToken: string = 'valid-token') {
  const app = express();

  // Enable CORS for frontend connection
  app.use(cors());
  app.use(express.json());

  // ─── Auth middleware: ALL /api/v1/* routes require Bearer token ────
  app.use('/api/v1', bearerAuth(authToken));

  // ─── API Router (all /api/v1/* business routes) ───────────────────
  app.use('/api/v1', createApiRouter(dal, authToken));

  // ─── Legacy /v1/* routes (kept for backward compat, also auth-protected) ─
  // These use per-route auth + schema validation
  const legacyAuth = bearerAuth(authToken);

  // POST /v1/projects/init
  app.post('/v1/projects/init', legacyAuth, validateBody('projectInit', projectInitSchema), (req: Request, res: Response) => {
    const { name, description } = req.body;

    const projectId = uuidv4();
    try {
      (dal as any).db.transaction(() => {
        const stmt = (dal as any).db.prepare(`
          INSERT INTO nexus_projects (id, name, description)
          VALUES (?, ?, ?)
        `);
        stmt.run(projectId, name, description || null);
      })();

      // Initialize physical directory tree
      const projectRoot = path.resolve(process.env.NEXUS_ROOT || '/root/.hermes/projects', projectId);
      if (!fs.existsSync(projectRoot)) {
        fs.mkdirSync(projectRoot, { recursive: true });
        fs.writeFileSync(path.join(projectRoot, 'PROJECT.md'), `# ${name}\n\n${description || ''}`);
        fs.writeFileSync(path.join(projectRoot, 'FILE_INDEX.md'), '# File Index\n');
      }

      return res.status(201).json({ id: projectId, name, status: 'active' });
    } catch (error: any) {
      return sendError(res, 500, 'Failed to init project', ErrorCodes.INTERNAL_ERROR, { message: error.message });
    }
  });

  // POST /v1/agents/register
  app.post('/v1/agents/register', legacyAuth, validateBody('agentRegister', agentRegisterSchema), (req: Request, res: Response) => {
    const { id, lane } = req.body;

    try {
      (dal as any).db.transaction(() => {
        const stmt = (dal as any).db.prepare(`
          INSERT INTO nexus_workers (id, lane, status, last_heartbeat)
          VALUES (?, ?, 'online', CURRENT_TIMESTAMP)
          ON CONFLICT(id) DO UPDATE SET
            lane = excluded.lane,
            status = 'online',
            last_heartbeat = CURRENT_TIMESTAMP
        `);
        stmt.run(id, lane);
      })();
      return res.status(200).json({ id, lane, status: 'online' });
    } catch (error: any) {
      return sendError(res, 500, 'Failed to register agent', ErrorCodes.INTERNAL_ERROR, { message: error.message });
    }
  });

  // SSE Endpoint for frontend (no auth — public event stream)
  app.get('/v1/events/stream', (req: Request, res: Response) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('Access-Control-Allow-Origin', '*');

    res.write(`data: ${JSON.stringify({ type: 'connected', message: 'SSE connection established' })}\n\n`);

    const heartbeat = setInterval(() => {
      res.write(`data: ${JSON.stringify({ type: 'ping', timestamp: Date.now() })}\n\n`);
    }, 15000);

    const onStateChange = (event: any) => {
      res.write(`data: ${JSON.stringify(event)}\n\n`);
    };

    stateEmitter.on('state_change', onStateChange);

    req.on('close', () => {
      clearInterval(heartbeat);
      stateEmitter.off('state_change', onStateChange);
    });
  });

  // POST /v1/tasks/:id/acknowledge
  app.post('/v1/tasks/:id/acknowledge', legacyAuth, validateBody('taskAck', taskAckSchema), (req: Request, res: Response) => {
    const taskId = req.params.id as string;
    const { worker_id, run_id } = req.body;

    const task = dal.getTask(taskId);
    if (!task) {
      return sendError(res, 404, 'Task not found', ErrorCodes.NOT_FOUND);
    }

    if (task.status !== 'dispatched') {
      return sendError(res, 400, 'Task is not in dispatched state', ErrorCodes.BAD_REQUEST, { current_status: task.status });
    }

    try {
      (dal as any).db.transaction(() => {
        try {
          stateEmitter.emit('state_change', {
            type: 'task_acknowledged',
            data: { task_id: taskId, worker_id, run_id },
          });
        } catch (err) {}
      })();
      return res.status(200).json({ message: 'Task acknowledged' });
    } catch (error: any) {
      return sendError(res, 500, 'Failed to acknowledge task', ErrorCodes.INTERNAL_ERROR, { message: error.message });
    }
  });

  // POST /v1/webhook/artifacts
  app.post('/v1/webhook/artifacts', legacyAuth, validateBody('webhookArtifacts', webhookArtifactsSchema), (req: Request, res: Response) => {
    const { run_id, artifact_type, payload } = req.body;

    const run = dal.getRun(run_id);
    if (!run) {
      return sendError(res, 404, 'Run not found', ErrorCodes.NOT_FOUND);
    }
    if (run.status !== 'running') {
      return sendError(res, 400, 'Run is not in running state', ErrorCodes.BAD_REQUEST, { run_status: run.status });
    }

    const task = dal.getTask(run.task_id);
    if (!task) {
      return sendError(res, 404, 'Task not found', ErrorCodes.NOT_FOUND);
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
      (dal as any).db.transaction(() => {
        const updateRunStmt = (dal as any).db.prepare(`
          UPDATE nexus_runs SET status = 'success', ended_at = CURRENT_TIMESTAMP WHERE run_id = ?
        `);
        updateRunStmt.run(run_id);

        const updateTaskStmt = (dal as any).db.prepare(`
          UPDATE nexus_tasks SET status = 'validating' WHERE id = ?
        `);
        updateTaskStmt.run(run.task_id);

        try {
          const stmt = (dal as any).db.prepare(`
            INSERT INTO nexus_artifacts (id, run_id, artifact_type, payload_data) VALUES (?, ?, ?, ?)
          `);
          stmt.run(uuidv4(), run_id, artifact_type, JSON.stringify(payload));
        } catch (e) {
          console.error('Failed to insert artifact', e);
        }

        try {
          stateEmitter.emit('state_change', { type: 'run_status_updated', data: { run_id, status: 'success' } });
          stateEmitter.emit('state_change', { type: 'task_status_updated', data: { task_id: run.task_id, status: 'validating' } });
        } catch (err) {}
      })();
    } catch (err: any) {
      return sendError(res, 500, 'Database transaction failed', ErrorCodes.INTERNAL_ERROR, { message: err.message });
    }

    return res.status(201).json({ message: 'Success' });
  });

  // ─── 404 handler for unmatched API routes ─────────────────────────
  app.use('/api/v1', notFoundHandler);

  // ─── Global error handler (must be last) ──────────────────────────
  app.use(globalErrorHandler);

  return app;
}
