import { describe, expect, it } from '@jest/globals';
import { readFileSync } from 'fs';
import { join } from 'path';

const dagViewSource = readFileSync(
  join(__dirname, '../../src/webui/src/components/DAGView.tsx'),
  'utf8',
);

const V8_TASK_STATUSES = [
  'created',
  'dispatched',
  'running',
  'completion_pending',
  'review_pending',
  'completed',
  'retry_ready',
  'blocked',
  'dead_letter',
  'cancelled',
];

const LEGACY_TASK_STATUSES = ['accepted', 'validating', 'review_spawned'];
const LEGACY_TASK_FAILURE_STATUS = 'failed';

describe('WebUI V8 status display contract', () => {
  it('DAGView source lists every V8 task status for display mapping', () => {
    for (const status of V8_TASK_STATUSES) {
      expect(dagViewSource).toContain(`'${status}'`);
    }
  });

  it('DAGView source does not expose legacy task status strings', () => {
    for (const status of LEGACY_TASK_STATUSES) {
      expect(dagViewSource).not.toContain(status);
    }
    expect(dagViewSource).not.toContain(`'${LEGACY_TASK_FAILURE_STATUS}'`);
    expect(dagViewSource).not.toContain(`\"${LEGACY_TASK_FAILURE_STATUS}\"`);
  });

  it('DAGView source labels the status display as V8 aligned', () => {
    expect(dagViewSource).toContain('V8_TASK_STATUS_LABELS');
    expect(dagViewSource).toContain('V8 状态机');
  });
});
