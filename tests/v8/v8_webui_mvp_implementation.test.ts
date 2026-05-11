import fs from 'fs';
import path from 'path';

const repoRoot = path.resolve(__dirname, '../..');
const webuiRoot = path.join(repoRoot, 'src/webui/src');

function read(relativePath: string): string {
  return fs.readFileSync(path.join(webuiRoot, relativePath), 'utf8');
}

function readAllWebuiSource(): string {
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === 'dist' || entry.name === 'node_modules') continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      if (entry.isFile() && /\.(ts|tsx)$/.test(entry.name)) files.push(full);
    }
  };
  walk(webuiRoot);
  return files.map((file) => `\n// ${path.relative(webuiRoot, file)}\n${fs.readFileSync(file, 'utf8')}`).join('\n');
}

describe('R37 WebUI MVP implementation contract', () => {
  test('App exposes lean MVP pages backed by Runtime API client only', () => {
    const app = read('App.tsx');
    const apiClient = read('apiClient.ts');

    expect(app).toContain('R37_WEBUI_MVP_CONTRACT');
    for (const page of [
      'dashboard',
      'lifecycle',
      'kanban',
      'dispatchLive',
      'projectSettings',
      'agentRegistry',
      'directoryStructure',
      'observability',
    ]) {
      expect(app).toContain(`page.${page}`);
    }

    for (const method of [
      'getSummary',
      'listTasks',
      'listGroups',
      'getDispatchLive',
      'getSettings',
      'listAgents',
      'getDirectories',
      'getObservability',
    ]) {
      expect(apiClient).toContain(method);
    }

    expect(app).toContain('kanbanColumns');
    expect(app).toContain('readonlyNotice');
    expect(app).toContain('lifecycleTimeline');
    expect(app).not.toMatch(/task editing|editTask|mutateAgent|PRD editor|createTask|updateTask|deleteTask/i);
    expect(app).not.toMatch(/fetch\(['"`]\/api\/v1\/tasks|fetch\(['"`]\/api\/v1\/agents/);
  });

  test('WebUI uses English, Simplified Chinese, and Traditional Chinese i18n keys', () => {
    const i18n = read('i18n.ts');
    for (const locale of ['en', 'zh-CN', 'zh-TW']) {
      expect(i18n).toContain(locale);
    }
    for (const key of [
      'app.title',
      'page.dashboard',
      'page.lifecycle',
      'page.kanban',
      'page.dispatchLive',
      'page.projectSettings',
      'page.agentRegistry',
      'page.directoryStructure',
      'page.observability',
      'readonlyNotice',
      'emptyState',
      'lifecycleTimeline',
    ]) {
      expect(i18n).toContain(key);
    }
  });

  test('WebUI source has no DB, local filesystem, env, or secret imports/constants', () => {
    const source = readAllWebuiSource();
    expect(source).not.toMatch(/better-sqlite3|sqlite3|@prisma\/client|PrismaClient|DATABASE_URL|process\.env|\.env|from ['"]fs['"]|readFile|writeFile|AUTH_TOKEN|Bearer\s+\$\{|bot_token|chat_id|sk-[A-Za-z0-9_-]+|ghp_[A-Za-z0-9_]+|xoxb-/);
  });
});
