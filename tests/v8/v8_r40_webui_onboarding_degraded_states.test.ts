import { describe, expect, it } from '@jest/globals';
import { readFileSync } from 'fs';
import { join } from 'path';

const appSource = readFileSync(join(__dirname, '../../src/webui/src/App.tsx'), 'utf8');
const i18nSource = readFileSync(join(__dirname, '../../src/webui/src/i18n.ts'), 'utf8');
const apiClientSource = readFileSync(join(__dirname, '../../src/webui/src/apiClient.ts'), 'utf8');

describe('R40-T3 WebUI onboarding, empty, loading, error, degraded states contract', () => {
  it('adds first-run onboarding and next-action UI over Runtime API state', () => {
    expect(appSource).toContain('R40_ONBOARDING_DEGRADED_STATE_UI_CONTRACT');
    for (const marker of [
      'renderOnboarding',
      'renderNextActionPanel',
      'getRuntimeConnectionStatus',
      'getNextAction',
      'state.hasLoadedOnce',
      'state.degradedReasons',
      'onboarding.firstRun',
      'onboarding.nextAction',
      'connection.status',
    ]) {
      expect(appSource).toContain(marker);
    }
  });

  it('renders explicit loading, empty, error, and degraded surfaces without raw runtime identifiers', () => {
    for (const marker of [
      'renderLoadingState',
      'renderErrorState',
      'renderDegradedBanner',
      'EmptyState',
      'empty.title',
      'empty.description',
      'error.retry',
      'degraded.banner',
      'degraded.partialData',
      'connection.degraded',
      'connection.offline',
    ]) {
      expect(appSource).toContain(marker);
    }
    expect(appSource).not.toContain('{error}');
    expect(appSource).not.toContain('JSON.stringify(error');
    expect(appSource).not.toContain('trace_id');
    expect(appSource).not.toContain('payload_json');
  });

  it('keeps all Runtime calls behind the existing API client and adds connection probe there only', () => {
    expect(apiClientSource).toContain('getRuntimeConnectionStatus');
    expect(apiClientSource).toContain("`/projects/${projectId}/summary`");
    expect(appSource).toContain('runtimeApi.getRuntimeConnectionStatus');
    expect(appSource).not.toMatch(/fetch\(|axios\.|PrismaClient|better-sqlite3|sqlite3|DATABASE_URL|process\.env|from ['"]fs['"]/);
  });

  it('defines English, Simplified Chinese, and Traditional Chinese i18n keys for every R40 state', () => {
    for (const key of [
      'onboarding.firstRun',
      'onboarding.description',
      'onboarding.step.connect',
      'onboarding.step.inspect',
      'onboarding.step.act',
      'onboarding.nextAction',
      'nextAction.createGroup',
      'nextAction.dispatchCreated',
      'nextAction.reviewPending',
      'nextAction.resolveBlocked',
      'nextAction.watchRuntime',
      'empty.title',
      'empty.description',
      'loading.runtime',
      'error.title',
      'error.retry',
      'degraded.banner',
      'degraded.partialData',
      'connection.status',
      'connection.connected',
      'connection.degraded',
      'connection.offline',
    ]) {
      const occurrences = (i18nSource.match(new RegExp(key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length;
      expect(occurrences).toBe(3);
    }
  });
});
