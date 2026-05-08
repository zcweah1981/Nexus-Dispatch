/**
 * Nexus Dispatch System — DAL v2 (API-only / Prisma ORM)
 * Task: nd-v75-t12 | Agent: long-coder-1
 *
 * 核心原则：
 *   1. 严禁 raw SQL — 全部走 Prisma ORM
 *   2. 所有方法支持 project_id 分区隔离
 *   3. 并发写入安全（WAL + Prisma interactive transactions）
 *   4. 结构化错误处理
 */

import { PrismaClient, Prisma } from '@prisma/client';

// ─── 类型导出 ────────────────────────────────────────────────

export type TaskStatus = 'created' | 'dispatched' | 'accepted' | 'validating' | 'completed' | 'failed';
export type RunStatus = 'running' | 'success' | 'failed';

export interface InjectPhaseTaskInput {
  title: string;
  objective: string;
  lane_required: string;
  payload?: Record<string, unknown>;
  payload_schema?: Record<string, unknown>;
  acceptance_criteria?: string[];
  reviewer?: string;
  acceptance_mode?: string;
}

export interface SpawnReviewResult {
  review_task_id: string;
  review_run_id: string;
}

export interface GroupCompletionResult {
  group_id: string;
  total_tasks: number;
  completed_tasks: number;
  failed_tasks: number;
  pending_tasks: number;
  is_complete: boolean;
}

export interface ControllerConfig {
  controller_id: string;
  name: string;
  entity_type: string;
  states: unknown[];
  transitions: unknown[];
  initial_state: string;
  config_json?: Record<string, any>;
}

// ─── DAL v2 主类 ─────────────────────────────────────────────

export class PrismaDAL {
  private prisma: PrismaClient;
  private static _instance: PrismaDAL | null = null;

  /** 单例获取（方便外部复用同一连接） */
  static getInstance(): PrismaDAL {
    if (!PrismaDAL._instance) {
      PrismaDAL._instance = new PrismaDAL();
    }
    return PrismaDAL._instance;
  }

  constructor(dbUrl?: string) {
    const datasourceOverride = dbUrl
      ? { db: { url: dbUrl } }
      : undefined;

    this.prisma = new PrismaClient({
      datasources: datasourceOverride,
    });
  }

  // ─── 初始化 ─────────────────────────────────────────────────

  /**
   * 启用 WAL 模式 + 外键约束。
   * 这是 Prisma 对 SQLite 并发安全的最佳实践。
   * 注意：使用 Prisma $queryRaw 执行 PRAGMA 是 SQLite 场景下唯一需要 raw 的例外，
   * 不涉及业务数据操作。
   */
  async initPragmas(): Promise<void> {
    // PRAGMA 配置指令（非 DML），通过 $queryRaw 执行
    // SQLite PRAGMA 会返回结果行，$executeRaw 不支持
    await this.prisma.$queryRaw`PRAGMA journal_mode = WAL;`;
    await this.prisma.$queryRaw`PRAGMA foreign_keys = ON;`;
    await this.prisma.$queryRaw`PRAGMA busy_timeout = 5000;`;
  }

  // ═══════════════════════════════════════════════════════════
  //  基础 CRUD（已有方法重写为 Prisma-only）
  // ═══════════════════════════════════════════════════════════

  async createTask(data: Prisma.TaskUncheckedCreateInput) {
    return await this.prisma.task.create({ data });
  }

  async getTask(id: string) {
    return await this.prisma.task.findUnique({ where: { id } });
  }

  async getTaskInProject(id: string, projectId: string) {
    return await this.prisma.task.findFirst({
      where: { id, project_id: projectId },
    });
  }

  async updateTaskStatus(id: string, status: string, projectId?: string) {
    const where: Prisma.TaskWhereUniqueInput = { id };
    if (projectId) {
      // project_id 隔离：通过 findFirst + update 确保不越界
      const task = await this.prisma.task.findFirst({
        where: { id, project_id: projectId },
      });
      if (!task) {
        throw new Error(`Task ${id} not found in project ${projectId}`);
      }
    }
    return await this.prisma.task.update({ where, data: { status } });
  }

  /**
   * updateTaskWithProof — 原子更新任务状态 + proof_data + retry_count
   * 用于 accept/reject 端点一次性写入审核结果
   */
  async updateTaskWithProof(
    id: string,
    status: string,
    proofData: Record<string, unknown>,
    extraData?: { retry_count?: number },
  ) {
    return await this.prisma.task.update({
      where: { id },
      data: {
        status,
        proof_data: JSON.stringify(proofData),
        ...(extraData?.retry_count !== undefined && { retry_count: extraData.retry_count }),
      },
    });
  }

  async listTasksByProject(projectId: string, filters?: { status?: string; lane?: string }) {
    return await this.prisma.task.findMany({
      where: {
        project_id: projectId,
        ...(filters?.status && { status: filters.status }),
        ...(filters?.lane && { lane_required: filters.lane }),
      },
      orderBy: { created_at: 'asc' },
    });
  }

  async createRun(data: Prisma.RunUncheckedCreateInput) {
    return await this.prisma.run.create({ data });
  }

  async getRun(runId: string) {
    return await this.prisma.run.findUnique({ where: { run_id: runId } });
  }

  async updateRunStatus(runId: string, status: string, errorStack?: string | null) {
    return await this.prisma.run.update({
      where: { run_id: runId },
      data: {
        status,
        error_stack: errorStack ?? null,
        ended_at: new Date(),
      },
    });
  }

  // ─── Agent 操作 ──────────────────────────────────────────────

  async upsertAgent(data: Prisma.AgentUncheckedCreateInput) {
    return await this.prisma.agent.upsert({
      where: { id: data.id },
      update: {
        lane: data.lane,
        endpoint: data.endpoint,
        status: 'online',
        last_heartbeat: new Date(),
      },
      create: data,
    });
  }

  async getAgent(agentId: string) {
    return await this.prisma.agent.findUnique({ where: { agent_id: agentId } });
  }

  /**
   * listAgents — 列出所有已注册的 Agent
   * @returns Agent 列表
   */
  async listAgents() {
    return await this.prisma.agent.findMany({
      orderBy: { created_at: 'asc' },
    });
  }

  /**
   * registerAgent — 注册新 Agent 或心跳续约
   *
   * 首次注册：创建 Agent 记录，缺失字段使用默认值
   * 再次注册：更新 last_heartbeat + lane，status 置 online
   *
   * @param data - { id: agent_id, lane, endpoint?, dialect? }
   * @returns Agent 记录
   */
  async registerAgent(data: {
    id: string;
    lane: string;
    endpoint?: string;
    dialect?: string;
    soul_prompt?: string;
    tools_allowed?: string;
  }) {
    const now = new Date();
    const defaults = {
      endpoint: data.endpoint || 'http://localhost:9000/webhook',
      dialect: data.dialect || 'hermes',
      soul_prompt: data.soul_prompt || '',
      tools_allowed: data.tools_allowed || '[]',
    };

    return await this.prisma.agent.upsert({
      where: { agent_id: data.id },
      update: {
        lane: data.lane,
        ...(data.endpoint && { endpoint: data.endpoint }),
        ...(data.dialect && { dialect: data.dialect }),
        status: 'online',
        last_heartbeat: now,
      },
      create: {
        agent_id: data.id,
        lane: data.lane,
        endpoint: defaults.endpoint,
        dialect: defaults.dialect,
        soul_prompt: defaults.soul_prompt,
        tools_allowed: defaults.tools_allowed,
        status: 'online',
        last_heartbeat: now,
      },
    });
  }

  /**
   * getAgentHealth — 单个 Agent 探活
   *
   * 逻辑：last_heartbeat 距今 > 15s 则标记为 offline
   *
   * @param agentId - agent_id（如 'long-coder-1'）
   * @returns Agent 记录 + computed status 或 null
   */
  async getAgentHealth(agentId: string) {
    const agent = await this.prisma.agent.findUnique({
      where: { agent_id: agentId },
    });
    if (!agent) return null;

    const now = Date.now();
    const heartbeatMs = agent.last_heartbeat ? new Date(agent.last_heartbeat).getTime() : 0;
    const elapsed = now - heartbeatMs;
    const computedStatus = elapsed > 15_000 ? 'offline' : 'online';

    return {
      ...agent,
      status: computedStatus,
      health_checked_at: new Date().toISOString(),
    };
  }

  // ─── Project 操作 ────────────────────────────────────────────

  async getProject(projectId: string) {
    return await this.prisma.project.findUnique({ where: { id: projectId } });
  }

  async createProject(data: { name: string; channel_config?: string }) {
    return await this.prisma.project.create({ data });
  }

  async getProjectByName(name: string) {
    return await this.prisma.project.findUnique({ where: { name } });
  }

  // ─── Blueprint 操作 ──────────────────────────────────────────

  async createBlueprint(data: {
    project_id: string;
    name: string;
    blueprint_id: string;
    version: string;
    schema_json: string;
  }) {
    return await this.prisma.projectBlueprint.create({ data });
  }

  async getBlueprintsByProject(projectId: string) {
    return await this.prisma.projectBlueprint.findMany({
      where: { project_id: projectId },
      orderBy: { updated_at: 'desc' },
    });
  }

  // ─── TaskGroup 操作 ─────────────────────────────────────────

  async getTaskGroup(groupId: string) {
    return await this.prisma.taskGroup.findUnique({ where: { group_id: groupId } });
  }

  async createTaskGroup(data: { group_id: string; name: string; description?: string }) {
    return await this.prisma.taskGroup.create({
      data: {
        group_id: data.group_id,
        name: data.name,
        description: data.description,
      },
    });
  }

  // ─── Helper: 测试用预置 ─────────────────────────────────────

  async _createProjectAndAgent(projectId: string, agentId: string) {
    await this.prisma.project.upsert({
      where: { id: projectId },
      update: {},
      create: { id: projectId, name: `Test Project ${projectId}` },
    });
    await this.prisma.agent.upsert({
      where: { id: agentId },
      update: {},
      create: {
        id: agentId,
        agent_id: agentId,
        lane: 'DEV',
        endpoint: 'http://localhost:9000/webhook',
        dialect: 'hermes',
        soul_prompt: 'Test soul prompt',
        tools_allowed: '[]',
      },
    });
  }

  // ═══════════════════════════════════════════════════════════
  //  新增方法 — Phase Task Injection / Review / Controller
  // ═══════════════════════════════════════════════════════════

  /**
   * inject_phase_tasks — 批量注入阶段任务到指定 TaskGroup
   *
   * 业务场景：PM 拆解出一个 Phase 的所有子任务后，一次性注入到数据库。
   * 使用 interactive transaction 确保原子性。
   *
   * @param projectId - 项目隔离 ID
   * @param groupId   - TaskGroup.group_id（如 'nd-v75-p1'）
   * @param tasks     - 任务定义数组
   * @returns 创建的 task ID 列表
   */
  async inject_phase_tasks(
    projectId: string,
    groupId: string,
    tasks: InjectPhaseTaskInput[],
  ): Promise<string[]> {
    // 1. 校验 project 存在
    const project = await this.prisma.project.findUnique({ where: { id: projectId } });
    if (!project) {
      throw new Error(`Project ${projectId} not found`);
    }

    // 2. 校验 task group 存在
    const group = await this.prisma.taskGroup.findUnique({ where: { group_id: groupId } });
    if (!group) {
      throw new Error(`TaskGroup ${groupId} not found`);
    }

    // 3. Interactive transaction：原子批量创建
    const createdIds = await this.prisma.$transaction(async (tx) => {
      const ids: string[] = [];
      for (const t of tasks) {
        const task = await tx.task.create({
          data: {
            project_id: projectId,
            title: t.title,
            objective: t.objective,
            lane_required: t.lane_required,
            status: 'created',
            task_group_id: group.id,
            payload: t.payload ? JSON.stringify(t.payload) : null,
            payload_schema: t.payload_schema ? JSON.stringify(t.payload_schema) : null,
            acceptance_criteria: t.acceptance_criteria ? JSON.stringify(t.acceptance_criteria) : null,
            reviewer: t.reviewer ?? null,
            acceptance_mode: t.acceptance_mode ?? null,
          },
        });
        ids.push(task.id);
      }
      return ids;
    });

    return createdIds;
  }

  /**
   * spawn_review_task — 从源任务创建 Review 任务
   *
   * 业务场景：任务完成后，PM 可以派生一个 review 任务来审核。
   * 创建 review task + review run 并返回两者 ID。
   *
   * @param projectId    - 项目隔离 ID
   * @param sourceTaskId - 源任务 ID
   * @param reviewer     - 审核人 agent ID
   * @returns SpawnReviewResult
   */
  async spawn_review_task(
    projectId: string,
    sourceTaskId: string,
    reviewer: string,
  ): Promise<SpawnReviewResult> {
    return await this.prisma.$transaction(async (tx) => {
      // 1. 获取源任务（project_id 隔离）
      const sourceTask = await tx.task.findFirst({
        where: { id: sourceTaskId, project_id: projectId },
      });
      if (!sourceTask) {
        throw new Error(`Source task ${sourceTaskId} not found in project ${projectId}`);
      }

      // 2. 创建 review 任务
      const reviewTask = await tx.task.create({
        data: {
          project_id: projectId,
          title: `[Review] ${sourceTask.title}`,
          objective: `Review task ${sourceTaskId}: ${sourceTask.objective}`,
          lane_required: sourceTask.lane_required,
          status: 'dispatched',
          task_group_id: sourceTask.task_group_id,
          payload: JSON.stringify({ source_task_id: sourceTaskId, type: 'review' }),
          reviewer: reviewer,
          acceptance_mode: 'pm_audit',
          acceptance_criteria: JSON.stringify(['Review completed']),
        },
      });

      // 3. 创建 review run（分配给 reviewer agent）
      const reviewRun = await tx.run.create({
        data: {
          task_id: reviewTask.id,
          agent_id: reviewer,
          idempotency_key: `review-${sourceTaskId}-${Date.now()}`,
          status: 'running',
        },
      });

      return {
        review_task_id: reviewTask.id,
        review_run_id: reviewRun.run_id,
      };
    });
  }

  /**
   * get_controller_config — 获取 FSM 控制器配置
   *
   * @param controllerId - 控制器 ID（如 'fsm-task-v1'）
   * @returns ControllerConfig 或 null
   */
  async get_controller_config(controllerId: string): Promise<ControllerConfig | null> {
    const controller = await this.prisma.fSMController.findUnique({
      where: { controller_id: controllerId },
    });

    if (!controller) return null;

    return {
      controller_id: controller.controller_id,
      name: controller.name,
      entity_type: controller.entity_type,
      states: JSON.parse(controller.states_json),
      transitions: JSON.parse(controller.transitions_json),
      initial_state: controller.initial_state,
      config_json: controller.config_json ? JSON.parse(controller.config_json) : {},
    };
  }

  /**
   * list_controllers — 列出所有 FSM 控制器
   *
   * @param entityType - 可选：按 entity_type 过滤
   * @returns ControllerConfig[]
   */
  async list_controllers(entityType?: string): Promise<ControllerConfig[]> {
    const where = entityType ? { entity_type: entityType } : {};
    const controllers = await this.prisma.fSMController.findMany({ where });

    return controllers.map((c) => ({
      controller_id: c.controller_id,
      name: c.name,
      entity_type: c.entity_type,
      states: JSON.parse(c.states_json),
      transitions: JSON.parse(c.transitions_json),
      initial_state: c.initial_state,
      config_json: c.config_json ? JSON.parse(c.config_json) : {},
    }));
  }

  /**
   * update_controller_config — 热更新 FSM 控制器配置
   * 用于审核设置面板实时调整 states / transitions / config_json
   *
   * @param controllerId - 控制器 ID（如 'fsm-task-v1'）
   * @param patch - 需要更新的字段（局部更新）
   * @returns 更新后的 ControllerConfig 或 null（如果不存在）
   */
  async update_controller_config(
    controllerId: string,
    patch: Partial<Pick<ControllerConfig, 'name' | 'states' | 'transitions' | 'initial_state'>> & { config_json?: any },
  ): Promise<ControllerConfig | null> {
    const existing = await this.prisma.fSMController.findUnique({
      where: { controller_id: controllerId },
    });
    if (!existing) return null;

    const data: Record<string, any> = {};
    if (patch.name !== undefined) data.name = patch.name;
    if (patch.states !== undefined) data.states_json = JSON.stringify(patch.states);
    if (patch.transitions !== undefined) data.transitions_json = JSON.stringify(patch.transitions);
    if (patch.initial_state !== undefined) data.initial_state = patch.initial_state;

    // PRD 8.3 & 19.2: Handle config_json field for dynamic review & tuning
    if (patch.config_json !== undefined) {
      data.config_json = typeof patch.config_json === 'string'
        ? patch.config_json
        : JSON.stringify(patch.config_json);
    } else if (Object.keys(patch).some(k => [
      'default_reviewer', 'poll_interval_seconds', 'blueprint_auto_advance',
      'max_concurrent_dispatches', 'retry_max_attempts', 'acceptance_mode', 'reviewer_routing', 'notification_rules'
    ].includes(k))) {
      // Flattened patch from API (T4.1 WebUI)
      const currentConfig = JSON.parse(existing.config_json || '{}');
      const newConfig = { ...currentConfig };
      const configFields = [
        'default_reviewer', 'poll_interval_seconds', 'dispatch_policy',
        'blueprint_auto_advance', 'max_concurrent_dispatches', 'retry_max_attempts',
        'acceptance_mode', 'reviewer_routing', 'notification_rules'
      ];

      configFields.forEach(f => {
        if ((patch as any)[f] !== undefined) {
          newConfig[f] = (patch as any)[f];
        }
      });
      data.config_json = JSON.stringify(newConfig);
    }

    const updated = await this.prisma.fSMController.update({
      where: { controller_id: controllerId },
      data,
    });

    return {
      controller_id: updated.controller_id,
      name: updated.name,
      entity_type: updated.entity_type,
      states: JSON.parse(updated.states_json),
      transitions: JSON.parse(updated.transitions_json),
      initial_state: updated.initial_state,
      config_json: JSON.parse(updated.config_json || '{}'),
    } as any;
  }

  // ═══════════════════════════════════════════════════════════
  //  新增方法 — Group Completion / Closeout / Thaw
  // ═══════════════════════════════════════════════════════════

  /**
   * check_group_completion — 检查 TaskGroup 是否全部完成
   *
   * @param groupId   - TaskGroup.group_id
   * @param projectId - 项目隔离 ID
   * @returns GroupCompletionResult
   */
  async check_group_completion(
    groupId: string,
    projectId: string,
  ): Promise<GroupCompletionResult> {
    const group = await this.prisma.taskGroup.findUnique({
      where: { group_id: groupId },
    });
    if (!group) {
      throw new Error(`TaskGroup ${groupId} not found`);
    }

    // 查询该 group 下属于该 project 的所有任务
    const tasks = await this.prisma.task.findMany({
      where: {
        task_group_id: group.id,
        project_id: projectId,
      },
    });

    const completed = tasks.filter((t) => t.status === 'completed').length;
    const failed = tasks.filter((t) => t.status === 'failed').length;
    const pending = tasks.filter(
      (t) => t.status !== 'completed' && t.status !== 'failed',
    ).length;

    return {
      group_id: groupId,
      total_tasks: tasks.length,
      completed_tasks: completed,
      failed_tasks: failed,
      pending_tasks: pending,
      is_complete: tasks.length > 0 && pending === 0,
    };
  }

  /**
   * closeout_completed_group — 对已完成的 TaskGroup 执行收尾
   *
   * 前置条件：check_group_completion 返回 is_complete = true
   * 操作：将 group 状态置为 'archived'，生成组摘要
   *
   * @param groupId   - TaskGroup.group_id
   * @param projectId - 项目隔离 ID
   * @returns { group, summary } 或 null（如果未满足条件）
   */
  async closeout_completed_group(
    groupId: string,
    projectId: string,
  ): Promise<{ group: any; summary: GroupCompletionResult } | null> {
    const completion = await this.check_group_completion(groupId, projectId);

    if (!completion.is_complete) {
      return null;
    }

    const group = await this.prisma.taskGroup.update({
      where: { group_id: groupId },
      data: { status: 'archived' },
    });

    return { group, summary: completion };
  }

  /**
   * thaw_initial_phase — 解冻初始阶段
   *
   * 业务场景：TaskGroup 创建时所有任务处于 'created' 状态（冻结），
   * PM 确认后调用此方法将第一个阶段（或全部）任务激活为 'dispatched'。
   *
   * @param projectId  - 项目隔离 ID
   * @param groupId    - TaskGroup.group_id
   * @param maxTasks   - 最多激活的任务数（默认激活全部）
   * @returns 被激活的 task ID 列表
   */
  async thaw_initial_phase(
    projectId: string,
    groupId: string,
    maxTasks?: number,
  ): Promise<string[]> {
    const group = await this.prisma.taskGroup.findUnique({
      where: { group_id: groupId },
    });
    if (!group) {
      throw new Error(`TaskGroup ${groupId} not found`);
    }

    return await this.prisma.$transaction(async (tx) => {
      // 查找该 group 下该 project 的 'created' 任务
      const frozenTasks = await tx.task.findMany({
        where: {
          task_group_id: group.id,
          project_id: projectId,
          status: 'created',
        },
        orderBy: { created_at: 'asc' },
        take: maxTasks,
      });

      const thawedIds: string[] = [];
      for (const task of frozenTasks) {
        await tx.task.update({
          where: { id: task.id },
          data: { status: 'dispatched' },
        });
        thawedIds.push(task.id);
      }

      return thawedIds;
    });
  }

  // ═══════════════════════════════════════════════════════════
  //  T3.2: 冷冻库解冻 + 组闭环引擎
  // ═══════════════════════════════════════════════════════════

  /**
   * thaw_next_phase — 从蓝图解冻下一个阶段
   *
   * 业务场景：当一个 TaskGroup 完成并被 archive 后，
   * 从 project 的 blueprint 中找到下一个 phase，创建 TaskGroup 并注入任务。
   *
   * 注入逻辑使用幂等方式（INSERT OR IGNORE 语义）：
   * 如果同名任务已存在于同一 group 中，跳过不重复创建。
   *
   * @param projectId       - 项目隔离 ID
   * @param completedGroupId - 刚完成的 TaskGroup.group_id
   * @returns 创建的 task ID 列表（空 = 已是最后阶段或无蓝图）
   */
  async thaw_next_phase(
    projectId: string,
    completedGroupId: string,
  ): Promise<string[]> {
    // 1. 查找 project 的活跃蓝图
    const blueprints = await this.prisma.projectBlueprint.findMany({
      where: { project_id: projectId, status: 'active' },
      orderBy: { updated_at: 'desc' },
      take: 1,
    });
    if (blueprints.length === 0) return [];

    const blueprint = blueprints[0];
    const schema = JSON.parse(blueprint.schema_json) as {
      phases?: Array<{
        phase_id: string;
        name: string;
        group_id: string;
        tasks?: InjectPhaseTaskInput[];
      }>;
    };

    if (!schema.phases || schema.phases.length === 0) return [];

    // 2. 找到当前 phase 在蓝图中的索引
    const currentIndex = schema.phases.findIndex(
      (p) => p.group_id === completedGroupId,
    );
    if (currentIndex === -1) return []; // 不在蓝图中
    if (currentIndex + 1 >= schema.phases.length) return []; // 已是最后阶段

    const nextPhase = schema.phases[currentIndex + 1];
    if (!nextPhase.tasks || nextPhase.tasks.length === 0) return [];

    // 3. 创建或复用 TaskGroup
    let group = await this.prisma.taskGroup.findUnique({
      where: { group_id: nextPhase.group_id },
    });
    if (!group) {
      group = await this.prisma.taskGroup.create({
        data: {
          group_id: nextPhase.group_id,
          name: nextPhase.name,
          description: `Auto-thawed from phase ${nextPhase.phase_id}`,
        },
      });
    }

    // 4. 幂等注入（INSERT OR IGNORE 语义）
    const injectedIds: string[] = [];
    for (const t of nextPhase.tasks) {
      // 检查是否已存在同名任务（标题 + group 组合去重）
      const existing = await this.prisma.task.findFirst({
        where: {
          project_id: projectId,
          task_group_id: group.id,
          title: t.title,
        },
      });
      if (existing) continue; // IGNORE — 跳过已存在的

      const task = await this.prisma.task.create({
        data: {
          project_id: projectId,
          title: t.title,
          objective: t.objective,
          lane_required: t.lane_required,
          status: 'dispatched', // 解冻即 dispatched
          task_group_id: group.id,
          payload: t.payload ? JSON.stringify(t.payload) : null,
          payload_schema: t.payload_schema ? JSON.stringify(t.payload_schema) : null,
          acceptance_criteria: t.acceptance_criteria
            ? JSON.stringify(t.acceptance_criteria)
            : null,
          reviewer: t.reviewer ?? null,
          acceptance_mode: t.acceptance_mode ?? null,
        },
      });
      injectedIds.push(task.id);
    }

    return injectedIds;
  }

  /**
   * getActiveGroupsForProject — 获取项目下所有活跃的 TaskGroup
   */
  async getActiveGroupsForProject(projectId: string) {
    // 找到 project 下所有 task 的 group，去重
    const tasks = await this.prisma.task.findMany({
      where: { project_id: projectId, task_group_id: { not: null } },
      select: { task_group_id: true },
      distinct: ['task_group_id'],
    });

    const groupIds = tasks.map((t) => t.task_group_id).filter(Boolean) as string[];

    if (groupIds.length === 0) return [];

    return await this.prisma.taskGroup.findMany({
      where: {
        id: { in: groupIds },
        status: 'active',
      },
    });
  }

  /**
   * getBlueprintByProject — 获取项目的活跃蓝图
   */
  async getBlueprintByProject(projectId: string) {
    return await this.prisma.projectBlueprint.findFirst({
      where: { project_id: projectId, status: 'active' },
      orderBy: { updated_at: 'desc' },
    });
  }

  // ═══════════════════════════════════════════════════════════
  //  并发安全测试辅助
  // ═══════════════════════════════════════════════════════════

  /**
   * 并发批量更新 Run 状态 — 用于验证 WAL 模式下无 "database is locked"
   */
  async concurrentUpdateRuns(runIds: string[], status: RunStatus): Promise<number> {
    const results = await Promise.all(
      runIds.map((runId) =>
        this.prisma.run.update({
          where: { run_id: runId },
          data: {
            status,
            ended_at: new Date(),
          },
        }),
      ),
    );
    return results.length;
  }

  // ─── 生命周期 ────────────────────────────────────────────────

  async close(): Promise<void> {
    await this.prisma.$disconnect();
    if (PrismaDAL._instance === this) {
      PrismaDAL._instance = null;
    }
  }

  /** 获取底层 PrismaClient（仅供高级用途 / 测试） */
  get client(): PrismaClient {
    return this.prisma;
  }
}

export default PrismaDAL;
