import { createServer } from '../src/api/server';
import DAL from '../src/db/dal';
import request from 'supertest';
import fs from 'fs';
import path from 'path';

describe('Task Submit Proof API', () => {
    let app: any;
    let dal: DAL;
    const testDbPath = path.resolve(__dirname, 'test_nexus_submit_proof.db');
    const authToken = 'test-token';

    beforeAll(() => {
        if (fs.existsSync(testDbPath)) fs.unlinkSync(testDbPath);
        dal = new DAL(testDbPath);

        dal.initSchema(`
            CREATE TABLE IF NOT EXISTS nexus_projects (id TEXT PRIMARY KEY, name TEXT, description TEXT, status TEXT);
            CREATE TABLE IF NOT EXISTS nexus_tasks (id TEXT PRIMARY KEY, project_id TEXT, title TEXT, objective TEXT, lane TEXT, status TEXT, max_retries INTEGER, retry_count INTEGER DEFAULT 0, payload_schema TEXT, ext_meta TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP);
            CREATE TABLE IF NOT EXISTS nexus_workers (id TEXT PRIMARY KEY, lane TEXT, status TEXT, last_heartbeat DATETIME);
            CREATE TABLE IF NOT EXISTS nexus_runs (run_id TEXT PRIMARY KEY, task_id TEXT, worker_id TEXT, idempotency_key TEXT, status TEXT DEFAULT 'running', error_stack TEXT, started_at DATETIME DEFAULT CURRENT_TIMESTAMP, ended_at DATETIME);
            CREATE TABLE IF NOT EXISTS nexus_artifacts (id TEXT PRIMARY KEY, run_id TEXT, artifact_type TEXT, payload_data TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP);
        `);

        dal._createProjectAndWorker('proj-1', 'worker-1');

        app = createServer(dal, authToken);
    });

    afterAll(() => {
        dal.close();
        if (fs.existsSync(testDbPath)) fs.unlinkSync(testDbPath);
    });

    it('should successfully submit proof and transition task to validating', async () => {
        // Setup initial task and run
        const taskId = dal.createTask({
            project_id: 'proj-1',
            title: 'Test Task',
            objective: 'Test Objective',
            lane: 'LANE_CODE',
            payload_schema: {
                type: 'object',
                properties: {
                    git_commit_sha: { type: 'string' }
                },
                required: ['git_commit_sha']
            },
            ext_meta: {},
            max_retries: 3
        });

        dal.updateTaskStatus(taskId, 'dispatched');

        const runId = dal.createRun({
            task_id: taskId,
            worker_id: 'worker-1',
            idempotency_key: 'test-key-1'
        });

        const res = await request(app)
            .post(`/api/v1/tasks/${taskId}/submit_proof`)
            .set('Authorization', `Bearer ${authToken}`)
            .send({
                run_id: runId,
                artifact_type: 'git_commit',
                payload: {
                    git_commit_sha: 'abcdef123456'
                }
            });

        expect(res.status).toBe(201);
        expect(res.body.message).toContain('validating');

        const updatedTask = dal.getTask(taskId);
        expect(updatedTask?.status).toBe('validating');

        const updatedRun = dal.getRun(runId);
        expect(updatedRun?.status).toBe('success');
    });

    it('should fail schema validation with 422', async () => {
        const taskId = dal.createTask({
            project_id: 'proj-1',
            title: 'Test Task 2',
            objective: 'Test Objective',
            lane: 'LANE_CODE',
            payload_schema: {
                type: 'object',
                properties: {
                    git_commit_sha: { type: 'string' }
                },
                required: ['git_commit_sha']
            },
            ext_meta: {},
            max_retries: 3
        });

        dal.updateTaskStatus(taskId, 'dispatched');

        const runId = dal.createRun({
            task_id: taskId,
            worker_id: 'worker-1',
            idempotency_key: 'test-key-2'
        });

        const res = await request(app)
            .post(`/api/v1/tasks/${taskId}/submit_proof`)
            .set('Authorization', `Bearer ${authToken}`)
            .send({
                run_id: runId,
                artifact_type: 'git_commit',
                payload: {
                    invalid_field: 'abcdef123456'
                }
            });

        // T2.6: Standardized error format
        expect(res.status).toBe(422);
        expect(res.body.code).toBe('VALIDATION_ERROR');
        expect(res.body.details).toBeDefined();

        const task = dal.getTask(taskId);
        expect(task?.status).toBe('dispatched'); // Should not change
    });

    it('should return 401 Unauthorized without correct token', async () => {
         const res = await request(app)
            .post('/api/v1/tasks/some-id/submit_proof')
            .send({
                run_id: 'some-run',
                artifact_type: 'git_commit',
                payload: {}
            });
        expect(res.status).toBe(401);
    });
});
