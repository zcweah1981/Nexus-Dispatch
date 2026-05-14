import { describe, expect, it } from '@jest/globals';
import { readFileSync } from 'fs';
import { join } from 'path';

const root = join(__dirname, '../..');
const read = (path: string) => readFileSync(join(root, path), 'utf8');

const appSource = read('src/webui/src/App.tsx');
const apiClientSource = read('src/webui/src/apiClient.ts');
const i18nSource = read('src/webui/src/i18n.ts');
const routeSource = read('src/api/routes.ts');
const serviceSource = read('src/services/v8_runtime_api_service.ts');
const realtimeSource = read('src/api/realtime_events.ts');
const composeSource = read('docker-compose.yml');

describe('R40-T6 ops/deploy UX, safe templates, and performance pass contract', () => {
  it('adds a WebUI ops/deploy page backed only by Runtime API projections', () => {
    expect(appSource).toContain('R40_OPS_TEMPLATES_PERFORMANCE_CONTRACT');
    for (const marker of [
      'opsTemplatesPerformance',
      'renderOpsTemplatesPerformance',
      'RuntimeOpsStatus',
      'RuntimeTemplateSummary',
      'state.opsStatus',
      'state.templates',
      'runtimeApi.getOpsStatus',
      'runtimeApi.listTemplates',
      'ops.dockerComposeWebuiPort',
      'ops.runtimeApiHealth',
      'ops.workerEndpointHealth',
      'ops.githubCiStatus',
      'ops.sqliteWalWarning',
    ]) {
      expect(appSource).toContain(marker);
    }
    expect(appSource).not.toMatch(/PrismaClient|better-sqlite3|sqlite3|process\.env|from ['"]fs['"]/);
  });

  it('exposes thin Runtime API endpoints for ops status and template summaries', () => {
    expect(apiClientSource).toContain('RuntimeOpsStatus');
    expect(apiClientSource).toContain('RuntimeTemplateSummary');
    expect(apiClientSource).toContain('getOpsStatus');
    expect(apiClientSource).toContain('listTemplates');
    expect(apiClientSource).toContain("`/projects/${projectId}/ops/status`");
    expect(apiClientSource).toContain("`/projects/${projectId}/templates`");

    expect(routeSource).toContain("router.get('/runtime/projects/:projectId/ops/status'");
    expect(routeSource).toContain("router.get('/runtime/projects/:projectId/templates'");
    expect(routeSource).toContain('service.getOpsStatus');
    expect(routeSource).toContain('service.listRuntimeTemplates');
  });

  it('keeps templates as safe named abstractions without raw prompt/proof/secrets', () => {
    expect(serviceSource).toContain('R40_SAFE_RUNTIME_TEMPLATES_CONTRACT');
    for (const id of ['oss_release', 'docs_site', 'agent_workflow', 'api_service', 'research_audit']) {
      expect(serviceSource).toContain(id);
    }
    const templateSlice = serviceSource.slice(serviceSource.indexOf('R40_SAFE_RUNTIME_TEMPLATES_CONTRACT'), serviceSource.indexOf('async getOpsStatus'));
    expect(templateSlice).toContain('safe_api_template_abstraction');
    expect(templateSlice).not.toMatch(/bot_token|chat_id|Bearer\s+|sk-|ghp_|xoxb-|payload_json|raw_proof/);
  });

  it('documents Docker Compose WebUI port and ops health copy without real credentials', () => {
    expect(composeSource).toContain('NEXUS_WEBUI_PORT:-3030');
    expect(composeSource).toContain('nexus-webui');
    expect(composeSource).toContain('nexus-api');
    expect(composeSource).toContain('service_healthy');
    expect(serviceSource).toContain('docker_compose_webui_port');
    expect(serviceSource).toContain('sqlite_wal_db_lock_warning');
    expect(serviceSource).toContain('github_ci_configured');
    expect(serviceSource).toContain('worker_endpoint_health');
  });

  it('adds large-data performance controls: pagination, virtual window, caching, and SSE backpressure', () => {
    for (const marker of [
      'R40_PERFORMANCE_PASS_CONTRACT',
      'createProofSummaryCache',
      'virtualTaskWindow',
      'proofSummaryCache',
      'PERFORMANCE_PAGE_SIZE',
      'backpressureDroppedEvents',
    ]) {
      expect(appSource + apiClientSource + realtimeSource).toContain(marker);
    }
    expect(apiClientSource).toContain('cursor?: string');
    expect(apiClientSource).toContain('offset?: number');
    expect(apiClientSource).toContain('cache_ttl_ms?: number');
    expect(realtimeSource).toContain('maxBufferedEvents');
    expect(realtimeSource).toContain('dropped_events');
  });

  it('defines English, Simplified Chinese, and Traditional Chinese labels for ops/templates/performance UX', () => {
    for (const key of [
      'page.opsTemplatesPerformance',
      'ops.dockerComposeWebuiPort',
      'ops.runtimeApiHealth',
      'ops.workerEndpointHealth',
      'ops.githubCiStatus',
      'ops.sqliteWalWarning',
      'templates.safeAbstraction',
      'templates.ossRelease',
      'templates.docsSite',
      'templates.agentWorkflow',
      'templates.apiService',
      'templates.researchAudit',
      'performance.virtualList',
      'performance.backpressure',
      'performance.cache',
      'performance.pagination',
    ]) {
      const occurrences = (i18nSource.match(new RegExp(key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length;
      expect(occurrences).toBe(3);
    }
  });
});
