export const V8_TASK_STATUSES = [
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
] as const;

export const V8_RUN_STATUSES = ['created', 'running', 'success', 'cancelled', 'error'] as const;

export const V8_REVIEW_STATUSES = [
  'created',
  'dispatched',
  'running',
  'passed',
  'changes_requested',
  'blocked',
  'cancelled',
] as const;

export const V8_REPORT_STATUSES = ['pending', 'sending', 'sent', 'suppressed', 'error'] as const;

export type V8TaskStatus = (typeof V8_TASK_STATUSES)[number];
export type V8RunStatus = (typeof V8_RUN_STATUSES)[number];
export type V8ReviewStatus = (typeof V8_REVIEW_STATUSES)[number];
export type V8ReportStatus = (typeof V8_REPORT_STATUSES)[number];

export interface V8StateMap {
  task: V8TaskStatus;
  run: V8RunStatus;
  review: V8ReviewStatus;
  report: V8ReportStatus;
}

export type V8EntityType = keyof V8StateMap;

type TransitionMatrix<T extends string> = Readonly<Record<T, readonly T[]>>;

export const V8_TASK_TRANSITIONS: TransitionMatrix<V8TaskStatus> = {
  created: ['dispatched', 'cancelled'],
  dispatched: ['running', 'created', 'cancelled'],
  running: ['completion_pending', 'retry_ready', 'blocked', 'dead_letter', 'cancelled'],
  completion_pending: ['review_pending', 'completed', 'retry_ready', 'blocked', 'cancelled'],
  review_pending: ['completed', 'retry_ready', 'blocked', 'cancelled'],
  retry_ready: ['dispatched', 'dead_letter', 'cancelled'],
  blocked: ['retry_ready', 'dead_letter', 'cancelled'],
  completed: [],
  dead_letter: [],
  cancelled: [],
} as const;

export const V8_RUN_TRANSITIONS: TransitionMatrix<V8RunStatus> = {
  created: ['running', 'cancelled'],
  running: ['success', 'error', 'cancelled'],
  error: [],
  success: [],
  cancelled: [],
} as const;

export const V8_REVIEW_TRANSITIONS: TransitionMatrix<V8ReviewStatus> = {
  created: ['dispatched', 'cancelled'],
  dispatched: ['running', 'cancelled'],
  running: ['passed', 'changes_requested', 'blocked', 'cancelled'],
  blocked: ['running', 'cancelled'],
  passed: [],
  changes_requested: [],
  cancelled: [],
} as const;

export const V8_REPORT_TRANSITIONS: TransitionMatrix<V8ReportStatus> = {
  pending: ['sending', 'suppressed'],
  sending: ['sent', 'error', 'suppressed'],
  error: ['pending', 'suppressed'],
  sent: [],
  suppressed: [],
} as const;

export const V8_TRANSITION_MATRIX = {
  task: V8_TASK_TRANSITIONS,
  run: V8_RUN_TRANSITIONS,
  review: V8_REVIEW_TRANSITIONS,
  report: V8_REPORT_TRANSITIONS,
} as const;

export const V8_STATUS_ENUMS = {
  task: V8_TASK_STATUSES,
  run: V8_RUN_STATUSES,
  review: V8_REVIEW_STATUSES,
  report: V8_REPORT_STATUSES,
} as const;

function isKnownEntity(entity: string): entity is V8EntityType {
  return Object.prototype.hasOwnProperty.call(V8_TRANSITION_MATRIX, entity);
}

function includesState(states: readonly string[], state: string): boolean {
  return states.includes(state);
}

export function isV8State<E extends V8EntityType>(entity: E, state: string): state is V8StateMap[E] {
  if (!isKnownEntity(entity)) return false;
  return includesState(V8_STATUS_ENUMS[entity], state);
}

export function getAllowedV8NextStates<E extends V8EntityType>(entity: E, from: V8StateMap[E]): readonly V8StateMap[E][] {
  const matrix = V8_TRANSITION_MATRIX[entity] as Readonly<Record<string, readonly V8StateMap[E][]>>;
  return matrix[from] ?? [];
}

export function canTransitionV8<E extends V8EntityType>(entity: E, from: string, to: string): boolean {
  if (!isKnownEntity(entity)) return false;
  if (!isV8State(entity, from) || !isV8State(entity, to)) return false;
  return getAllowedV8NextStates(entity, from).includes(to as V8StateMap[E]);
}

export function assertV8TransitionAllowed<E extends V8EntityType>(entity: E, from: string, to: string): void {
  if (canTransitionV8(entity, from, to)) return;
  throw new Error(`Illegal V8 ${entity} transition: ${from} -> ${to}`);
}
