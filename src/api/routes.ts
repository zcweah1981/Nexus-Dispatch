/**
 * Nexus Dispatch API — /api/v1/* Routes
 * T2.6: All routes hardened with Ajv schema validation + standardized errors
 *
 * Auth is handled globally by server.ts middleware (bearerAuth on /api/v1 prefix).
 */

import { Router, Request, Response } from 'express';
import DAL from '../db/dal';
import { v4 as uuidv4 } from 'uuid';
import Ajv from 'ajv';
import { stateEmitter } from './server';
import { validateBody, sendError, ErrorCodes } from './middleware';
import {
  taskClaimSchema,
  taskReleaseSchema,
  submitProofSchema,
} from './schemas';

const ajv = new Ajv();

export function createApiRouter(dal: DAL, authToken: string = 'valid-token') {
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

  return router;
}
