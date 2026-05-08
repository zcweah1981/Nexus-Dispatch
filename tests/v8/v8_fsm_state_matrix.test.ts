import {
  V8_REPORT_STATUSES,
  V8_REVIEW_STATUSES,
  V8_RUN_STATUSES,
  V8_TASK_STATUSES,
  assertV8TransitionAllowed,
  canTransitionV8,
  getAllowedV8NextStates,
} from '../../src/fsm/v8_state_matrix';

describe('V8-R2 FSM state matrix', () => {
  test('defines task/run/review/report state enums without legacy statuses in the new mainline', () => {
    expect(V8_TASK_STATUSES).toEqual([
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
    ]);
    expect(V8_RUN_STATUSES).toEqual(['created', 'running', 'success', 'cancelled', 'error']);
    expect(V8_REVIEW_STATUSES).toEqual([
      'created',
      'dispatched',
      'running',
      'passed',
      'changes_requested',
      'blocked',
      'cancelled',
    ]);
    expect(V8_REPORT_STATUSES).toEqual(['pending', 'sending', 'sent', 'suppressed', 'error']);

    const newMainlineStatuses = [
      ...V8_TASK_STATUSES,
      ...V8_RUN_STATUSES,
      ...V8_REVIEW_STATUSES,
      ...V8_REPORT_STATUSES,
    ];
    expect(newMainlineStatuses).not.toEqual(expect.arrayContaining(['validating', 'review_spawned', 'failed']));
  });

  test('allows legal task lifecycle transitions and rejects illegal skips/regressions', () => {
    expect(canTransitionV8('task', 'created', 'dispatched')).toBe(true);
    expect(canTransitionV8('task', 'dispatched', 'running')).toBe(true);
    expect(canTransitionV8('task', 'running', 'completion_pending')).toBe(true);
    expect(canTransitionV8('task', 'completion_pending', 'review_pending')).toBe(true);
    expect(canTransitionV8('task', 'review_pending', 'completed')).toBe(true);
    expect(canTransitionV8('task', 'review_pending', 'retry_ready')).toBe(true);
    expect(canTransitionV8('task', 'retry_ready', 'dispatched')).toBe(true);
    expect(canTransitionV8('task', 'running', 'blocked')).toBe(true);
    expect(canTransitionV8('task', 'blocked', 'retry_ready')).toBe(true);
    expect(canTransitionV8('task', 'running', 'dead_letter')).toBe(true);

    expect(canTransitionV8('task', 'created', 'completed')).toBe(false);
    expect(canTransitionV8('task', 'completed', 'running')).toBe(false);
    expect(canTransitionV8('task', 'cancelled', 'created')).toBe(false);
    expect(canTransitionV8('task', 'completion_pending', 'dispatched')).toBe(false);
  });

  test('allows legal run/review/report transitions and rejects illegal transitions', () => {
    expect(canTransitionV8('run', 'created', 'running')).toBe(true);
    expect(canTransitionV8('run', 'running', 'success')).toBe(true);
    expect(canTransitionV8('run', 'running', 'error')).toBe(true);
    expect(canTransitionV8('run', 'created', 'cancelled')).toBe(true);
    expect(canTransitionV8('run', 'success', 'running')).toBe(false);

    expect(canTransitionV8('review', 'created', 'dispatched')).toBe(true);
    expect(canTransitionV8('review', 'running', 'passed')).toBe(true);
    expect(canTransitionV8('review', 'running', 'changes_requested')).toBe(true);
    expect(canTransitionV8('review', 'changes_requested', 'running')).toBe(false);

    expect(canTransitionV8('report', 'pending', 'sending')).toBe(true);
    expect(canTransitionV8('report', 'sending', 'sent')).toBe(true);
    expect(canTransitionV8('report', 'sending', 'error')).toBe(true);
    expect(canTransitionV8('report', 'error', 'pending')).toBe(true);
    expect(canTransitionV8('report', 'sent', 'pending')).toBe(false);
  });

  test('fails closed for unknown entity/state values and exposes allowed next states', () => {
    expect(canTransitionV8('task', 'validating', 'review_pending')).toBe(false);
    expect(canTransitionV8('task', 'completion_pending', 'review_spawned')).toBe(false);
    expect(canTransitionV8('run', 'running', 'failed')).toBe(false);
    expect(canTransitionV8('unknown' as never, 'created', 'running')).toBe(false);

    expect(getAllowedV8NextStates('task', 'completion_pending')).toEqual(['review_pending', 'completed', 'retry_ready', 'blocked', 'cancelled']);
    expect(() => assertV8TransitionAllowed('task', 'created', 'completed')).toThrow(
      /Illegal V8 task transition: created -> completed/,
    );
  });
});
