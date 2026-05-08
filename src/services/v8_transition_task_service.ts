import { PrismaClient } from '@prisma/client';
import { v4 as uuidv4 } from 'uuid';
import { assertV8TransitionAllowed } from '../fsm/v8_state_matrix';
import { TaskRepository } from '../repositories/v8';

export type TransitionTaskEvent =
  | 'dispatch'
  | 'start'
  | 'submit_completion'
  | 'request_review'
  | 'auto_complete'
  | 'review_pass'
  | 'retry'
  | 'block'
  | 'dead_letter'
  | 'cancel'
  | 'reopen'
  | 'return_to_created';

export interface TransitionTaskInput {
  project_id: string;
  task_id: string;
  event: TransitionTaskEvent;
  proof: Record<string, unknown>;
}

export interface TransitionTaskContext {
  prisma: PrismaClient;
}

export class TransitionTaskError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'TransitionTaskError';
  }
}

const EVENT_TO_STATUS: Record<TransitionTaskEvent, string> = {
  dispatch: 'dispatched',
  start: 'running',
  submit_completion: 'completion_pending',
  request_review: 'review_pending',
  auto_complete: 'completed',
  review_pass: 'completed',
  retry: 'retry_ready',
  block: 'blocked',
  dead_letter: 'dead_letter',
  cancel: 'cancelled',
  reopen: 'retry_ready',
  return_to_created: 'created',
};

function requireNonEmptyString(name: keyof TransitionTaskInput, value: unknown): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new TransitionTaskError(400, 'BAD_REQUEST', `${name} is required`);
  }
  return value;
}

function normalizeInput(input: TransitionTaskInput): TransitionTaskInput {
  const project_id = requireNonEmptyString('project_id', input.project_id);
  const task_id = requireNonEmptyString('task_id', input.task_id);
  const event = requireNonEmptyString('event', input.event) as TransitionTaskEvent;
  if (!Object.prototype.hasOwnProperty.call(EVENT_TO_STATUS, event)) {
    throw new TransitionTaskError(400, 'BAD_REQUEST', `Unsupported task transition event: ${event}`);
  }
  if (!input.proof || typeof input.proof !== 'object' || Array.isArray(input.proof)) {
    throw new TransitionTaskError(400, 'BAD_REQUEST', 'proof is required and must be an object');
  }
  return { project_id, task_id, event, proof: input.proof };
}

function stringify(value: unknown): string {
  return JSON.stringify(value);
}

export async function transitionTask(ctx: TransitionTaskContext, rawInput: TransitionTaskInput) {
  const input = normalizeInput(rawInput);
  const taskRepo = new TaskRepository(ctx.prisma);
  const task = await taskRepo.get(input.project_id, input.task_id);
  if (!task) {
    throw new TransitionTaskError(404, 'NOT_FOUND', `Task ${input.task_id} not found in project ${input.project_id}`);
  }

  const fromStatus = task.status;
  const toStatus = EVENT_TO_STATUS[input.event];
  try {
    assertV8TransitionAllowed('task', fromStatus, toStatus);
  } catch (error: any) {
    throw new TransitionTaskError(409, 'ILLEGAL_TRANSITION', error.message, {
      project_id: input.project_id,
      task_id: input.task_id,
      event: input.event,
      from_status: fromStatus,
      to_status: toStatus,
    });
  }

  let committedAudit: {
    audit_id: string;
    project_id: string;
    task_id: string;
    event: TransitionTaskEvent;
    from_status: string;
    to_status: string;
    proof: Record<string, unknown>;
    created_at: string;
  } | undefined;

  const updatedTask = await ctx.prisma.$transaction(async (tx) => {
    const scopedTask = await tx.task.findFirst({ where: { id: input.task_id, project_id: input.project_id } });
    if (!scopedTask) {
      throw new TransitionTaskError(404, 'NOT_FOUND', `Task ${input.task_id} not found in project ${input.project_id}`);
    }
    try {
      assertV8TransitionAllowed('task', scopedTask.status, toStatus);
    } catch (error: any) {
      throw new TransitionTaskError(409, 'ILLEGAL_TRANSITION', error.message, {
        project_id: input.project_id,
        task_id: input.task_id,
        event: input.event,
        from_status: scopedTask.status,
        to_status: toStatus,
      });
    }

    const audit = {
      audit_id: uuidv4(),
      project_id: input.project_id,
      task_id: input.task_id,
      event: input.event,
      from_status: scopedTask.status,
      to_status: toStatus,
      proof: input.proof,
      created_at: new Date().toISOString(),
    };

    const updateResult = await tx.task.updateMany({
      where: { id: input.task_id, project_id: input.project_id },
      data: { status: toStatus, proof_data: stringify(audit) },
    });
    if (updateResult.count !== 1) {
      throw new TransitionTaskError(404, 'NOT_FOUND', `Task ${input.task_id} not found in project ${input.project_id}`);
    }

    const updated = await tx.task.findFirst({ where: { id: input.task_id, project_id: input.project_id } });
    if (!updated) {
      throw new TransitionTaskError(404, 'NOT_FOUND', `Task ${input.task_id} not found in project ${input.project_id}`);
    }

    const explicitRunId = typeof input.proof.run_id === 'string' ? input.proof.run_id : undefined;
    const auditRun = explicitRunId
      ? await tx.run.findFirst({
          where: { run_id: explicitRunId, project_id: input.project_id, task_id: input.task_id },
          select: { run_id: true },
        })
      : await tx.run.findFirst({
          where: { project_id: input.project_id, task_id: input.task_id },
          orderBy: { started_at: 'desc' },
          select: { run_id: true },
        });

    if (explicitRunId && !auditRun) {
      throw new TransitionTaskError(400, 'BAD_REQUEST', `Run ${explicitRunId} not found for task ${input.task_id} in project ${input.project_id}`);
    }

    if (auditRun) {
      await tx.artifact.create({
        data: {
          project_id: input.project_id,
          task_id: input.task_id,
          run_id: auditRun.run_id,
          artifact_type: 'task_transition_audit',
          payload: stringify(audit),
          payload_data: stringify(audit),
          proof: stringify(input.proof),
          metadata_json: stringify({ source: 'v8_transition_task_service', audit_id: audit.audit_id }),
        },
      });
    }

    committedAudit = audit;
    return updated;
  });

  return { task: updatedTask, audit: committedAudit! };
}
