/**
 * Nexus Dispatch System — 动态审核派单引擎 (Dynamic Review Dispatch Engine)
 * Task: nd-v75-t33 | Agent: long-coder-1
 *
 * 核心职责：
 *   1. evaluate_task()      — 按 acceptance_mode 分流
 *   2. _spawn_review_task() — pm_audit 模式下创建 review task
 *   3. _resolve_default_reviewer() — 三级路由 (task → FSM → fallback)
 *   4. accept_review()      — 审核通过 → completed
 *   5. reject_review()      — 审核驳回 → failed / retry_ready
 *
 * 通知红线：API 层仅更新 DB + 发射 SSE 事件，不发送任何通知。
 * 通知由被派 Agent 自己的 bot 发送到群组。
 */

import { PrismaDAL, SpawnReviewResult } from '../db/prisma_dal';

// ─── Types ──────────────────────────────────────────────────────

export interface EvaluateResult {
  review_spawned: boolean;
  review_task_id?: string;
  review_run_id?: string;
  new_status: string;
}

export interface ReviewActionResult {
  task_id: string;
  status: string;
  proof_data: Record<string, unknown>;
  retry_count?: number;
}

// ─── Engine Class ───────────────────────────────────────────────

export class ReviewEngine {
  constructor(private prismaDal: PrismaDAL) {}

  /**
   * evaluate_task — 按 acceptance_mode 分流
   *
   * 在 submit_proof 成功后调用：
   *   - pm_audit    → 创建 review task，原任务 → review_spawned
   *   - 其他模式     → 原任务直接 → completed
   *
   * @param taskId    - 任务 ID
   * @param projectId - 项目 ID（隔离）
   * @returns EvaluateResult
   */
  async evaluate_task(taskId: string, projectId: string): Promise<EvaluateResult> {
    const task = await this.prismaDal.getTaskInProject(taskId, projectId);
    if (!task) {
      throw new Error(`Task ${taskId} not found in project ${projectId}`);
    }

    const mode = task.acceptance_mode;

    if (mode === 'pm_audit') {
      // pm_audit: 创建 review task
      const reviewer = await this._resolve_default_reviewer(task);
      const spawnResult = await this._spawn_review_task(projectId, taskId, reviewer);

      // 原任务 → review_spawned
      await this.prismaDal.updateTaskStatus(taskId, 'review_spawned');

      return {
        review_spawned: true,
        review_task_id: spawnResult.review_task_id,
        review_run_id: spawnResult.review_run_id,
        new_status: 'review_spawned',
      };
    }

    // auto_verify / manual / 其他：直接完成
    await this.prismaDal.updateTaskStatus(taskId, 'completed');

    return {
      review_spawned: false,
      new_status: 'completed',
    };
  }

  /**
   * _spawn_review_task — 从源任务创建 Review 任务
   * 委托给 PrismaDAL.spawn_review_task()
   */
  async _spawn_review_task(
    projectId: string,
    sourceTaskId: string,
    reviewer: string,
  ): Promise<SpawnReviewResult> {
    return await this.prismaDal.spawn_review_task(projectId, sourceTaskId, reviewer);
  }

  /**
   * _resolve_default_reviewer — 三级路由
   *
   * Level 1: task.reviewer (任务级显式指定)
   * Level 2: FSM controller default_reviewer (控制器级默认)
   * Level 3: 'pm-orchestrator-1' (系统级硬编码)
   */
  async _resolve_default_reviewer(task: { reviewer?: string | null; project_id: string }): Promise<string> {
    // Level 1: task-level
    if (task.reviewer) {
      return task.reviewer;
    }

    // Level 2: FSM controller default_reviewer
    try {
      const controller = await this.prismaDal.get_controller_config('fsm-task-v1');
      if (controller) {
        // Read config_json from raw record (controller config stores dynamic settings)
        const rawController = await (this.prismaDal as any).prisma.fSMController.findUnique({
          where: { controller_id: 'fsm-task-v1' },
        });
        if (rawController?.config_json) {
          const config = JSON.parse(rawController.config_json);
          if (config.default_reviewer) {
            return config.default_reviewer;
          }
        }
      }
    } catch {
      // Controller not found or parse error → fall through
    }

    // Level 3: system fallback
    return 'pm-orchestrator-1';
  }

  /**
   * accept_review — 审核通过
   *
   * Preconditions:
   *   - Task must be in 'review_spawned' or 'validating' status
   *
   * Behavior:
   *   - Transition task → 'completed'
   *   - Store acceptance metadata in proof_data
   */
  async accept_review(
    taskId: string,
    reviewerId: string,
    note?: string,
  ): Promise<ReviewActionResult> {
    const task = await this.prismaDal.getTask(taskId);
    if (!task) {
      throw new Error(`Task ${taskId} not found`);
    }

    if (task.status !== 'review_spawned' && task.status !== 'validating') {
      throw new Error(`INVALID_STATE: Task is in '${task.status}' state, expected 'review_spawned' or 'validating'`);
    }

    const proofData: Record<string, unknown> = {
      accepted: true,
      reviewer_id: reviewerId,
      timestamp: new Date().toISOString(),
    };
    if (note) proofData.note = note;

    const updated = await this.prismaDal.updateTaskWithProof(taskId, 'completed', proofData);

    return {
      task_id: taskId,
      status: 'completed',
      proof_data: proofData,
    };
  }

  /**
   * reject_review — 审核驳回
   *
   * Preconditions:
   *   - Task must be in 'review_spawned' or 'validating' status
   *
   * Behavior:
   *   - If retry_count < max_retries → task back to 'created' (retry_ready)
   *   - If retry_count >= max_retries → task → 'failed' (permanent fail)
   *   - Store rejection reason in proof_data
   */
  async reject_review(
    taskId: string,
    reviewerId: string,
    reason: string,
  ): Promise<ReviewActionResult> {
    const task = await this.prismaDal.getTask(taskId);
    if (!task) {
      throw new Error(`Task ${taskId} not found`);
    }

    if (task.status !== 'review_spawned' && task.status !== 'validating') {
      throw new Error(`INVALID_STATE: Task is in '${task.status}' state, expected 'review_spawned' or 'validating'`);
    }

    const newRetryCount = (task.retry_count || 0) + 1;
    const canRetry = newRetryCount < (task.max_retries || 0);

    const proofData: Record<string, unknown> = {
      accepted: false,
      reviewer_id: reviewerId,
      reason,
      retry_count: newRetryCount,
      timestamp: new Date().toISOString(),
    };

    // retry_ready: 任务回到 created 状态，等待重新派发
    // permanent fail: 任务标记为 failed
    const newStatus = canRetry ? 'created' : 'failed';

    const updated = await this.prismaDal.updateTaskWithProof(
      taskId,
      newStatus,
      proofData,
      { retry_count: newRetryCount },
    );

    return {
      task_id: taskId,
      status: newStatus,
      proof_data: proofData,
      retry_count: newRetryCount,
    };
  }
}
