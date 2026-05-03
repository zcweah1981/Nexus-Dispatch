import DAL from '../src/db/dal';
import * as path from 'path';
import * as fs from 'fs';

describe('T1.2: SQLite DAL Layer', () => {
    let dal: DAL;
    const dbPath = path.resolve(__dirname, '../data/test_dal.db');

    beforeEach(() => {
        if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
        dal = new DAL(dbPath);
        dal.initSchema(`
            CREATE TABLE IF NOT EXISTS nexus_tasks (
                id TEXT PRIMARY KEY,
                project_id TEXT NOT NULL,
                title TEXT NOT NULL,
                objective TEXT,
                lane TEXT NOT NULL,
                status TEXT DEFAULT 'created',
                max_retries INTEGER DEFAULT 3,
                retry_count INTEGER DEFAULT 0,
                payload_schema TEXT,
                ext_meta TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            );
            CREATE TABLE IF NOT EXISTS nexus_runs (
                run_id TEXT PRIMARY KEY,
                task_id TEXT NOT NULL,
                worker_id TEXT NOT NULL,
                idempotency_key TEXT,
                status TEXT DEFAULT 'running',
                error_stack TEXT,
                started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                ended_at DATETIME,
                FOREIGN KEY(task_id) REFERENCES nexus_tasks(id)
            );
            CREATE TABLE IF NOT EXISTS nexus_projects (id TEXT PRIMARY KEY, name TEXT, status TEXT);
            CREATE TABLE IF NOT EXISTS nexus_workers (id TEXT PRIMARY KEY, lane TEXT, status TEXT);
        `);
    });

    afterEach(() => {
        dal.close();
        if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
    });

    it('should create task and run successfully', () => {
        dal._createProjectAndWorker('proj1', 'work1');
        const taskId = dal.createTask({
            project_id: 'proj1',
            title: 'Test Task',
            objective: 'Test Obj',
            lane: 'LANE_CODE',
            max_retries: 3,
            payload_schema: {},
            ext_meta: {}
        });
        expect(taskId).toBeDefined();

        const runId = dal.createRun({
            task_id: taskId,
            worker_id: 'work1',
            idempotency_key: 'test_key'
        });
        expect(runId).toBeDefined();

        dal.updateRunStatus(runId, 'success');
        const run = dal.getRun(runId);
        expect(run?.status).toBe('success');
    });
});
