import { DAL } from '../src/db/dal';
import fs from 'fs';
import path from 'path';

describe('DAL Concurrency Test', () => {
    let dal: DAL;
    let projectId: string;
    let taskId: string;

    beforeAll(async () => {
        const testDbPath = path.join(__dirname, '../data/test_nexus.db');
        if (fs.existsSync(testDbPath)) {
            fs.unlinkSync(testDbPath);
        }
        process.env.DATABASE_URL = testDbPath;
        dal = new DAL();
        
        await new Promise(resolve => setTimeout(resolve, 500));
        
        await dal.initSchema();
        projectId = await dal.createProject('Test Project');
        taskId = await dal.createTask(projectId, 'Test Task', 'Test Obj', 'LANE_CODE');
    });

    afterAll(async () => {
        await dal.close();
        if (fs.existsSync(process.env.DATABASE_URL as string)) {
            fs.unlinkSync(process.env.DATABASE_URL as string);
        }
    });

    it('should handle 10 concurrent run creations and updates without database is locked error', async () => {
        const concurrencyCount = 10;
        
        const operations = Array.from({ length: concurrencyCount }).map(async (_, i) => {
            const runId = await dal.createRun(taskId, `worker_${i}`, i);
            await new Promise(resolve => setTimeout(resolve, Math.random() * 50));
            await dal.updateRunStatus(runId, 'success');
            return runId;
        });

        const runIds = await Promise.all(operations);
        expect(runIds.length).toBe(concurrencyCount);
        
        const uniqueIds = new Set(runIds);
        expect(uniqueIds.size).toBe(concurrencyCount);
    });
});
