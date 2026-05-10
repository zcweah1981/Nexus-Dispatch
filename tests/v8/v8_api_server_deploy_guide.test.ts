import * as fs from 'fs';
import * as path from 'path';

const repoRoot = path.resolve(__dirname, '../..');

function read(relPath: string): string {
  return fs.readFileSync(path.join(repoRoot, relPath), 'utf8');
}

describe('V8-R13 API server deployment guide and validation examples', () => {
  test('install guide provides a clone-to-first-task API deployment path with operations details', () => {
    const guide = read('docs/install.md');

    expect(guide).toContain('R13_API_SERVER_DEPLOY_GUIDE_CONTRACT');
    expect(guide).toMatch(/Clone to first completed task/i);
    expect(guide).toMatch(/Local Development/i);
    expect(guide).toMatch(/systemd/i);
    expect(guide).toMatch(/PORT=8000/);
    expect(guide).toMatch(/\/api\/v1\/runtime\/tasks\/pending/);
    expect(guide).toMatch(/journalctl -u nexus-dispatch-api/);
    expect(guide).toMatch(/journalctl -u nexus-dispatch-daemon/);
    expect(guide).toMatch(/prisma migrate deploy/);
    expect(guide).toMatch(/npm run daemon/);
    expect(guide).toMatch(/AGENT_NOTIFICATIONS/);
    expect(guide).toMatch(/project_cronjobs/);
    expect(guide).toMatch(/First task/);
    expect(guide).toMatch(/POST \/api\/v1\/runtime\/tasks\/transition/);
  });

  test('safe env template contains placeholders only and documents API/daemon/Telegram configuration', () => {
    const envExample = read('.env.example');

    expect(envExample).toMatch(/API_AUTH_TOKEN=replace-with-/);
    expect(envExample).toMatch(/PM_API_TOKEN=replace-with-/);
    expect(envExample).toMatch(/DATABASE_URL=file:\/data\/nexus\.db/);
    expect(envExample).toMatch(/PM_API_URL=http:\/\/nexus-api:8000\/api\/v1/);
    expect(envExample).toMatch(/AGENT_NOTIFICATIONS=\{\}/);
    expect(envExample).toMatch(/bot_token/);
    expect(envExample).toMatch(/chat_id/);
    expect(envExample).not.toMatch(/sk-[A-Za-z0-9]{12,}|ghp_[A-Za-z0-9]{12,}|xoxb-[A-Za-z0-9-]{12,}|\d{8,10}:[A-Za-z0-9_-]{20,}|-100\d{8,}/);
  });

  test('package exposes a low-risk V8 API deploy validation script without direct DB business path', () => {
    const pkg = JSON.parse(read('package.json')) as { scripts: Record<string, string> };
    const scriptSource = read('scripts/validate-api-deploy.js');

    expect(pkg.scripts['validate:api-deploy']).toBe('node scripts/validate-api-deploy.js');
    expect(scriptSource).toContain('R13_API_DEPLOY_VALIDATION_CONTRACT');
    expect(scriptSource).toMatch(/prisma validate/);
    expect(scriptSource).toMatch(/tests\/v8/);
    expect(scriptSource).toMatch(/\/api\/v1\/runtime\/tasks\/pending/);
    expect(scriptSource).not.toMatch(/better-sqlite3|sqlite3|data\/nexus\.db|prisma\/data\/nexus\.db|\$queryRaw|\$executeRaw/);
  });
});
