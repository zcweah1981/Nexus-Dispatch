import { Router, Request, Response } from 'express';
import DAL from '../db/dal';
import { v4 as uuidv4 } from 'uuid';
import Ajv from 'ajv';
import { stateEmitter } from './server';

const ajv = new Ajv();

export function createApiRouter(dal: DAL, authToken: string = 'valid-token') {
    const router = Router();
    
    // Auth Middleware
    const authMiddleware = (req: Request, res: Response, next: any) => {
        const authHeader = req.headers.authorization;
        if (!authHeader || authHeader !== `Bearer ${authToken}`) {
            return res.status(401).json({ error: 'Unauthorized' });
        }
        next();
    };

    
    router.post('/tasks/claim', authMiddleware, (req: Request, res: Response) => {
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
                return res.status(404).json({ message: 'No tasks available' });
            }
            return res.status(200).json({ task });
        } catch (error: any) {
            return res.status(500).json({ error: 'Failed to claim task', details: error.message });
        }
    });

    router.post('/tasks/:id/release', authMiddleware, (req: Request, res: Response) => {
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
            return res.status(500).json({ error: 'Failed to release task', details: error.message });
        }
    });

    router.post('/tasks/:id/submit_proof', authMiddleware, (req: Request, res: Response) => {
        const taskId = req.params.id as string;
        const { run_id, artifact_type, payload } = req.body;

        if (!run_id || !artifact_type || payload === undefined) {
            return res.status(400).json({ error: 'Missing required fields: run_id, artifact_type, payload' });
        }

        const task = dal.getTask(taskId);
        if (!task) {
            return res.status(404).json({ error: 'Task not found' });
        }

        const run = dal.getRun(run_id);
        if (!run) {
            return res.status(404).json({ error: 'Run not found' });
        }

        if (run.task_id !== taskId) {
            return res.status(400).json({ error: 'Run does not belong to this task' });
        }

        if (run.status !== 'running') {
            return res.status(400).json({ error: 'Run is not in running state' });
        }

        if (task.status !== 'dispatched' && task.status !== 'created') {
             return res.status(400).json({ error: `Cannot submit proof for task in ${task.status} state` });
        }

        // Schema validation
        let isValid = true;
        let errors = null;
        if (task.payload_schema && Object.keys(task.payload_schema).length > 0) {
            try {
                const validate = ajv.compile(task.payload_schema);
                isValid = validate(payload) as boolean;
                errors = validate.errors;
            } catch (err) {
                 return res.status(500).json({ error: 'Invalid schema defined in task' });
            }
        }

        if (!isValid) {
            return res.status(422).json({ 
                error: 'Validation Error',
                details: errors
            });
        }

        try {
            const tx = (dal as any).db.transaction(() => {
                // Update nexus_runs state
                const updateRunStmt = (dal as any).db.prepare(`
                    UPDATE nexus_runs 
                    SET status = 'success', ended_at = CURRENT_TIMESTAMP
                    WHERE run_id = ?
                `);
                updateRunStmt.run(run_id);

                // Update nexus_tasks state
                const updateTaskStmt = (dal as any).db.prepare(`
                    UPDATE nexus_tasks 
                    SET status = 'validating'
                    WHERE id = ?
                `);
                updateTaskStmt.run(taskId);
                
                const insertArtifactStmt = (dal as any).db.prepare(`
                    INSERT INTO nexus_artifacts (id, run_id, artifact_type, payload)
                    VALUES (?, ?, ?, ?)
                `);
                insertArtifactStmt.run(uuidv4(), run_id, artifact_type, JSON.stringify(payload));
                
                // Broadcast state changes
                try {
                    stateEmitter.emit('state_change', {
                        type: 'run_status_updated',
                        data: { run_id: run_id, status: 'success' }
                    });
                    stateEmitter.emit('state_change', {
                        type: 'task_status_updated',
                        data: { task_id: taskId, status: 'validating' }
                    });
                } catch (err) {}
            });
            tx();
            
            return res.status(201).json({ message: 'Proof submitted successfully, task is now validating' });
        } catch (err: any) {
            return res.status(500).json({ error: 'Database transaction failed', details: err.message });
        }
    });

    return router;
}
