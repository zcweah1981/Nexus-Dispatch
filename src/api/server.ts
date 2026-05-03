import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import Ajv from 'ajv';
import DAL from '../db/dal';
import EventEmitter from 'events';
import { v4 as uuidv4 } from 'uuid';
import * as fs from 'fs';
import * as path from 'path';

const ajv = new Ajv();

// Event emitter to broadcast state changes
export const stateEmitter = new EventEmitter();

import { createApiRouter } from './routes';

export function createServer(dal: DAL, authToken: string = 'valid-token') {
    const app = express();
    
    // Enable CORS for frontend connection
    app.use(cors());
    app.use(express.json());

    // API Routes
    app.use('/api/v1', createApiRouter(dal, authToken));

    // Auth Middleware
    const authMiddleware = (req: Request, res: Response, next: NextFunction) => {
        const authHeader = req.headers.authorization;
        if (!authHeader || authHeader !== `Bearer ${authToken}`) {
            return res.status(401).json({ error: 'Unauthorized' });
        }
        next();
    };

    // Project Init Endpoint
    app.post('/v1/projects/init', authMiddleware, (req: Request, res: Response) => {
        const { name, description } = req.body;
        if (!name) {
            return res.status(400).json({ error: 'Missing required field: name' });
        }

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
            return res.status(500).json({ error: 'Failed to init project', details: error.message });
        }
    });

    // Agent Register Endpoint
    app.post('/v1/agents/register', authMiddleware, (req: Request, res: Response) => {
        const { id, lane } = req.body;
        if (!id || !lane) {
            return res.status(400).json({ error: 'Missing required fields: id, lane' });
        }

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
            return res.status(500).json({ error: 'Failed to register agent', details: error.message });
        }
    });

    // Move the root-level v1 endpoints into the router or change the path to avoid conflicts
    // SSE Endpoint for frontend
    app.get('/v1/events/stream', (req: Request, res: Response) => {
        // Required headers for SSE
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');
        
        // Also enable CORS specifically for this endpoint if needed
        res.setHeader('Access-Control-Allow-Origin', '*');

        // Send initial connection successful message
        res.write(`data: ${JSON.stringify({ type: 'connected', message: 'SSE connection established' })}\n\n`);

        // Keep-alive heartbeat every 15 seconds to prevent gateway timeout
        const heartbeat = setInterval(() => {
            res.write(`data: ${JSON.stringify({ type: 'ping', timestamp: Date.now() })}\n\n`);
        }, 15000);

        const onStateChange = (event: any) => {
            res.write(`data: ${JSON.stringify(event)}\n\n`);
        };

        // Listen for internal state changes
        stateEmitter.on('state_change', onStateChange);

        // Cleanup on client disconnect
        req.on('close', () => {
            clearInterval(heartbeat);
            stateEmitter.off('state_change', onStateChange);
        });
    });

    // Artifacts Webhook Endpoint
    
    // Task Acknowledge Endpoint
    app.post('/v1/tasks/:id/acknowledge', authMiddleware, (req: Request, res: Response) => {
        const taskId = req.params.id as string;
        const { worker_id, run_id } = req.body;
        
        if (!worker_id || !run_id) {
            return res.status(400).json({ error: 'Missing required fields: worker_id, run_id' });
        }

        const task = dal.getTask(taskId);
        if (!task) {
            return res.status(404).json({ error: 'Task not found' });
        }

        if (task.status !== 'dispatched') {
            return res.status(400).json({ error: 'Task is not in dispatched state' });
        }
        
        try {
            (dal as any).db.transaction(() => {
                // Since this is just an acknowledge, we might want to update the task to 'running'
                // or just log the acknowledge. For now, we'll just return success.
                // The actual run creation might happen here or already happened.
                
                try {
                    stateEmitter.emit('state_change', {
                        type: 'task_acknowledged',
                        data: { task_id: taskId, worker_id, run_id }
                    });
                } catch (err) {}
            })();
            return res.status(200).json({ message: 'Task acknowledged' });
        } catch (error: any) {
            return res.status(500).json({ error: 'Failed to acknowledge task', details: error.message });
        }
    });

    app.post('/v1/webhook/artifacts', authMiddleware, (req: Request, res: Response) => {
        const { run_id, artifact_type, payload } = req.body;

        if (!run_id || !artifact_type || payload === undefined) {
            return res.status(400).json({ error: 'Missing required fields: run_id, artifact_type, payload' });
        }

        const run = dal.getRun(run_id);
        if (!run) {
            return res.status(400).json({ error: 'Invalid Run State' });
        }
        if (run.status !== 'running') {
            return res.status(400).json({ error: 'Run is not in running state' });
        }

        const task = dal.getTask(run.task_id);
        if (!task) {
            return res.status(400).json({ error: 'Task not found' });
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

        const stmt = (dal as any).db.prepare(`
            INSERT INTO nexus_artifacts (id, run_id, artifact_type, payload_data)
            VALUES (?, ?, ?, ?)
        `);
        const uuidv4 = require('uuid').v4;
        
        try {
           (dal as any).db.transaction(() => {
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
               updateTaskStmt.run(run.task_id);
               
               try {
                   stmt.run(uuidv4(), run_id, artifact_type, JSON.stringify(payload));
               } catch (e) {
                   console.error('Failed to insert artifact', e);
               }
               
               // Broadcast state changes for the webhook updates
               try {
                   stateEmitter.emit('state_change', {
                       type: 'run_status_updated',
                       data: { run_id: run_id, status: 'success' }
                   });
                   stateEmitter.emit('state_change', {
                       type: 'task_status_updated',
                       data: { task_id: run.task_id, status: 'validating' }
                   });
               } catch (err) {}
           })();
        } catch (err) {
            return res.status(500).json({ error: 'Database transaction failed' });
        }

        return res.status(201).json({ message: 'Success' });
    });

    return app;
}
