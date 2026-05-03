import request from 'supertest';
import { createServer } from '../../src/api/server';
import DAL from '../../src/db/dal';
import * as fs from 'fs';

describe('Webhook API', () => {
    let dal: DAL;
    let app: any;
    const testDbPath = ':memory:';

    beforeEach(() => {
        dal = new DAL(testDbPath);
        dal.initSchema(`
            CREATE TABLE nexus_projects (id TEXT PRIMARY KEY, name TEXT, status TEXT);
            CREATE TABLE nexus_workers (id TEXT PRIMARY KEY, lane TEXT, status TEXT);
            CREATE TABLE nexus_tasks (
                id TEXT PRIMARY KEY,
                project_id TEXT,
                title TEXT,
                objective TEXT,
                lane TEXT,
                status TEXT,
                max_retries INTEGER,
                retry_count INTEGER DEFAULT 0,
                payload_schema JSON,
                ext_meta JSON,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            );
            CREATE TABLE nexus_runs (
                run_id TEXT PRIMARY KEY,
                task_id TEXT,
                worker_id TEXT,
                idempotency_key TEXT UNIQUE,
                status TEXT,
                error_stack TEXT,
                started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                ended_at DATETIME
            );
            CREATE TABLE nexus_artifacts (
                id TEXT PRIMARY KEY,
                run_id TEXT,
                artifact_type TEXT,
                payload_data JSON,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            );
        `);
        app = createServer(dal, 'test-token');
    });

    afterEach(() => {
        dal.close();
    });

    it('should return 401 if unauthorized', async () => {
        const response = await request(app)
            .post('/v1/webhook/artifacts')
            .send({ run_id: 'test', artifact_type: 'log', payload: {} });
        
        expect(response.status).toBe(401);
    });

    it('should return 422 if payload does not match schema', async () => {
        const taskId = dal.createTask({
            project_id: 'proj-1',
            title: 'Test',
            objective: 'Test obj',
            lane: 'LANE_CODE',
            payload_schema: {
                type: 'object',
                properties: {
                    sha: { type: 'string' }
                },
                required: ['sha']
            },
            ext_meta: {},
            max_retries: 3
        });

        const runId = dal.createRun({
            task_id: taskId,
            worker_id: 'worker-1',
            idempotency_key: 'idempotency-1'
        });

        // Set status to running
        (dal as any).db.prepare("UPDATE nexus_runs SET status = 'running' WHERE run_id = ?").run(runId);

        const response = await request(app)
            .post('/v1/webhook/artifacts')
            .set('Authorization', 'Bearer test-token')
            .send({
                run_id: runId,
                artifact_type: 'repo_commit',
                payload: { wrong_field: 'value' } // Missing sha
            });
        
        expect(response.status).toBe(422);
        expect(response.body.error).toBe('Validation Error');
    });

    it('should return 201 and update state if payload is valid', async () => {
        const taskId = dal.createTask({
            project_id: 'proj-1',
            title: 'Test',
            objective: 'Test obj',
            lane: 'LANE_CODE',
            payload_schema: {
                type: 'object',
                properties: {
                    sha: { type: 'string' }
                },
                required: ['sha']
            },
            ext_meta: {},
            max_retries: 3
        });

        const runId = dal.createRun({
            task_id: taskId,
            worker_id: 'worker-1',
            idempotency_key: 'idempotency-2'
        });

        // Set status to running
        (dal as any).db.prepare("UPDATE nexus_runs SET status = 'running' WHERE run_id = ?").run(runId);

        const response = await request(app)
            .post('/v1/webhook/artifacts')
            .set('Authorization', 'Bearer test-token')
            .send({
                run_id: runId,
                artifact_type: 'repo_commit',
                payload: { sha: 'commit-123' }
            });
        
        expect(response.status).toBe(201);

        const updatedRun = dal.getRun(runId);
        expect(updatedRun?.status).toBe('success');
        expect(updatedRun?.ended_at).not.toBeNull();

        const updatedTask = dal.getTask(taskId);
        expect(updatedTask?.status).toBe('validating');
    });
});
