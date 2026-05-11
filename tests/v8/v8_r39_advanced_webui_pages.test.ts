import { describe, expect, it } from '@jest/globals';
import { readFileSync } from 'fs';
import { join } from 'path';

const appSource = readFileSync(join(__dirname, '../../src/webui/src/App.tsx'), 'utf8');
const i18nSource = readFileSync(join(__dirname, '../../src/webui/src/i18n.ts'), 'utf8');
const apiClientSource = readFileSync(join(__dirname, '../../src/webui/src/apiClient.ts'), 'utf8');
const hookSource = readFileSync(join(__dirname, '../../src/webui/src/hooks/useSSE.ts'), 'utf8');

describe('R39-T5 advanced WebUI pages contract', () => {
  it('implements advanced page surfaces over API-only runtime state', () => {
    expect(appSource).toContain('R39_ADVANCED_WEBUI_PAGES_CONTRACT');
    for (const marker of [
      'realtimeFeed',
      'releaseCenter',
      'proofGovernance',
      'observability',
      'agentPerformance',
      'roleActionVisibility',
      'renderRealtimeFeed',
      'renderReleaseCenter',
      'renderProofGovernance',
      'renderAgentPerformance',
      'renderRoleActionVisibility',
      'connection_state',
      'Proof 已存系统',
      'safeVisibleText',
    ]) {
      expect(appSource).toContain(marker);
    }
  });

  it('keeps three visible languages for every advanced page label', () => {
    for (const locale of ['en', 'zh-CN', 'zh-TW']) {
      const localeStart = i18nSource.indexOf(`${locale === 'en' ? 'en' : `'${locale}'`}: {`);
      expect(localeStart).toBeGreaterThanOrEqual(0);
    }
    for (const key of [
      'page.realtimeFeed',
      'page.releaseCenter',
      'page.proofGovernance',
      'page.agentPerformance',
      'page.roleActionVisibility',
      'release.readyGroups',
      'proof.safeBoundary',
      'role.visibilityNotice',
    ]) {
      const occurrences = (i18nSource.match(new RegExp(key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length;
      expect(occurrences).toBe(3);
    }
  });

  it('uses realtime stream and polling fallback through runtime API client only', () => {
    expect(hookSource).toContain('R39_REALTIME_PROJECT_SCOPED_STREAM_CONTRACT');
    expect(hookSource).toContain('/api/v1/events/stream');
    expect(apiClientSource).toContain('pollRealtimeEvents');
    expect(appSource).toContain('runtimeApi.pollRealtimeEvents');
    expect(appSource).toContain('useSSE(PROJECT_ID)');
  });

  it('does not expose secrets, raw proof JSON, local filesystem, Prisma, or SQLite in WebUI sources', () => {
    const combined = `${appSource}\n${i18nSource}\n${apiClientSource}\n${hookSource}`;
    expect(combined).not.toMatch(/better-sqlite3|sqlite3|@prisma\/client|PrismaClient|DATABASE_URL|process\.env|\bfs\b|readFile|writeFile|\/root\//);
    expect(combined).not.toMatch(/bot_token\s*[:=]|chat_id\s*[:=]|Bearer\s+[A-Za-z0-9._-]+|sk-[A-Za-z0-9]/);
    expect(appSource).not.toContain('JSON.stringify(report');
    expect(appSource).not.toContain('JSON.stringify(artifact');
  });
});
