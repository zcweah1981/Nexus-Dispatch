import { describe, expect, it } from '@jest/globals';
import { readFileSync } from 'fs';
import { join } from 'path';

const appSource = readFileSync(join(__dirname, '../../src/webui/src/App.tsx'), 'utf8');
const i18nSource = readFileSync(join(__dirname, '../../src/webui/src/i18n.ts'), 'utf8');
const apiClientSource = readFileSync(join(__dirname, '../../src/webui/src/apiClient.ts'), 'utf8');

describe('R40-T4 product smoke flow and demo project lifecycle contract', () => {
  it('adds an API-only product smoke flow page that covers the full launch lifecycle', () => {
    expect(appSource).toContain('R40_PRODUCT_SMOKE_FLOW_CONTRACT');
    for (const marker of [
      'productSmokeFlow',
      'renderProductSmokeFlow',
      'buildProductSmokeSteps',
      'RuntimeProductSmokeStep',
      'task_group_lifecycle',
      'dispatch_status',
      'proof_review',
      'release_readiness',
      'archive_closeout',
      'state.releaseReadiness',
      'state.proofs',
      'runtimeApi.getReleaseReadiness',
      'runtimeApi.searchProofs',
    ]) {
      expect(appSource).toContain(marker);
    }
  });

  it('uses Runtime API client methods for release readiness and proof search instead of local DB/filesystem state', () => {
    expect(apiClientSource).toContain('RuntimeReleaseReadiness');
    expect(apiClientSource).toContain('RuntimeProofSummary');
    expect(apiClientSource).toContain('getReleaseReadiness');
    expect(apiClientSource).toContain("`/projects/${projectId}/release/readiness`");
    expect(apiClientSource).toContain('searchProofs');
    expect(apiClientSource).toContain("`/projects/${projectId}/proofs${query(options)}`");
    expect(appSource).not.toMatch(/PrismaClient|better-sqlite3|sqlite3|DATABASE_URL|process\.env|from ['"]fs['"]/);
  });

  it('labels demo/mock fallback clearly and never presents it as production state', () => {
    for (const marker of [
      'demoOnlyFallbackLabel',
      'smoke.demoFallback.title',
      'smoke.demoFallback.body',
      'smoke.apiOnlyNotice',
      'smoke.noFakeProduction',
    ]) {
      expect(appSource).toContain(marker);
    }
    expect(appSource).not.toContain('fake production');
    expect(appSource).not.toContain('mock production');
  });

  it('defines English, Simplified Chinese, and Traditional Chinese i18n copy for product smoke flow', () => {
    for (const key of [
      'page.productSmokeFlow',
      'smoke.apiOnlyNotice',
      'smoke.demoFallback.title',
      'smoke.demoFallback.body',
      'smoke.noFakeProduction',
      'smoke.step.task_group_lifecycle',
      'smoke.step.dispatch_status',
      'smoke.step.proof_review',
      'smoke.step.release_readiness',
      'smoke.step.archive_closeout',
      'smoke.status.real',
      'smoke.status.demo',
      'smoke.status.blocked',
    ]) {
      const occurrences = (i18nSource.match(new RegExp(key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length;
      expect(occurrences).toBe(3);
    }
  });
});
