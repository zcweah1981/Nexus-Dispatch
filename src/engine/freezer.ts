/**
 * Nexus Dispatch System — Freezer Engine (冷冻库解冻 + 组闭环引擎)
 * Task: nd-v75-t32 | Agent: long-coder-1
 *
 * 职责：
 *   1. check_group_completion  — 检查 group 所有 task 是否 completed
 *   2. closeout_completed_group — 标记 group archived + 触发总结
 *   3. thaw_next_phase         — 从 blueprint 取下一 phase + inject 到 tasks 队列
 *   4. run_once                — tick 末尾调用上述三步
 *
 * 设计原则：
 *   - 全部通过 PrismaDAL 操作，严禁 raw SQL
 *   - INSERT OR IGNORE 幂等注入（通过 findFirst 去重）
 *   - 通知由被派 Agent 自己的 bot 发送到群组，本引擎不负责通知
 */

import { PrismaDAL } from '../db/prisma_dal';

export interface FreezerRunOnceResult {
  /** 被检查的活跃 group 数量 */
  groups_checked: number;
  /** 被归档的 group 列表 */
  groups_archived: string[];
  /** 被解冻注入的 task ID 列表（按 group 分组） */
  tasks_injected: Record<string, string[]>;
  /** 执行中的错误 */
  errors: string[];
}

export class FreezerEngine {
  private dal: PrismaDAL;

  constructor(dal: PrismaDAL) {
    this.dal = dal;
  }

  /**
   * check_group_completion — 检查 TaskGroup 是否全部完成
   *
   * 直接委托给 PrismaDAL.check_group_completion
   */
  async check_group_completion(groupId: string, projectId: string) {
    return await this.dal.check_group_completion(groupId, projectId);
  }

  /**
   * closeout_completed_group — 标记 group archived + 触发总结
   *
   * 直接委托给 PrismaDAL.closeout_completed_group
   * 返回值包含 group 信息和 summary，供调用方记录日志
   */
  async closeout_completed_group(groupId: string, projectId: string) {
    return await this.dal.closeout_completed_group(groupId, projectId);
  }

  /**
   * thaw_next_phase — 从 blueprint 取下一 phase + inject 到 tasks 队列
   *
   * 直接委托给 PrismaDAL.thaw_next_phase
   */
  async thaw_next_phase(projectId: string, completedGroupId: string) {
    return await this.dal.thaw_next_phase(projectId, completedGroupId);
  }

  /**
   * run_once — 单次 tick 闭环执行
   *
   * 流程：
   *   1. 获取项目下所有 active 的 TaskGroup
   *   2. 对每个 active group 检查是否全部完成
   *   3. 如果完成 → closeout (archive + summary)
   *   4. closeout 后 → thaw_next_phase (从蓝图注入下一阶段任务)
   *
   * @param projectId - 要检查的项目 ID
   * @returns FreezerRunOnceResult
   */
  async run_once(projectId: string): Promise<FreezerRunOnceResult> {
    const result: FreezerRunOnceResult = {
      groups_checked: 0,
      groups_archived: [],
      tasks_injected: {},
      errors: [],
    };

    try {
      // 1. 获取所有活跃 group
      const activeGroups = await this.dal.getActiveGroupsForProject(projectId);
      result.groups_checked = activeGroups.length;

      for (const group of activeGroups) {
        try {
          // 2. 检查完成状态
          const completion = await this.dal.check_group_completion(
            group.group_id,
            projectId,
          );

          if (!completion.is_complete) {
            continue; // 尚未全部完成，跳过
          }

          // 3. Closeout: archive + summary
          const closeoutResult = await this.dal.closeout_completed_group(
            group.group_id,
            projectId,
          );

          if (closeoutResult) {
            result.groups_archived.push(group.group_id);

            // 4. Thaw next phase from blueprint
            const injectedIds = await this.dal.thaw_next_phase(
              projectId,
              group.group_id,
            );

            if (injectedIds.length > 0) {
              // 找到新 phase 的 group_id（通过注入的第一个 task 关联）
              result.tasks_injected[group.group_id] = injectedIds;
            }
          }
        } catch (err: any) {
          result.errors.push(
            `Group ${group.group_id}: ${err.message || String(err)}`,
          );
        }
      }
    } catch (err: any) {
      result.errors.push(`Fatal: ${err.message || String(err)}`);
    }

    return result;
  }
}

export default FreezerEngine;
