import { describe, expect, it } from '@jest/globals';
import { readFileSync } from 'fs';
import { join } from 'path';

const dagViewSource = readFileSync(
  join(__dirname, '../../src/webui/src/components/DAGView.tsx'),
  'utf8',
);

describe('WebUI DAG / phase / group / next responsible display contract', () => {
  it('DAGView source keeps explicit V8 display markers for DAG, phase, group, and next responsible', () => {
    for (const marker of [
      'V8_DAG_DISPLAY_CONTRACT',
      'phaseId',
      'groupId',
      'nextResponsible',
      'dependencies',
      'Phase:',
      'Group:',
      'Next:',
      'Deps:',
    ]) {
      expect(dagViewSource).toContain(marker);
    }
  });

  it('DAGView builds ReactFlow edges from project-scoped task dependency IDs', () => {
    expect(dagViewSource).toContain('buildDependencyEdges');
    expect(dagViewSource).toContain('depends_on_id');
    expect(dagViewSource).toContain('source: dependsOnId');
    expect(dagViewSource).toContain('target: task.id');
    expect(dagViewSource).toContain('type: \'smoothstep\'');
  });

  it('DAGView derives fail-safe next responsible from V8 task status, reviewer, and lane/worker metadata', () => {
    expect(dagViewSource).toContain('deriveNextResponsible');
    expect(dagViewSource).toContain('Reviewer');
    expect(dagViewSource).toContain('Worker');
    expect(dagViewSource).toContain('PM');
    expect(dagViewSource).toContain('No next responsible');
  });

  it('DAGView requests project-scoped graph metadata from the API instead of direct DB access', () => {
    expect(dagViewSource).toContain('/api/v1/tasks?limit=100&include_graph=true');
    for (const forbidden of ['better-sqlite3', 'sqlite3', 'data/nexus.db', 'prisma/data/nexus.db', '$queryRaw', '$executeRaw']) {
      expect(dagViewSource).not.toContain(forbidden);
    }
  });
});
