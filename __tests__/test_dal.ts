import DAL from '../src/db/dal';
import * as fs from 'fs';
import * as path from 'path';

describe('DAL Concurrency Tests', () => {
    let dal: DAL;
    const testDbPath = path.resolve(__dirname, '../data/test_nexus.db');
    const projectId = 'proj-123';
    const workerId = 'worker-123';

    beforeAll(() => {
        // Ensure clean state
        if (fs.existsSync(testDbPath)) {
            fs.unlinkSync(testDbPath);
        }

        dal = new DAL(testDbPath);

        // Initialize Schema
        const schemaSql = fs.readFileSync(path.resolve(__dirname, '../src/db/migrations/V1__init_schema.sql'), 'utf-8');
        dal.initSchema(schemaSql);

        // Create pre-requisites
        dal._createProjectAndWorker(projectId, workerId);
    });

    afterAll(() => {
        dal.close();
        // Cleanup test DB
        if (fs.existsSync(testDbPath)) {
            fs.unlinkSync(testDbPath);
        }
        if (fs.existsSync(`${testDbPath}-wal`)) {
            fs.unlinkSync(`${testDbPath}-wal`);
        }
        if (fs.existsSync(`${testDbPath}-shm`)) {
            fs.unlinkSync(`${testDbPath}-shm`);
        }
    });

    it('should handle concurrent run status updates without database is locked error', async () => {
        const taskId = dal.createTask({
            project_id: projectId,
            title: 'Test Task',
            objective: 'Test Objective',
            lane: 'LANE_CODE',
            payload_schema: {},
            ext_meta: {},
            max_retries: 3
        });

        const numThreads = 10;
        const runs: string[] = [];

        // Create 10 runs for the task
        for (let i = 0; i < numThreads; i++) {
            runs.push(dal.createRun({
                task_id: taskId,
                worker_id: workerId,
                idempotency_key: `key-${i}`
            }));
        }

        // Simulate concurrent updates
        const promises = runs.map(runId => {
            return new Promise<void>((resolve, reject) => {
                setTimeout(() => {
                    try {
                        dal.updateRunStatus(runId, 'success');
                        resolve();
                    } catch (error) {
                        reject(error);
                    }
                }, Math.random() * 50); // Random delay to increase concurrency chance
            });
        });

        await expect(Promise.all(promises)).resolves.not.toThrow();

        // Verify updates
        for (const runId of runs) {
            const run = dal.getRun(runId);
            expect(run).toBeDefined();
            expect(run?.status).toBe('success');
            expect(run?.ended_at).not.toBeNull();
        }
    });
});