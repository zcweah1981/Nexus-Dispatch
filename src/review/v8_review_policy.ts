import { PrismaClient } from '@prisma/client';

function stringifyJson(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined;
  return typeof value === 'string' ? value : JSON.stringify(value);
}

export interface ReviewPolicyUpsertInput {
  policy_id: string;
  agent_id?: string | null;
  lane?: string | null;
  reviewer_agent_id: string;
  priority?: number;
  enabled?: boolean;
  policy_json?: unknown;
}

export type ReviewPolicySource = 'agent_override' | 'lane_override' | 'project_default' | 'fallback';

export interface ReviewPolicyEvaluationInput {
  project_id: string;
  agent_id?: string | null;
  lane?: string | null;
  fallback_reviewer?: string;
}

export interface ReviewPolicyEvaluationResult {
  project_id: string;
  policy_id: string | null;
  reviewer_agent_id: string;
  source: ReviewPolicySource;
  priority: number | null;
  policy_json?: unknown;
}

function parsePolicyJson(raw: string | null): unknown | undefined {
  if (!raw) return undefined;
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

export class ReviewPolicyRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async upsert(projectId: string, input: ReviewPolicyUpsertInput) {
    const project = await this.prisma.project.findUnique({ where: { id: projectId }, select: { id: true } });
    if (!project) throw new Error(`Project ${projectId} not found`);

    return this.prisma.reviewPolicy.upsert({
      where: { project_id_policy_id: { project_id: projectId, policy_id: input.policy_id } },
      create: {
        project_id: projectId,
        policy_id: input.policy_id,
        agent_id: input.agent_id ?? undefined,
        lane: input.lane ?? undefined,
        reviewer_agent_id: input.reviewer_agent_id,
        priority: input.priority ?? 0,
        enabled: input.enabled ?? true,
        policy_json: stringifyJson(input.policy_json),
      },
      update: {
        agent_id: input.agent_id ?? null,
        lane: input.lane ?? null,
        reviewer_agent_id: input.reviewer_agent_id,
        priority: input.priority ?? 0,
        enabled: input.enabled ?? true,
        policy_json: stringifyJson(input.policy_json) ?? null,
      },
    });
  }

  async get(projectId: string, policyId: string) {
    return this.prisma.reviewPolicy.findFirst({ where: { project_id: projectId, policy_id: policyId } });
  }

  async list(projectId: string, filters?: { enabled?: boolean; agent_id?: string | null; lane?: string | null }) {
    return this.prisma.reviewPolicy.findMany({
      where: {
        project_id: projectId,
        ...(filters?.enabled !== undefined ? { enabled: filters.enabled } : {}),
        ...(filters?.agent_id !== undefined ? { agent_id: filters.agent_id } : {}),
        ...(filters?.lane !== undefined ? { lane: filters.lane } : {}),
      },
      orderBy: [{ priority: 'desc' }, { created_at: 'asc' }, { policy_id: 'asc' }],
    });
  }
}

export async function evaluateReviewPolicy(
  deps: { prisma: PrismaClient },
  input: ReviewPolicyEvaluationInput,
): Promise<ReviewPolicyEvaluationResult> {
  const projectId = input.project_id;
  const fallback = input.fallback_reviewer ?? 'shun-designer-1';
  const enabledPolicies = await deps.prisma.reviewPolicy.findMany({
    where: { project_id: projectId, enabled: true },
    orderBy: [{ priority: 'desc' }, { created_at: 'asc' }, { policy_id: 'asc' }],
  });

  const agentPolicy = input.agent_id
    ? enabledPolicies.find((policy) => policy.agent_id === input.agent_id && (policy.lane === null || policy.lane === input.lane))
    : undefined;
  const lanePolicy = input.lane
    ? enabledPolicies.find((policy) => policy.agent_id === null && policy.lane === input.lane)
    : undefined;
  const defaultPolicy = enabledPolicies.find((policy) => policy.agent_id === null && policy.lane === null);
  const selected = agentPolicy ?? lanePolicy ?? defaultPolicy;

  if (!selected) {
    return {
      project_id: projectId,
      policy_id: null,
      reviewer_agent_id: fallback,
      source: 'fallback',
      priority: null,
    };
  }

  const source: ReviewPolicySource = selected.agent_id ? 'agent_override' : selected.lane ? 'lane_override' : 'project_default';
  return {
    project_id: projectId,
    policy_id: selected.policy_id,
    reviewer_agent_id: selected.reviewer_agent_id,
    source,
    priority: selected.priority,
    policy_json: parsePolicyJson(selected.policy_json),
  };
}
