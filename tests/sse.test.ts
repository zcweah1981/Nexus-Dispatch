import http from 'http';
import { AddressInfo } from 'net';
import { createServer } from '../src/api/server';
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

    it('should push SSE events on DB state changes and close the client cleanly', async () => {
        const expectedEvents = ['connected', 'task_created', 'run_created', 'run_status_updated'];
        const receivedEvents: string[] = [];
        const server = http.createServer(app);
        await new Promise<void>((resolve) => server.listen(0, resolve));
        const port = (server.address() as AddressInfo).port;

        let responseRef: http.IncomingMessage | undefined;
        let requestRef: http.ClientRequest | undefined;
        let timer: NodeJS.Timeout | undefined;

        try {
            await new Promise<void>((resolve, reject) => {
                const cleanup = () => {
                    if (timer) clearTimeout(timer);
                    responseRef?.destroy();
                    requestRef?.destroy();
                };

                timer = setTimeout(() => {
                    cleanup();
                    reject(new Error(`Timed out waiting for SSE events: ${receivedEvents.join(',')}`));
                }, 3000);

                requestRef = http.get(
                    `http://127.0.0.1:${port}/v1/events/stream`,
                    { headers: { Accept: 'text/event-stream' } },
                    (res) => {
                        responseRef = res;
                        expect(res.headers['content-type']).toMatch(/text\/event-stream/);

                        res.on('data', (chunk: Buffer) => {
                            const lines = chunk.toString().split('\n');
                            for (const line of lines) {
                                if (!line.startsWith('data: ')) continue;
                                const data = JSON.parse(line.replace('data: ', ''));
                                if (data.type !== 'ping') {
                                    receivedEvents.push(data.type);
                                }
                                if (receivedEvents.length === expectedEvents.length) {
                                    expect(receivedEvents).toEqual(expectedEvents);
                                    cleanup();
                                    resolve();
                                }
                            }
                        });
                    },
                );
                requestRef.on('error', (err) => {
                    if (receivedEvents.length === expectedEvents.length) return;
                    reject(err);
                });

                setTimeout(() => {
                    dal._createProjectAndWorker('proj-1', 'worker-1');
                    const taskId = dal.createTask({
                        project_id: 'proj-1',
                        title: 'Test SSE Task',
                        objective: 'To test SSE',
                        lane: 'LANE_CODE',
                        max_retries: 3,
                        payload_schema: {},
                        ext_meta: {},
                    });
                    const runId = dal.createRun({
                        task_id: taskId,
                        worker_id: 'worker-1',
                        idempotency_key: 'sse-test-key',
                    });
                    dal.updateRunStatus(runId, 'success');
                }, 100);
            });
        } finally {
            await new Promise<void>((resolve) => server.close(() => resolve()));
        }
    });
});
