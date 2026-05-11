import fs from 'fs';
import path from 'path';

const repoRoot = path.resolve(__dirname, '../..');
const webuiRoot = path.join(repoRoot, 'src/webui/src');

function read(relativePath: string): string {
  return fs.readFileSync(path.join(webuiRoot, relativePath), 'utf8');
}

function allWebuiSource(): string {
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      if (entry.isFile() && /\.(ts|tsx)$/.test(entry.name)) files.push(full);
    }
  };
  walk(webuiRoot);
  return files.map((file) => `\n// ${path.relative(webuiRoot, file)}\n${fs.readFileSync(file, 'utf8')}`).join('\n');
}

describe('R38 WebUI controlled actions UI', () => {
  test('exposes controlled actions through the Runtime API client only', () => {
    const apiClient = read('apiClient.ts');
    expect(apiClient).toContain('R38_CONTROLLED_ACTIONS_API_CLIENT_CONTRACT');
    expect(apiClient).toContain('controlledTaskAction');
    expect(apiClient).toContain('/projects/${projectId}/tasks/${taskId}/${action}');
    expect(apiClient).toContain('updateLowRiskSettings');
    expect(apiClient).toContain('/projects/${projectId}/settings');
    expect(apiClient).toContain('listAuditEvents');
    expect(apiClient).toContain('/projects/${projectId}/audit-events');
    expect(apiClient).toContain('previewControlledAction');
    expect(apiClient).toContain('confirmControlledAction');
  });

  test('renders task, group, review, settings, and agent controlled-action surfaces with preview/validation/confirm/result/audit references', () => {
    const app = read('App.tsx');
    expect(app).toContain('R38_WEBUI_CONTROLLED_ACTIONS_UI_CONTRACT');
    for (const marker of [
      'controlledActions',
      'taskActions',
      'groupActions',
      'reviewDecisions',
      'lowRiskSettingsEditing',
      'agentMetadataEditing',
      'previewValidationConfirmResultAudit',
      'auditReference',
      'confirm_token',
      'audit_event',
      'runtimeApi.controlledTaskAction',
      'runtimeApi.updateLowRiskSettings',
      'runtimeApi.listAuditEvents',
    ]) {
      expect(app).toContain(marker);
    }
  });

  test('ships trilingual UX copy for every controlled-action step and domain', () => {
    const i18n = read('i18n.ts');
    for (const key of [
      'page.controlledActions',
      'controlled.taskActions',
      'controlled.groupActions',
      'controlled.reviewDecisions',
      'controlled.lowRiskSettingsEditing',
      'controlled.agentMetadataEditing',
      'controlled.preview',
      'controlled.validation',
      'controlled.confirm',
      'controlled.result',
      'controlled.auditReference',
    ]) {
      expect(i18n).toContain(`'${key}'`);
    }
    expect(i18n).toContain("en: {");
    expect(i18n).toContain("'zh-CN': {");
    expect(i18n).toContain("'zh-TW': {");
  });

  test('keeps WebUI API-only: no local DB, Prisma, filesystem, env, secret, or broad legacy mutation bypass', () => {
    const source = allWebuiSource();
    expect(source).not.toMatch(/better-sqlite3|sqlite3|@prisma\/client|PrismaClient|DATABASE_URL|process\.env|\.env|\bfs\b|readFile|writeFile|\/root\/|governance|docs\/proofs|bot_token|chat_id|Bearer\s+\S+/);
    expect(source).not.toContain("fetch('/api/v1/tasks");
    expect(source).not.toContain('fetch("/api/v1/tasks');
    expect(source).not.toContain('/api/v1/tasks/');
    expect(source).not.toContain('PATCH:/api/v1/runtime/tasks/:id/status');
    expect(source).toContain('API-only');
  });
});
