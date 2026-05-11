import * as fs from 'fs';
import * as path from 'path';

const repoRoot = path.resolve(__dirname, '../..');

function read(relPath: string): string {
  return fs.readFileSync(path.join(repoRoot, relPath), 'utf8');
}

describe('R34 curl smoke example', () => {
  test('example directory contains a runnable API-only curl smoke script and README', () => {
    const readme = read('examples/curl-smoke-test/README.md');
    const script = read('examples/curl-smoke-test/smoke.sh');
    const installGuide = read('docs/install.md');
    const routes = read('src/api/routes.ts');

    expect(readme).toContain('R34_CURL_SMOKE_EXAMPLE_CONTRACT');
    expect(readme).toContain('Bearer YOUR_RUNTIME_TOKEN');
    expect(readme).toContain('./smoke.sh');
    expect(readme).toContain('Expected output');
    expect(readme).toContain('No fake completion claim');
    expect(readme).toContain('docs/install.md');

    expect(script).toContain('R34_CURL_SMOKE_EXAMPLE_CONTRACT');
    expect(script).toContain('API_AUTH_TOKEN="${API_AUTH_TOKEN:-YOUR_RUNTIME_TOKEN}"');
    expect(script).toContain('API_BASE_URL="${API_BASE_URL:-http://localhost:8000/api/v1}"');
    expect(script).toContain('/runtime/projects');
    expect(script).toContain('/runtime/projects/${PROJECT_ID}/agents');
    expect(script).toContain('/runtime/tasks');
    expect(script).toContain('/runtime/tasks/pending?project_id=${PROJECT_ID}&lane=DEV');
    expect(script).toContain('/runtime/tasks/${TASK_ID}?project_id=${PROJECT_ID}');
    expect(script).toContain('/runtime/tasks/transition');
    expect(script).toContain('RUN_TRANSITIONS');
    expect(script).toContain('submit_completion');
    expect(script).not.toContain('/api/v1/tasks/');
    expect(script).not.toContain('submit_proof');
    expect(script).not.toMatch(/completed without review|fake completion|mark.*completed/i);

    for (const route of [
      "router.post('/runtime/projects'",
      "router.post('/runtime/projects/:projectId/agents'",
      "router.post('/runtime/tasks'",
      "router.get('/runtime/tasks/pending'",
      "router.get('/runtime/tasks/:id'",
      "router.post('/runtime/tasks/transition'",
    ]) {
      expect(routes).toContain(route);
    }
    expect(installGuide).toContain('/api/v1/runtime/tasks/transition');
  });
});
