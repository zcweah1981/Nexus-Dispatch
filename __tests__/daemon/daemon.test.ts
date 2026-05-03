import Daemon from '../../src/daemon/main';
import DAL from '../../src/db/dal';
import Database from 'better-sqlite3';
import axios from 'axios';
import * as path from 'path';
import * as fs from 'fs';

// Mock axios post
jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('Daemon Preemptive Scheduling Loop', () => {
    let daemon: Daemon;
    let dal: DAL;
    const testDbPath = path.resolve(__dirname, '../../data/test_daemon.db');

    beforeAll(() => {
        // Ensure test data dir exists
        if (!fs.existsSync(path.dirname(testDbPath))) {
            fs.mkdirSync(path.dirname(testDbPath), { recursive: true });
        }
    });

    beforeEach(() => {
        // Fresh DB for each test
        if (fs.existsSync(testDbPath)) fs.unlinkSync(testDbPath);
        
        dal = new DAL(testDbPath);
        
        // Init schema minimally
        dal.initSchema(`
            CREATE TABLE IF NOT EXISTS nexus_tasks (
                id TEXT PRIMARY KEY,
                project_id TEXT,
                title TEXT,
                objective TEXT,
                lane TEXT,
                status TEXT DEFAULT 'created',
                max_retries INTEGER DEFAULT 3,
                retry_count INTEGER DEFAULT 0,
                payload_schema TEXT,
                ext_meta TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            );
        `);
        
        // Inject dal into daemon
        daemon = new Daemon();
        (daemon as any).dal = dal;
    });

    afterEach(() => {
        dal.close();
        if (fs.existsSync(testDbPath)) fs.unlinkSync(testDbPath);
    });

    it('should fetch tasks, set status to dispatched, and send to worker', async () => {
        // Insert 3 tasks
        dal.createTask({ max_retries: 3,
            id: 'task-1', project_id: 'p1', title: 'T1', objective: 'O1', lane: 'L1', 
            payload_schema: {}, ext_meta: {}
        });
        dal.createTask({ max_retries: 3,
            id: 'task-2', project_id: 'p1', title: 'T2', objective: 'O2', lane: 'L1',
            payload_schema: {}, ext_meta: {}
        });
        dal.createTask({ max_retries: 3,
            id: 'task-3', project_id: 'p1', title: 'T3', objective: 'O3', lane: 'L1',
            payload_schema: {}, ext_meta: {}
        });

        // Mock success response
        mockedAxios.post.mockResolvedValueOnce({ status: 200 });
        
        // Run tick 3 times
        await daemon.tick();
        await daemon.tick();
        await daemon.tick();

        const db = (dal as any).db;
        const tasks = db.prepare('SELECT id, status FROM nexus_tasks').all();
        
        expect(tasks.length).toBe(3);
        tasks.forEach((task: any) => {
            expect(task.status).toBe('dispatched');
        });
        
        // Check if axios was called
        expect(mockedAxios.post).toHaveBeenCalledTimes(3);
    });
    
    it('should rollback to created and increment retry count on dispatch failure', async () => {
        // Insert 1 task
        dal.createTask({ max_retries: 3,
            id: 'task-4', project_id: 'p1', title: 'T4', objective: 'O4', lane: 'L1', 
            payload_schema: {}, ext_meta: {}
        });
        
        // Mock failure
        mockedAxios.post.mockRejectedValueOnce(new Error('ConnectionRefused'));
        
        await daemon.tick();
        
        const db = (dal as any).db;
        const task = db.prepare('SELECT status, retry_count FROM nexus_tasks WHERE id = ?').get('task-4') as any;
        
        expect(task.status).toBe('created');
        expect(task.retry_count).toBe(1);
    });
});
