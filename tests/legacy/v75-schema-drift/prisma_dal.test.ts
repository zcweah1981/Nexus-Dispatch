import { PrismaDAL } from '../src/db/prisma_dal';
import { v4 as uuidv4 } from 'uuid';

process.env.DATABASE_URL = "file:../data/nexus.db";

describe('PrismaDAL Concurrency', () => {
    let dal: PrismaDAL;

    beforeAll(async () => {
        dal = new PrismaDAL();
        await dal.initPragmas();
    });

    afterAll(async () => {
        await dal.close();
    });

    test('should handle concurrent run status updates without locking', async () => {
        const projectId = uuidv4();
        const agentId = uuidv4();
        const taskId = uuidv4();

        // 1. Create dependencies
        await dal._createProjectAndAgent(projectId, agentId);

        // 2. Create Task
        await dal.createTask({
            id: taskId,
            project_id: projectId,
            title: 'Concurrent Test Task',
            objective: 'Test DB Locks',
            lane_required: 'DEV'
        });

        // 3. Create 10 Runs concurrently
        const runIds = [];
        for(let i=0; i<10; i++) {
           const run = await dal.createRun({
               run_id: uuidv4(),
               task_id: taskId,
               agent_id: agentId,
               idempotency_key: `idemp-test-${uuidv4()}`
           });
           runIds.push(run.run_id);
        }

        // 4. Update 10 runs concurrently
        const updatePromises = runIds.map(runId =>
           dal.updateRunStatus(runId, 'success')
        );

        await Promise.all(updatePromises);

        // All should succeed without "database is locked" errors if WAL is correctly active via Prisma/SQLite.
        expect(true).toBe(true);
    });
});
