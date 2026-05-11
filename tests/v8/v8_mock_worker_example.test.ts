import * as fs from 'fs';
import * as path from 'path';

const repoRoot = path.resolve(__dirname, '../..');

function read(relPath: string): string {
  return fs.readFileSync(path.join(repoRoot, relPath), 'utf8');
}

function exists(relPath: string): boolean {
  return fs.existsSync(path.join(repoRoot, relPath));
}

describe('R34 mock worker integration example', () => {
  test('example documents and implements a minimal private-free worker contract smoke', () => {
    const readmePath = 'examples/mock-worker/README.md';
    const workerPath = 'examples/mock-worker/mock-worker.js';
    const smokePath = 'examples/mock-worker/smoke.sh';

    expect(exists(readmePath)).toBe(true);
    expect(exists(workerPath)).toBe(true);
    expect(exists(smokePath)).toBe(true);

    const readme = read(readmePath);
    const worker = read(workerPath);
    const smoke = read(smokePath);
    const daemon = read('src/daemon/v8_tick_loop.ts');
    const routes = read('src/api/routes.ts');
    const schemas = read('src/api/schemas.ts');

    expect(readme).toContain('R34_MOCK_WORKER_EXAMPLE_CONTRACT');
    expect(readme).toContain('No Telegram dependency');
    expect(readme).toContain('Expected output');
    expect(readme).toContain('Environment variables');
    expect(readme).toContain('Honest limitation');
    expect(readme).toContain('smoke-only path');
    expect(readme).toContain('RUN_API_PROOF=1');
    expect(readme).toContain('Authorization: Bearer YOUR_RUNTIME_TOKEN');
    expect(readme).toContain('POST /v1/runs');
    expect(readme).toContain('POST /api/v1/runtime/runs');
    expect(readme).toContain('POST /api/v1/runtime/artifacts');
    expect(readme).toContain('POST /api/v1/runtime/tasks/transition');
    expect(readme).toContain('worker_run_id');

    expect(worker).toContain('R34_MOCK_WORKER_EXAMPLE_CONTRACT');
    expect(worker).toContain("http.createServer");
    expect(worker).toContain("POST");
    expect(worker).toContain("/v1/runs");
    expect(worker).toContain('worker_run_id');
    expect(worker).toContain('metadata');
    expect(worker).toContain('task_id');
    expect(worker).toContain('lease_token');
    expect(worker).not.toContain('Telegram');
    expect(worker).not.toContain('bot token');
    expect(worker).not.toContain('chat id');
    expect(worker).not.toContain('sqlite');
    expect(worker).not.toContain('better-sqlite3');

    expect(smoke).toContain('R34_MOCK_WORKER_EXAMPLE_CONTRACT');
    expect(smoke).toContain('node "${SCRIPT_DIR}/mock-worker.js"');
    expect(smoke).toContain('/runtime/projects/${PROJECT_ID}/agents');
    expect(smoke).toContain('/runtime/runs');
    expect(smoke).toContain('/runtime/artifacts');
    expect(smoke).toContain('/runtime/tasks/transition');
    expect(smoke).toContain('RUN_API_PROOF');
    expect(smoke).toContain('YOUR_RUNTIME_TOKEN');
    expect(smoke).not.toContain('/api/v1/tasks/');
    expect(smoke).not.toContain('submit_proof');

    expect(daemon).toContain('new OpenAICompatibleWorkerClient');
    expect(daemon).toContain("model: payload.agent.dialect");
    expect(daemon).toContain("messages");
    expect(daemon).toContain("metadata");
    expect(daemon).toContain("worker_run_id");
    expect(routes).toContain("router.post('/runtime/runs'");
    expect(routes).toContain("router.post('/runtime/artifacts'");
    expect(routes).toContain("router.post('/runtime/tasks/transition'");
    expect(schemas).toContain('runtimeArtifactCreateSchema');
  });
});
