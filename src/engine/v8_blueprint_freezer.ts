import type { PrismaClient } from '@prisma/client';
import { parseV8Blueprint, type V8Blueprint } from '../blueprints/v8_blueprint_schema';

export interface FreezeV8BlueprintInput {
  prisma: PrismaClient;
  project_id: string;
  blueprint: unknown;
}

export interface FreezeV8BlueprintResult {
  blueprint_id: string;
  project_id: string;
  status: 'frozen';
  phase_count: number;
  task_count: number;
}

function countTasks(blueprint: V8Blueprint): number {
  return blueprint.phases.reduce((sum, phase) => sum + phase.tasks.length, 0);
}

/**
 * Freeze a V8 blueprint as inert project metadata.
 *
 * R3-T2 boundary: this function must not create TaskGroup / Task rows and must
 * not activate the blueprint for legacy thaw loops. A later explicit thaw phase
 * is responsible for turning the frozen schema into runtime entities via the
 * V8 service/FSM boundary.
 */
export async function freezeV8Blueprint(input: FreezeV8BlueprintInput): Promise<FreezeV8BlueprintResult> {
  const blueprint = parseV8Blueprint(input.blueprint);

  const project = await input.prisma.project.findUnique({
    where: { id: input.project_id },
    select: { id: true },
  });
  if (!project) {
    throw new Error(`Project ${input.project_id} not found`);
  }

  const existing = await input.prisma.projectBlueprint.findUnique({
    where: { blueprint_id: blueprint.blueprint_id },
    select: { id: true, project_id: true },
  });

  if (existing && existing.project_id !== input.project_id) {
    throw new Error(`Blueprint ${blueprint.blueprint_id} already belongs to another project`);
  }

  await input.prisma.projectBlueprint.upsert({
    where: { blueprint_id: blueprint.blueprint_id },
    update: {
      name: blueprint.name,
      version: blueprint.version,
      schema_json: JSON.stringify(blueprint),
      status: 'frozen',
    },
    create: {
      project_id: input.project_id,
      blueprint_id: blueprint.blueprint_id,
      name: blueprint.name,
      version: blueprint.version,
      schema_json: JSON.stringify(blueprint),
      status: 'frozen',
    },
  });

  return {
    blueprint_id: blueprint.blueprint_id,
    project_id: input.project_id,
    status: 'frozen',
    phase_count: blueprint.phases.length,
    task_count: countTasks(blueprint),
  };
}
