import type { PrismaClient } from '@prisma/client';
import { parseV8Blueprint, type V8BlueprintPhase, type V8BlueprintTask } from '../blueprints/v8_blueprint_schema';

export class V8BlueprintThawError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'V8BlueprintThawError';
  }
}

export interface ThawV8CurrentPhaseInput {
  prisma: PrismaClient;
  project_id: string;
  blueprint_id: string;
  phase_id?: string;
  group_id?: string;
}

export interface ThawV8CurrentPhaseResult {
  project_id: string;
  blueprint_id: string;
  phase_id: string;
  group_id: string;
  task_group_id: string;
  status: 'thawed';
  created_group: boolean;
  created_task_ids: string[];
  skipped_task_ids: string[];
  dependency_count: number;
}

function json(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined;
  return JSON.stringify(value);
}

function findPhase(phases: V8BlueprintPhase[], input: ThawV8CurrentPhaseInput): V8BlueprintPhase {
  const phase = input.phase_id
    ? phases.find((candidate) => candidate.phase_id === input.phase_id)
    : input.group_id
      ? phases.find((candidate) => candidate.group_id === input.group_id)
      : phases[0];
  if (!phase) {
    throw new V8BlueprintThawError(404, 'NOT_FOUND', 'Requested blueprint phase/group was not found', {
      phase_id: input.phase_id,
      group_id: input.group_id,
    });
  }
  return phase;
}

function taskExtMeta(blueprintId: string, phase: V8BlueprintPhase, task: V8BlueprintTask): Record<string, unknown> {
  return {
    ...(task.ext_meta ?? {}),
    blueprint_id: blueprintId,
    phase_id: phase.phase_id,
    group_id: phase.group_id,
    blueprint_task_id: task.task_id,
  };
}

async function assertPriorPhaseSummaryProof(input: ThawV8CurrentPhaseInput, phases: V8BlueprintPhase[], phase: V8BlueprintPhase): Promise<void> {
  const phaseIndex = phases.findIndex((candidate) => candidate.phase_id === phase.phase_id);
  if (phaseIndex <= 0) return;

  const priorPhase = phases[phaseIndex - 1];
  const priorGroup = await input.prisma.taskGroup.findFirst({
    where: { project_id: input.project_id, group_id: priorPhase.group_id },
    select: { id: true, status: true },
  });
  const sentSummary = priorGroup
    ? await input.prisma.report.findFirst({
      where: {
        project_id: input.project_id,
        message_type: 'group_summary',
        status: 'sent',
        OR: [
          { payload_json: { contains: `"group_id":"${priorPhase.group_id}"` } },
          { payload_json: { contains: `"task_group_id":"${priorGroup.id}"` } },
        ],
      },
      select: { id: true },
    })
    : null;

  if (!priorGroup || priorGroup.status !== 'archived' || !sentSummary) {
    throw new V8BlueprintThawError(409, 'GROUP_SUMMARY_PROOF_REQUIRED', 'Previous group must be archived and have sent group_summary proof before thawing a later phase', {
      required_group_id: priorPhase.group_id,
      required_group_status: 'archived',
      required_report: { message_type: 'group_summary', status: 'sent' },
    });
  }
}

/**
 * Explicitly thaw one V8 blueprint phase/group into runtime TaskGroup + Task rows.
 *
 * R3-T3 scope: generate only the selected current phase, keep tasks in `created`
 * so dispatch/status movement remains governed by the V8 Runtime API/FSM service.
 */
export async function thawV8CurrentPhase(input: ThawV8CurrentPhaseInput): Promise<ThawV8CurrentPhaseResult> {
  if (!input.phase_id && !input.group_id) {
    throw new V8BlueprintThawError(400, 'BAD_REQUEST', 'phase_id or group_id is required');
  }

  const stored = await input.prisma.projectBlueprint.findFirst({
    where: {
      project_id: input.project_id,
      blueprint_id: input.blueprint_id,
      status: 'frozen',
    },
  });
  if (!stored) {
    throw new V8BlueprintThawError(404, 'NOT_FOUND', 'Frozen blueprint was not found in this project', {
      project_id: input.project_id,
      blueprint_id: input.blueprint_id,
    });
  }

  const blueprint = parseV8Blueprint(JSON.parse(stored.schema_json));
  const phase = findPhase(blueprint.phases, input);
  await assertPriorPhaseSummaryProof(input, blueprint.phases, phase);

  return input.prisma.$transaction(async (tx) => {
    let group = await tx.taskGroup.findFirst({
      where: { project_id: input.project_id, group_id: phase.group_id },
    });
    const createdGroup = !group;
    if (!group) {
      group = await tx.taskGroup.create({
        data: {
          project_id: input.project_id,
          group_id: phase.group_id,
          name: phase.name,
          description: phase.description,
          status: 'active',
          priority: phase.priority ?? 0,
          ext_meta: json({ blueprint_id: blueprint.blueprint_id, phase_id: phase.phase_id, thawed_from: 'v8_blueprint' }),
        },
      });
    }

    const createdTaskIds: string[] = [];
    const skippedTaskIds: string[] = [];

    for (const task of phase.tasks) {
      const existingTask = await tx.task.findFirst({
        where: { project_id: input.project_id, id: task.task_id },
        select: { id: true },
      });
      if (existingTask) {
        skippedTaskIds.push(task.task_id);
        continue;
      }

      await tx.task.create({
        data: {
          id: task.task_id,
          project_id: input.project_id,
          title: task.title,
          objective: task.objective,
          lane_required: task.lane_required,
          status: 'created',
          payload: json(task.payload),
          payload_schema: json(task.payload_schema),
          ext_meta: json(taskExtMeta(blueprint.blueprint_id, phase, task)),
          task_group_id: group.id,
          acceptance_criteria: json(task.acceptance_criteria),
          reviewer: task.reviewer,
          acceptance_mode: task.acceptance_mode,
          max_retries: task.max_retries ?? 3,
          retry_count: 0,
        },
      });
      createdTaskIds.push(task.task_id);
    }

    let dependencyCount = 0;
    for (const task of phase.tasks) {
      for (const dependsOnId of task.depends_on ?? []) {
        const source = await tx.task.findFirst({
          where: { project_id: input.project_id, id: task.task_id },
          select: { id: true },
        });
        const target = await tx.task.findFirst({
          where: { project_id: input.project_id, id: dependsOnId },
          select: { id: true },
        });
        if (!source || !target) {
          throw new V8BlueprintThawError(400, 'BAD_REQUEST', 'Blueprint dependency target is not available in thawed project scope', {
            task_id: task.task_id,
            depends_on: dependsOnId,
          });
        }

        const existingDependency = await tx.taskDependency.findFirst({
          where: { project_id: input.project_id, task_id: task.task_id, depends_on_id: dependsOnId },
          select: { id: true },
        });
        if (!existingDependency) {
          await tx.taskDependency.create({
            data: {
              project_id: input.project_id,
              task_id: task.task_id,
              depends_on_id: dependsOnId,
              dependency_type: 'blocks',
            },
          });
        }
        dependencyCount += 1;
      }
    }

    return {
      project_id: input.project_id,
      blueprint_id: blueprint.blueprint_id,
      phase_id: phase.phase_id,
      group_id: phase.group_id,
      task_group_id: group.id,
      status: 'thawed',
      created_group: createdGroup,
      created_task_ids: createdTaskIds,
      skipped_task_ids: skippedTaskIds,
      dependency_count: dependencyCount,
    };
  });
}
