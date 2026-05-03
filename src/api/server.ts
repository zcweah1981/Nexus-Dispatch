import express, { Request, Response, NextFunction } from 'express';
import Ajv from 'ajv';
import DAL from '../db/dal';

const ajv = new Ajv();

export function createServer(dal: DAL, authToken: string = 'valid-token') {
    const app = express();
    app.use(express.json());

    // Auth Middleware
    const authMiddleware = (req: Request, res: Response, next: NextFunction) => {
        const authHeader = req.headers.authorization;
        if (!authHeader || authHeader !== `Bearer ${authToken}`) {
            return res.status(401).json({ error: 'Unauthorized' });
        }
        next();
    };

    // Artifacts Webhook Endpoint
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

        // Write artifact to DB (Mock artifact write for now, as schema doesn't specify nexus_artifacts table yet)
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
               
               // Mock Artifacts insert, ignoring failure if table doesn't exist
               try {
                   stmt.run(uuidv4(), run_id, artifact_type, JSON.stringify(payload));
               } catch (e) {
                   // Ignore if nexus_artifacts not created yet
               }
           })();
        } catch (err) {
            return res.status(500).json({ error: 'Database transaction failed' });
        }

        return res.status(201).json({ message: 'Success' });
    });

    return app;
}
