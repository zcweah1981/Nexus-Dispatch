/**
 * T3.2: 冷冻库解冻 + 组闭环引擎 — TDD 测试套件
 * Task: nd-v75-t32 | Agent: long-coder-1
 *
 * 11 条测试覆盖：
 *   1. check_group_completion: 无任务时返回 is_complete=false
 *   2. check_group_completion: 全部 completed 时返回 is_complete=true
 *   3. check_group_completion: 部分完成时返回 is_complete=false
 *   4. check_group_completion: 包含 failed 也视为 terminal → is_complete=true
 *   5. closeout_completed_group: 未全部完成时返回 null
 *   6. closeout_completed_group: 全部完成后 archive + 返回 summary
 *   7. thaw_next_phase: 从蓝图解冻下一阶段并注入任务
 *   8. thaw_next_phase: 已是最后阶段时返回空
 *   9. thaw_next_phase: 无蓝图时返回空
 *  10. thaw_next_phase: 幂等注入 — 重复调用不产生重复任务
 *  11. FreezerEngine.run_once: 完整闭环（check → closeout → thaw）
 *
 * 验收标准：
 *   - check_group_completion(): 检查当前 group 所有 task 是否 completed
 *   - closeout_completed_group(): 标记 group archived + 触发总结
 *   - thaw_next_phase(): 从 blueprint 取下一 phase + inject 到 tasks 队列
 *   - run_once 集成: tick 末尾调用上述三步
 *   - INSERT OR IGNORE 幂等注入
 *   - TDD: 11 条 freezer 测试全部通过
 */

import { PrismaDAL } from '../src/db/prisma_dal';
import { FreezerEngine } from '../src/engine/freezer';
import { v4 as uuidv4 } from 'uuid';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { execSync } from 'child_process';

// 创建独立的测试数据库：只从 checked-in Prisma schema 初始化，不复制本地/生产 DB。
let TEST_DB_TEMP_DIR: string | undefined;
let TEST_DB_PATH: string | undefined;

function createTestDbUrl(): string {
  TEST_DB_TEMP_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-freezer-'));
  TEST_DB_PATH = path.join(TEST_DB_TEMP_DIR, 'test.db');
  const dbUrl = `file:${TEST_DB_PATH}`;
  execSync('npx prisma db push --skip-generate --accept-data-loss', {
    cwd: path.join(__dirname, '..'),
    env: { ...process.env, DATABASE_URL: dbUrl },
    stdio: 'pipe',
  });
  return dbUrl;
}

describe('T3.2: Freezer Engine — 冷冻库解冻 + 组闭环', () => {
  let dal: PrismaDAL;
  let freezerEngine: FreezerEngine;
  let projectId: string;
  let agentId: string;
  let dbUrl: string;

  // 种子数据 IDs（跨 test 共享引用）
  let groupP1Id: string;
  let groupP2Id: string;
  let blueprintId: string;

  beforeAll(async () => {
    dbUrl = createTestDbUrl();
    dal = new PrismaDAL(dbUrl);
    await dal.initPragmas();
    freezerEngine = new FreezerEngine(dal);

    projectId = uuidv4();
    agentId = uuidv4();
    groupP1Id = `test-p1-${uuidv4().slice(0, 8)}`;
    groupP2Id = `test-p2-${uuidv4().slice(0, 8)}`;
    blueprintId = `bp-test-${uuidv4().slice(0, 8)}`;

    // 创建 project + agent
    await dal._createProjectAndAgent(projectId, agentId);

    // 创建两个 TaskGroup
    await dal.createTaskGroup({
      group_id: groupP1Id,
      name: 'Phase 1: 规范建制',
      description: 'Test phase 1',
    });
    await dal.createTaskGroup({
      group_id: groupP2Id,
      name: 'Phase 2: 中枢启动',
      description: 'Test phase 2',
    });

    // 创建 blueprint（两阶段蓝图）
    const schemaJson = JSON.stringify({
      phases: [
        {
          phase_id: 'p1',
          name: 'Phase 1: 规范建制',
          group_id: groupP1Id,
          tasks: [
            {
              title: 'T1.1: PRD 规范',
              objective: '制定 PRD 白皮书',
              lane_required: 'DEV',
              acceptance_criteria: ['PRD 完成'],
              reviewer: 'pm-orchestrator-1',
              acceptance_mode: 'pm_audit',
            },
            {
              title: 'T1.2: 数据库设计',
              objective: '设计数据库 Schema',
              lane_required: 'DEV',
            },
          ],
        },
        {
          phase_id: 'p2',
          name: 'Phase 2: 中枢启动',
          group_id: groupP2Id,
          tasks: [
            {
              title: 'T2.1: Daemon 开发',
              objective: '开发 PM Daemon',
              lane_required: 'DEV',
            },
            {
              title: 'T2.2: DAG 引擎',
              objective: 'DAG 拓扑引擎',
              lane_required: 'DEV',
            },
          ],
        },
      ],
    });

    await dal.createBlueprint({
      project_id: projectId,
      blueprint_id: blueprintId,
      name: 'Test Blueprint',
      version: '1.0',
      schema_json: schemaJson,
    });

    // 激活 blueprint
    await (dal as any).prisma.projectBlueprint.update({
      where: { blueprint_id: blueprintId },
      data: { status: 'active' },
    });
  });

  afterAll(async () => {
    await dal.close();
    if (TEST_DB_TEMP_DIR) {
      try { fs.rmSync(TEST_DB_TEMP_DIR, { recursive: true, force: true }); } catch {}
    }
  });

  // ─── Helper: 注入任务到 group ──────────────────────────────

  async function injectTasks(
    groupId: string,
    count: number,
    status: string = 'completed',
  ) {
    const group = await dal.getTaskGroup(groupId);
    if (!group) throw new Error(`Group ${groupId} not found`);
    const ids: string[] = [];
    for (let i = 0; i < count; i++) {
      const task = await dal.createTask({
        project_id: projectId,
        title: `Auto Task ${i + 1} for ${groupId}`,
        objective: `Auto objective ${i + 1}`,
        lane_required: 'DEV',
        status,
        task_group_id: group.id,
      });
      ids.push(task.id);
    }
    return ids;
  }

  // ═══════════════════════════════════════════════════════════
  //  Test 1-4: check_group_completion
  // ═══════════════════════════════════════════════════════════

  it('1. check_group_completion: 无任务时返回 is_complete=false', async () => {
    const emptyGroupId = `empty-${uuidv4().slice(0, 8)}`;
    await dal.createTaskGroup({
      group_id: emptyGroupId,
      name: 'Empty Group',
    });

    const result = await freezerEngine.check_group_completion(
      emptyGroupId,
      projectId,
    );
    expect(result.is_complete).toBe(false);
    expect(result.total_tasks).toBe(0);
  });

  it('2. check_group_completion: 全部 completed 时返回 is_complete=true', async () => {
    const ids = await injectTasks(groupP1Id, 2, 'completed');

    const result = await freezerEngine.check_group_completion(
      groupP1Id,
      projectId,
    );
    expect(result.is_complete).toBe(true);
    expect(result.completed_tasks).toBe(2);
    expect(result.pending_tasks).toBe(0);

    // 清理: 删除注入的 tasks 以免影响后续测试
    for (const id of ids) {
      await (dal as any).prisma.task.delete({ where: { id } });
    }
  });

  it('3. check_group_completion: 部分完成时返回 is_complete=false', async () => {
    // 注入一个 completed 和一个 dispatched
    const group = await dal.getTaskGroup(groupP1Id);
    await dal.createTask({
      project_id: projectId,
      title: 'Partial Task 1',
      objective: 'Completed task',
      lane_required: 'DEV',
      status: 'completed',
      task_group_id: group!.id,
    });
    await dal.createTask({
      project_id: projectId,
      title: 'Partial Task 2',
      objective: 'Dispatched task',
      lane_required: 'DEV',
      status: 'dispatched',
      task_group_id: group!.id,
    });

    const result = await freezerEngine.check_group_completion(
      groupP1Id,
      projectId,
    );
    expect(result.is_complete).toBe(false);
    expect(result.pending_tasks).toBe(1); // dispatched = pending
  });

  it('4. check_group_completion: 包含 failed 也视为 terminal → is_complete=true', async () => {
    // 补上缺失的 task（将 dispatched 改为 failed）
    const group = await dal.getTaskGroup(groupP1Id);
    const pendingTasks = await (dal as any).prisma.task.findMany({
      where: {
        task_group_id: group!.id,
        project_id: projectId,
        status: 'dispatched',
      },
    });
    for (const t of pendingTasks) {
      await dal.updateTaskStatus(t.id, 'failed');
    }

    const result = await freezerEngine.check_group_completion(
      groupP1Id,
      projectId,
    );
    // completed + failed 都算 terminal → is_complete=true
    expect(result.is_complete).toBe(true);
    expect(result.failed_tasks).toBeGreaterThanOrEqual(1);
  });

  // ═══════════════════════════════════════════════════════════
  //  Test 5-6: closeout_completed_group
  // ═══════════════════════════════════════════════════════════

  it('5. closeout_completed_group: 未全部完成时返回 null', async () => {
    // groupP2 还没有任务 → is_complete=false
    const result = await freezerEngine.closeout_completed_group(
      groupP2Id,
      projectId,
    );
    expect(result).toBeNull();
  });

  it('6. closeout_completed_group: 全部完成后 archive + 返回 summary', async () => {
    // groupP1 全部 terminal (completed + failed)
    const result = await freezerEngine.closeout_completed_group(
      groupP1Id,
      projectId,
    );

    expect(result).not.toBeNull();
    expect(result!.group.status).toBe('archived');
    expect(result!.summary).toBeDefined();
    expect(result!.summary.is_complete).toBe(true);
    expect(result!.summary.group_id).toBe(groupP1Id);
  });

  // ═══════════════════════════════════════════════════════════
  //  Test 7-10: thaw_next_phase
  // ═══════════════════════════════════════════════════════════

  it('7. thaw_next_phase: 从蓝图解冻下一阶段并注入任务', async () => {
    const injectedIds = await freezerEngine.thaw_next_phase(
      projectId,
      groupP1Id,
    );

    expect(injectedIds.length).toBe(2); // phase 2 有 2 个任务

    // 验证任务已被创建
    for (const id of injectedIds) {
      const task = await dal.getTask(id);
      expect(task).not.toBeNull();
      expect(task!.status).toBe('dispatched'); // 解冻即 dispatched
    }

    // 验证 groupP2 的 TaskGroup 已被创建（如果之前没创建的话，是复用）
    const p2Group = await dal.getTaskGroup(groupP2Id);
    expect(p2Group).not.toBeNull();
  });

  it('8. thaw_next_phase: 已是最后阶段时返回空', async () => {
    // groupP2 是最后一个 phase → thaw 应返回空
    const injectedIds = await freezerEngine.thaw_next_phase(
      projectId,
      groupP2Id,
    );
    expect(injectedIds).toEqual([]);
  });

  it('9. thaw_next_phase: 无蓝图时返回空', async () => {
    const orphanProjectId = uuidv4();
    await (dal as any).prisma.project.create({
      data: { id: orphanProjectId, name: `Orphan ${orphanProjectId}` },
    });

    const injectedIds = await freezerEngine.thaw_next_phase(
      orphanProjectId,
      'non-existent-group',
    );
    expect(injectedIds).toEqual([]);
  });

  it('10. thaw_next_phase: 幂等注入 — 重复调用不产生重复任务', async () => {
    // 再次对 groupP1 调用 thaw → phase 2 的任务已存在，不应重复创建
    const firstCall = await freezerEngine.thaw_next_phase(
      projectId,
      groupP1Id,
    );
    const secondCall = await freezerEngine.thaw_next_phase(
      projectId,
      groupP1Id,
    );

    // 第二次调用应该返回空（所有任务已存在）
    expect(secondCall).toEqual([]);
    expect(firstCall).toEqual([]); // 第一次也应该是空了（因为 test 7 已创建）

    // 确认 groupP2 下只有 2 个任务（没有重复）
    const p2Group = await dal.getTaskGroup(groupP2Id);
    const p2Tasks = await (dal as any).prisma.task.findMany({
      where: { task_group_id: p2Group!.id, project_id: projectId },
    });
    expect(p2Tasks.length).toBe(2); // 没有超过蓝图定义的数量
  });

  // ═══════════════════════════════════════════════════════════
  //  Test 11: FreezerEngine.run_once 完整闭环
  // ═══════════════════════════════════════════════════════════

  it('11. FreezerEngine.run_once: 完整闭环（check → closeout → thaw）', async () => {
    // 准备一个新的 project 来演示完整闭环
    const loopProjectId = uuidv4();
    const loopAgentId = uuidv4();
    const loopP1Group = `loop-p1-${uuidv4().slice(0, 8)}`;
    const loopP2Group = `loop-p2-${uuidv4().slice(0, 8)}`;
    const loopBlueprint = `bp-loop-${uuidv4().slice(0, 8)}`;

    await dal._createProjectAndAgent(loopProjectId, loopAgentId);

    // 创建两个 group
    await dal.createTaskGroup({
      group_id: loopP1Group,
      name: 'Loop Phase 1',
    });
    await dal.createTaskGroup({
      group_id: loopP2Group,
      name: 'Loop Phase 2',
    });

    // P1 注入任务并标记完成
    const p1Group = await dal.getTaskGroup(loopP1Group);
    await dal.createTask({
      project_id: loopProjectId,
      title: 'Loop Task 1',
      objective: 'Done',
      lane_required: 'DEV',
      status: 'completed',
      task_group_id: p1Group!.id,
    });

    // 创建 blueprint
    await dal.createBlueprint({
      project_id: loopProjectId,
      blueprint_id: loopBlueprint,
      name: 'Loop Blueprint',
      version: '1.0',
      schema_json: JSON.stringify({
        phases: [
          {
            phase_id: 'lp1',
            name: 'Loop Phase 1',
            group_id: loopP1Group,
            tasks: [],
          },
          {
            phase_id: 'lp2',
            name: 'Loop Phase 2',
            group_id: loopP2Group,
            tasks: [
              {
                title: 'Loop Next Task',
                objective: 'Auto thawed',
                lane_required: 'DEV',
              },
            ],
          },
        ],
      }),
    });

    // 激活 blueprint
    await (dal as any).prisma.projectBlueprint.update({
      where: { blueprint_id: loopBlueprint },
      data: { status: 'active' },
    });

    // 执行 run_once
    const result = await freezerEngine.run_once(loopProjectId);

    // 验证结果
    expect(result.groups_checked).toBeGreaterThanOrEqual(1);
    expect(result.groups_archived).toContain(loopP1Group);
    expect(result.errors).toEqual([]);

    // 验证 P2 的任务被注入
    const p2Group = await dal.getTaskGroup(loopP2Group);
    const p2Tasks = await (dal as any).prisma.task.findMany({
      where: { task_group_id: p2Group!.id, project_id: loopProjectId },
    });
    expect(p2Tasks.length).toBe(1);
    expect(p2Tasks[0].title).toBe('Loop Next Task');
    expect(p2Tasks[0].status).toBe('dispatched');

    // P1 group 应该是 archived
    const archivedP1 = await dal.getTaskGroup(loopP1Group);
    expect(archivedP1!.status).toBe('archived');
  });
});
