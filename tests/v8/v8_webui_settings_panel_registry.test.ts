import { describe, expect, it } from '@jest/globals';
import { readFileSync } from 'fs';
import { join } from 'path';

const settingsPanelSource = readFileSync(
  join(__dirname, '../../src/webui/src/components/SettingsPanel.tsx'),
  'utf8',
);

const routesSource = readFileSync(
  join(__dirname, '../../src/api/routes.ts'),
  'utf8',
);

describe('WebUI SettingsPanel registry integration contract', () => {
  it('SettingsPanel is explicitly wired to V8 agents, review policies, and cron registry APIs', () => {
    for (const marker of [
      'V8_SETTINGS_REGISTRY_CONTRACT',
      '/api/v1/runtime/projects/${PROJECT_ID}/agents',
      '/api/v1/runtime/projects/${PROJECT_ID}/review-policies',
      '/api/v1/runtime/projects/${PROJECT_ID}/cronjobs',
      'reviewPolicies',
      'cronjobs',
      'group_only',
      'pm_audit_immediate',
    ]) {
      expect(settingsPanelSource).toContain(marker);
    }
  });

  it('SettingsPanel no longer depends on legacy controller config endpoints for review routing', () => {
    expect(settingsPanelSource).not.toContain('/api/v1/controllers');
    expect(settingsPanelSource).not.toContain('/api/v1/controllers/${selectedControllerId}/config');
    expect(settingsPanelSource).not.toContain('acceptance_mode');
    expect(settingsPanelSource).not.toContain('reviewer_routing');
  });

  it('Runtime routes expose thin project-scoped read endpoints for agents and review policies', () => {
    for (const marker of [
      "router.get('/runtime/projects/:projectId/agents'",
      "router.get('/runtime/projects/:projectId/review-policies'",
      'listAgents',
      'listReviewPolicies',
      'runtimeServiceOr503',
    ]) {
      expect(routesSource).toContain(marker);
    }
  });

  it('SettingsPanel remains API-only and does not touch direct DB or scheduler mutation APIs', () => {
    for (const forbidden of [
      'src/db/dal',
      'better-sqlite3',
      'sqlite3',
      'data/nexus.db',
      'prisma/data/nexus.db',
      '$queryRaw',
      '$executeRaw',
      'cronjob.start',
      'cronjob.stop',
      'cronjob.pause',
      'cronjob.resume',
    ]) {
      expect(settingsPanelSource).not.toContain(forbidden);
    }
  });
});
