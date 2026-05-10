import { describe, expect, it } from '@jest/globals';
import { readFileSync } from 'fs';
import { join } from 'path';

const hookSource = readFileSync(
  join(__dirname, '../../src/webui/src/hooks/useSSE.ts'),
  'utf8',
);
const dagViewSource = readFileSync(
  join(__dirname, '../../src/webui/src/components/DAGView.tsx'),
  'utf8',
);
const artifactGallerySource = readFileSync(
  join(__dirname, '../../src/webui/src/components/ArtifactGallery.tsx'),
  'utf8',
);
const routesSource = readFileSync(
  join(__dirname, '../../src/api/routes.ts'),
  'utf8',
);

describe('V8-R8-T5 WebUI SSE report/task/group event subscription contract', () => {
  it('useSSE explicitly supports report/task/group V8 event names and one API-only EventSource stream', () => {
    expect(hookSource).toContain('V8_SSE_REPORT_TASK_GROUP_EVENTS_CONTRACT');
    expect(hookSource).toContain("'report_created'");
    expect(hookSource).toContain("'report_status_updated'");
    expect(hookSource).toContain("'group_status_updated'");
    expect(hookSource).toContain("'group_summary_created'");
    expect(hookSource).toContain("'/api/v1/events/stream'");
    expect(hookSource).toContain("addEventListener('state_change'");
    expect(hookSource).not.toContain('data/nexus.db');
    expect(hookSource).not.toContain('prisma/data/nexus.db');
    expect(hookSource).not.toContain('better-sqlite3');
  });

  it('DAGView handles task and group SSE events without direct DB/state writes', () => {
    expect(dagViewSource).toContain('V8_SSE_TASK_GROUP_EVENT_HANDLERS');
    expect(dagViewSource).toContain("case 'task_transitioned'");
    expect(dagViewSource).toContain("case 'tasks_batch_injected'");
    expect(dagViewSource).toContain("case 'group_status_updated'");
    expect(dagViewSource).toContain('refreshGraphFromApi');
    expect(dagViewSource).toContain('include_graph=true');
    expect(dagViewSource).not.toContain('better-sqlite3');
    expect(dagViewSource).not.toContain('$queryRaw');
    expect(dagViewSource).not.toContain('$executeRaw');
  });

  it('ArtifactGallery subscribes to report and group summary SSE events as visible proof cards', () => {
    expect(artifactGallerySource).toContain('V8_SSE_REPORT_GROUP_EVENT_HANDLERS');
    expect(artifactGallerySource).toContain("case 'report_created'");
    expect(artifactGallerySource).toContain("case 'report_status_updated'");
    expect(artifactGallerySource).toContain("case 'group_summary_created'");
    expect(artifactGallerySource).toContain('appendArtifactCard');
    expect(artifactGallerySource).toContain('report_proof');
    expect(artifactGallerySource).toContain('group_summary');
    expect(artifactGallerySource).toContain('Proof 已存系统');
    expect(artifactGallerySource).not.toContain('JSON.stringify(art.payload');
  });

  it('Runtime routes emit project-scoped report and group events through stateEmitter only', () => {
    expect(routesSource).toContain("'report_created'");
    expect(routesSource).toContain("'report_status_updated'");
    expect(routesSource).toContain("'group_status_updated'");
    expect(routesSource).toContain("'group_summary_created'");
    expect(routesSource).toContain('project_id');
    const v8Slice = routesSource.slice(routesSource.indexOf('V8-R2 Runtime API + FSM Controller boundary'), routesSource.indexOf('T2.1: 任务管理 API'));
    expect(v8Slice).toContain('V8RuntimeApiService');
    expect(v8Slice).not.toContain('better-sqlite3');
    expect(v8Slice).not.toContain('data/nexus.db');
    expect(v8Slice).not.toContain('$queryRaw');
    expect(v8Slice).not.toContain('$executeRaw');
  });
});
