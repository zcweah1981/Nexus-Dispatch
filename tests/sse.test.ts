import request from 'supertest';
import { createServer, stateEmitter } from '../src/api/server';
import DAL from '../src/db/dal';

describe('SSE Stream API', () => {
    let app: any;
    let dal: DAL;

    beforeAll(() => {
        dal = new DAL(':memory:');
        dal.initSchema(`
            CREATE TABLE IF NOT EXISTS nexus_projects (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                status TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS nexus_workers (
                id TEXT PRIMARY KEY,
                lane TEXT NOT NULL,
                status TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS nexus_tasks (
                id TEXT PRIMARY KEY,
                project_id TEXT NOT NULL,
                title TEXT NOT NULL,
                objective TEXT NOT NULL,
                lane TEXT NOT NULL,
                status TEXT NOT NULL DEFAULT 'created',
                max_retries INTEGER NOT NULL DEFAULT 3,
                retry_count INTEGER NOT NULL DEFAULT 0,
                payload_schema TEXT,
                ext_meta TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (project_id) REFERENCES nexus_projects(id)
            );
            CREATE TABLE IF NOT EXISTS nexus_runs (
                run_id TEXT PRIMARY KEY,
                task_id TEXT NOT NULL,
                worker_id TEXT NOT NULL,
                idempotency_key TEXT NOT NULL,
                status TEXT NOT NULL DEFAULT 'running',
                error_stack TEXT,
                started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                ended_at DATETIME,
                FOREIGN KEY (task_id) REFERENCES nexus_tasks(id),
                FOREIGN KEY (worker_id) REFERENCES nexus_workers(id)
            );
        `);
        app = createServer(dal);
    });

    afterAll(() => {
        dal.close();
    });

    it('should push SSE events on DB state changes', (done) => {
        const expectedEvents = ['connected', 'task_created', 'run_created', 'run_status_updated'];
        const receivedEvents: string[] = [];
        let reqEnded = false;

        const req = request(app)
            .get('/v1/events/stream')
            .set('Accept', 'text/event-stream')
            .expect('Content-Type', /text\/event-stream/)
            .buffer(false)
            .parse((res: any, callback: any) => {
                res.on('data', (chunk: Buffer) => {
                    if (reqEnded) return;
                    const str = chunk.toString();
                    if (!str.startsWith('data: ')) return;
                    
                    const lines = str.split('\n');
                    for (const line of lines) {
                        if (line.startsWith('data: ')) {
                            const data = JSON.parse(line.replace('data: ', ''));
                            if (data.type !== 'ping') {
                                receivedEvents.push(data.type);
                            }
                            
                            if (receivedEvents.length === expectedEvents.length) {
                                reqEnded = true;
                                expect(receivedEvents).toEqual(expectedEvents);
                                done();
                            }
                        }
                    }
                });
                
                // Simulate DB state changes
                setTimeout(() => {
                    dal._createProjectAndWorker('proj-1', 'worker-1');
                    
                    // Task created
                    const taskId = dal.createTask({
                        project_id: 'proj-1',
                        title: 'Test SSE Task',
                        objective: 'To test SSE',
                        lane: 'LANE_CODE',
                        max_retries: 3,
                        payload_schema: {},
                        ext_meta: {}
                    });
                    
                    // Run created
                    const runId = dal.createRun({
                        task_id: taskId,
                        worker_id: 'worker-1',
                        idempotency_key: 'sse-test-key'
                    });
                    
                    // Run status updated
                    dal.updateRunStatus(runId, 'success');
                }, 100);
            })
            .end((err) => {
                if (err && !reqEnded) done(err);
            });
    });
});
