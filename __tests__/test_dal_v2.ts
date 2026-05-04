/**
 * DAL v2 Test Suite — test_dal_v2.ts
 * Task: nd-v75-t12 | Agent: long-coder-1
 *
 * 覆盖范围：
 *   - inject_phase_tasks
 *   - spawn_review_task
 *   - get_controller_config
 *   - check_group_completion
 *   - closeout_completed_group
 *   - thaw_initial_phase
 *   - project_id 分区隔离验证
 *   - 并发写入无 database is locked
 */

import { PrismaDAL } from '../src/db/prisma_dal';
import { v4 as uuidv4 } from 'uuid';

// 使用独立的测试数据库，避免污染生产数据
process.env.DATABASE_URL = 'file:./data/test_dal_v2.db';

describe('DAL v2 — Prisma ORM (API-only)', () => {
  let dal: PrismaDAL;

  beforeAll(async () => {
    dal = new PrismaDAL();
    await dal.initPragmas();
  });

  afterAll(async () => {
    await dal.close();
  });

  // ─── 每个测试前清理测试数据 ─────────────────────────────────
  beforeEach(async () => {
    // 按依赖顺序清理（子表 → 父表）
    const client = dal.client;
    await client.artifact.deleteMany();
    await client.run.deleteMany();
    await client.taskDependency.deleteMany();
    await client.task.deleteMany();
    await client.taskGroup.deleteMany();
    await client.fSMController.deleteMany();
    await client.projectBlueprint.deleteMany();
    await client.agent.deleteMany();
    await client.project.deleteMany();
  });

  // ═════════════════════════════════════════════════════════════
  //  Helper: 创建测试基础数据
  // ═════════════════════════════════════════════════════════════

  async function seedBase(projectId?: string, agentId?: string) {
    const pid = projectId ?? uuidv4();
    const aid = agentId ?? uuidv4();
    await dal._createProjectAndAgent(pid, aid);
    return { projectId: pid, agentId: aid };
  }

  async function seedTaskGroup(groupId?: string) {
    const gid = groupId ?? `tg-${uuidv4().slice(0, 8)}`;
    const group = await dal.createTaskGroup({
      group_id: gid,
      name: `Test Group ${gid}`,
      description: 'Test description',
    });
    return { groupId: gid, groupDbId: group.id };
  }

  async function seedFSMController(controllerId?: string) {
    const cid = controllerId ?? `fsm-${uuidv4().slice(0, 8)}`;
    await dal.client.fSMController.create({
      data: {
        controller_id: cid,
        name: `Test FSM ${cid}`,
        entity_type: 'task',
        states_json: JSON.stringify(['created', 'dispatched', 'completed', 'failed']),
        transitions_json: JSON.stringify([
          { from: 'created', to: 'dispatched' },
          { from: 'dispatched', to: 'completed' },
          { from: 'dispatched', to: 'failed' },
        ]),
        initial_state: 'created',
      },
    });
    return cid;
  }

  // ═════════════════════════════════════════════════════════════
  //  1. inject_phase_tasks 测试
  // ═════════════════════════════════════════════════════════════

  describe('inject_phase_tasks', () => {
    it('should batch create tasks under a task group with project_id isolation', async () => {
      const { projectId } = await seedBase();
      const { groupId } = await seedTaskGroup();

      const taskInputs = [
        {
          title: 'Task A',
          objective: 'Objective A',
          lane_required: 'DEV',
          acceptance_criteria: ['AC1', 'AC2'],
        },
        {
          title: 'Task B',
          objective: 'Objective B',
          lane_required: 'DESIGN',
          payload: { key: 'value' },
        },
        {
          title: 'Task C',
          objective: 'Objective C',
          lane_required: 'OPS',
          reviewer: 'pm-orchestrator-1',
          acceptance_mode: 'pm_audit',
        },
      ];

      const ids = await dal.inject_phase_tasks(projectId, groupId, taskInputs);

      expect(ids).toHaveLength(3);
      expect(ids[0]).toBeDefined();

      // 验证每个 task 都正确创建
      for (let i = 0; i < ids.length; i++) {
        const task = await dal.getTask(ids[i]);
        expect(task).toBeDefined();
        expect(task!.project_id).toBe(projectId);
        expect(task!.title).toBe(taskInputs[i].title);
        expect(task!.status).toBe('created');
      }

      // 验证 project_id 隔离：另一 project 查不到
      const { projectId: otherProjectId } = await seedBase();
      const taskInOther = await dal.getTaskInProject(ids[0], otherProjectId);
      expect(taskInOther).toBeNull();
    });

    it('should reject if project does not exist', async () => {
      const { groupId } = await seedTaskGroup();
      await expect(
        dal.inject_phase_tasks('nonexistent-project', groupId, [
          { title: 'X', objective: 'X', lane_required: 'DEV' },
        ]),
      ).rejects.toThrow('not found');
    });

    it('should reject if task group does not exist', async () => {
      const { projectId } = await seedBase();
      await expect(
        dal.inject_phase_tasks(projectId, 'nonexistent-group', [
          { title: 'X', objective: 'X', lane_required: 'DEV' },
        ]),
      ).rejects.toThrow('not found');
    });

    it('should handle empty task array', async () => {
      const { projectId } = await seedBase();
      const { groupId } = await seedTaskGroup();
      const ids = await dal.inject_phase_tasks(projectId, groupId, []);
      expect(ids).toHaveLength(0);
    });
  });

  // ═════════════════════════════════════════════════════════════
  //  2. spawn_review_task 测试
  // ═════════════════════════════════════════════════════════════

  describe('spawn_review_task', () => {
    it('should create a review task and run for a source task', async () => {
      const { projectId, agentId } = await seedBase();

      // 创建源任务
      const sourceTask = await dal.createTask({
        id: uuidv4(),
        project_id: projectId,
        title: 'Source Task',
        objective: 'Do something',
        lane_required: 'DEV',
        status: 'completed',
      });

      // 创建 reviewer agent
      const reviewerId = uuidv4();
      await dal._createProjectAndAgent(projectId, reviewerId);

      const result = await dal.spawn_review_task(projectId, sourceTask.id, reviewerId);

      expect(result.review_task_id).toBeDefined();
      expect(result.review_run_id).toBeDefined();

      // 验证 review task 属性
      const reviewTask = await dal.getTask(result.review_task_id);
      expect(reviewTask).toBeDefined();
      expect(reviewTask!.title).toContain('[Review]');
      expect(reviewTask!.project_id).toBe(projectId);
      expect(reviewTask!.reviewer).toBe(reviewerId);
      expect(reviewTask!.acceptance_mode).toBe('pm_audit');
      expect(reviewTask!.status).toBe('dispatched');

      // 验证 review run 属性
      const reviewRun = await dal.getRun(result.review_run_id);
      expect(reviewRun).toBeDefined();
      expect(reviewRun!.agent_id).toBe(reviewerId);
      expect(reviewRun!.status).toBe('running');
    });

    it('should reject if source task not in project (isolation check)', async () => {
      const { projectId: proj1, agentId } = await seedBase();
      const { projectId: proj2 } = await seedBase();

      const sourceTask = await dal.createTask({
        id: uuidv4(),
        project_id: proj1,
        title: 'Source in proj1',
        objective: 'Test isolation',
        lane_required: 'DEV',
      });

      await expect(
        dal.spawn_review_task(proj2, sourceTask.id, agentId),
      ).rejects.toThrow('not found in project');
    });
  });

  // ═════════════════════════════════════════════════════════════
  //  3. get_controller_config 测试
  // ═════════════════════════════════════════════════════════════

  describe('get_controller_config', () => {
    it('should return parsed FSM controller config', async () => {
      const controllerId = await seedFSMController();
      const config = await dal.get_controller_config(controllerId);

      expect(config).toBeDefined();
      expect(config!.controller_id).toBe(controllerId);
      expect(config!.entity_type).toBe('task');
      expect(config!.initial_state).toBe('created');
      expect(Array.isArray(config!.states)).toBe(true);
      expect(config!.states).toHaveLength(4);
      expect(Array.isArray(config!.transitions)).toBe(true);
      expect(config!.transitions).toHaveLength(3);
    });

    it('should return null for non-existent controller', async () => {
      const config = await dal.get_controller_config('nonexistent-fsm');
      expect(config).toBeNull();
    });
  });

  // ═════════════════════════════════════════════════════════════
  //  4. check_group_completion 测试
  // ═════════════════════════════════════════════════════════════

  describe('check_group_completion', () => {
    it('should report correct completion status', async () => {
      const { projectId } = await seedBase();
      const { groupId } = await seedTaskGroup();

      // 注入 3 个任务
      const ids = await dal.inject_phase_tasks(projectId, groupId, [
        { title: 'T1', objective: 'O1', lane_required: 'DEV' },
        { title: 'T2', objective: 'O2', lane_required: 'DEV' },
        { title: 'T3', objective: 'O3', lane_required: 'DEV' },
      ]);

      // 全部 created → 不完成
      let result = await dal.check_group_completion(groupId, projectId);
      expect(result.total_tasks).toBe(3);
      expect(result.pending_tasks).toBe(3);
      expect(result.is_complete).toBe(false);

      // 完成 2 个
      await dal.updateTaskStatus(ids[0], 'completed', projectId);
      await dal.updateTaskStatus(ids[1], 'completed', projectId);

      result = await dal.check_group_completion(groupId, projectId);
      expect(result.completed_tasks).toBe(2);
      expect(result.pending_tasks).toBe(1);
      expect(result.is_complete).toBe(false);

      // 完成最后一个
      await dal.updateTaskStatus(ids[2], 'completed', projectId);

      result = await dal.check_group_completion(groupId, projectId);
      expect(result.completed_tasks).toBe(3);
      expect(result.pending_tasks).toBe(0);
      expect(result.is_complete).toBe(true);
    });

    it('should count failed tasks as non-pending (complete)', async () => {
      const { projectId } = await seedBase();
      const { groupId } = await seedTaskGroup();

      const ids = await dal.inject_phase_tasks(projectId, groupId, [
        { title: 'T1', objective: 'O1', lane_required: 'DEV' },
        { title: 'T2', objective: 'O2', lane_required: 'DEV' },
      ]);

      await dal.updateTaskStatus(ids[0], 'completed', projectId);
      await dal.updateTaskStatus(ids[1], 'failed', projectId);

      const result = await dal.check_group_completion(groupId, projectId);
      expect(result.completed_tasks).toBe(1);
      expect(result.failed_tasks).toBe(1);
      expect(result.pending_tasks).toBe(0);
      expect(result.is_complete).toBe(true);
    });

    it('should isolate by project_id — not count tasks from other projects', async () => {
      const { projectId: proj1 } = await seedBase();
      const { projectId: proj2 } = await seedBase();
      const { groupId } = await seedTaskGroup();

      // 两个 project 各注入任务到同一个 group
      await dal.inject_phase_tasks(proj1, groupId, [
        { title: 'P1-T1', objective: 'O', lane_required: 'DEV' },
      ]);
      await dal.inject_phase_tasks(proj2, groupId, [
        { title: 'P2-T1', objective: 'O', lane_required: 'DEV' },
      ]);

      // proj1 只有 1 个任务
      const result1 = await dal.check_group_completion(groupId, proj1);
      expect(result1.total_tasks).toBe(1);

      // proj2 也只有 1 个任务
      const result2 = await dal.check_group_completion(groupId, proj2);
      expect(result2.total_tasks).toBe(1);
    });

    it('should reject for non-existent group', async () => {
      const { projectId } = await seedBase();
      await expect(
        dal.check_group_completion('nonexistent-group', projectId),
      ).rejects.toThrow('not found');
    });
  });

  // ═════════════════════════════════════════════════════════════
  //  5. closeout_completed_group 测试
  // ═════════════════════════════════════════════════════════════

  describe('closeout_completed_group', () => {
    it('should close group when all tasks are completed', async () => {
      const { projectId } = await seedBase();
      const { groupId } = await seedTaskGroup();

      const ids = await dal.inject_phase_tasks(projectId, groupId, [
        { title: 'T1', objective: 'O1', lane_required: 'DEV' },
      ]);

      await dal.updateTaskStatus(ids[0], 'completed', projectId);

      const result = await dal.closeout_completed_group(groupId, projectId);
      expect(result).toBeDefined();
      expect(result!.status).toBe('completed');
    });

    it('should return null when group is not complete', async () => {
      const { projectId } = await seedBase();
      const { groupId } = await seedTaskGroup();

      await dal.inject_phase_tasks(projectId, groupId, [
        { title: 'T1', objective: 'O1', lane_required: 'DEV' },
      ]);

      const result = await dal.closeout_completed_group(groupId, projectId);
      expect(result).toBeNull();
    });
  });

  // ═════════════════════════════════════════════════════════════
  //  6. thaw_initial_phase 测试
  // ═════════════════════════════════════════════════════════════

  describe('thaw_initial_phase', () => {
    it('should activate all created tasks in a group', async () => {
      const { projectId } = await seedBase();
      const { groupId } = await seedTaskGroup();

      const ids = await dal.inject_phase_tasks(projectId, groupId, [
        { title: 'T1', objective: 'O1', lane_required: 'DEV' },
        { title: 'T2', objective: 'O2', lane_required: 'DEV' },
        { title: 'T3', objective: 'O3', lane_required: 'DEV' },
      ]);

      const thawed = await dal.thaw_initial_phase(projectId, groupId);

      expect(thawed).toHaveLength(3);

      // 验证全部变为 dispatched
      for (const id of thawed) {
        const task = await dal.getTask(id);
        expect(task!.status).toBe('dispatched');
      }
    });

    it('should respect maxTasks limit', async () => {
      const { projectId } = await seedBase();
      const { groupId } = await seedTaskGroup();

      await dal.inject_phase_tasks(projectId, groupId, [
        { title: 'T1', objective: 'O1', lane_required: 'DEV' },
        { title: 'T2', objective: 'O2', lane_required: 'DEV' },
        { title: 'T3', objective: 'O3', lane_required: 'DEV' },
      ]);

      const thawed = await dal.thaw_initial_phase(projectId, groupId, 2);
      expect(thawed).toHaveLength(2);
    });

    it('should not re-thaw already dispatched tasks', async () => {
      const { projectId } = await seedBase();
      const { groupId } = await seedTaskGroup();

      const ids = await dal.inject_phase_tasks(projectId, groupId, [
        { title: 'T1', objective: 'O1', lane_required: 'DEV' },
        { title: 'T2', objective: 'O2', lane_required: 'DEV' },
      ]);

      // 手动 dispatch 第一个
      await dal.updateTaskStatus(ids[0], 'dispatched', projectId);

      const thawed = await dal.thaw_initial_phase(projectId, groupId);
      // 只应解冻第二个（仍为 created 的）
      expect(thawed).toHaveLength(1);
      expect(thawed[0]).toBe(ids[1]);
    });

    it('should reject for non-existent group', async () => {
      const { projectId } = await seedBase();
      await expect(
        dal.thaw_initial_phase(projectId, 'nonexistent-group'),
      ).rejects.toThrow('not found');
    });

    it('should isolate by project_id — not thaw other project tasks', async () => {
      const { projectId: proj1 } = await seedBase();
      const { projectId: proj2 } = await seedBase();
      const { groupId } = await seedTaskGroup();

      await dal.inject_phase_tasks(proj1, groupId, [
        { title: 'P1-T1', objective: 'O', lane_required: 'DEV' },
      ]);
      await dal.inject_phase_tasks(proj2, groupId, [
        { title: 'P2-T1', objective: 'O', lane_required: 'DEV' },
      ]);

      // 只解冻 proj1 的
      const thawed = await dal.thaw_initial_phase(proj1, groupId);
      expect(thawed).toHaveLength(1);

      // proj2 的任务应该还是 created
      const proj2Tasks = await dal.listTasksByProject(proj2);
      expect(proj2Tasks[0].status).toBe('created');
    });
  });

  // ═════════════════════════════════════════════════════════════
  //  7. 并发写入安全测试
  // ═════════════════════════════════════════════════════════════

  describe('concurrent write safety', () => {
    it('should handle 10 concurrent run status updates without database is locked', async () => {
      const { projectId, agentId } = await seedBase();

      // 创建 1 个 task
      const task = await dal.createTask({
        id: uuidv4(),
        project_id: projectId,
        title: 'Concurrent Test',
        objective: 'Test DB locks',
        lane_required: 'DEV',
      });

      // 创建 10 个 runs
      const runIds: string[] = [];
      for (let i = 0; i < 10; i++) {
        const run = await dal.createRun({
          run_id: uuidv4(),
          task_id: task.id,
          agent_id: agentId,
          idempotency_key: `idemp-concurrent-${i}-${uuidv4()}`,
        });
        runIds.push(run.run_id);
      }

      // 并发更新所有 runs
      const updatedCount = await dal.concurrentUpdateRuns(runIds, 'success');
      expect(updatedCount).toBe(10);

      // 验证全部更新成功
      for (const runId of runIds) {
        const run = await dal.getRun(runId);
        expect(run!.status).toBe('success');
      }
    });

    it('should handle concurrent task creation with inject_phase_tasks', async () => {
      const { projectId } = await seedBase();
      const { groupId: gid1 } = await seedTaskGroup();
      const { groupId: gid2 } = await seedTaskGroup();

      // 并发注入到两个不同的 group
      const [ids1, ids2] = await Promise.all([
        dal.inject_phase_tasks(projectId, gid1, [
          { title: 'G1-T1', objective: 'O', lane_required: 'DEV' },
          { title: 'G1-T2', objective: 'O', lane_required: 'DEV' },
        ]),
        dal.inject_phase_tasks(projectId, gid2, [
          { title: 'G2-T1', objective: 'O', lane_required: 'DEV' },
        ]),
      ]);

      expect(ids1).toHaveLength(2);
      expect(ids2).toHaveLength(1);
    });
  });

  // ═════════════════════════════════════════════════════════════
  //  8. Prisma-only 验证（无 raw SQL）
  // ═════════════════════════════════════════════════════════════

  describe('Prisma-only enforcement', () => {
    it('DAL source should NOT import better-sqlite3', () => {
      const fs = require('fs');
      const path = require('path');
      const source = fs.readFileSync(
        path.resolve(__dirname, '../src/db/prisma_dal.ts'),
        'utf-8',
      );
      expect(source).not.toContain("from 'better-sqlite3'");
      expect(source).not.toContain('require("better-sqlite3")');
    });

    it('DAL source should NOT contain raw SQL DML statements', () => {
      const fs = require('fs');
      const path = require('path');
      const source = fs.readFileSync(
        path.resolve(__dirname, '../src/db/prisma_dal.ts'),
        'utf-8',
      );
      // 不应包含 INSERT / UPDATE / DELETE / SELECT 的 raw SQL（PRAGMA 配置除外）
      const lines = source.split('\n');
      const nonPragmaLines = lines.filter((l: string) => !l.trim().startsWith('//') && !l.includes('PRAGMA'));
      const codeOnly = nonPragmaLines.join('\n');
      expect(codeOnly).not.toMatch(/\bINSERT\s+INTO\b/i);
      expect(codeOnly).not.toMatch(/\bUPDATE\s+\w+\s+SET\b/i);
      expect(codeOnly).not.toMatch(/\bDELETE\s+FROM\b/i);
      expect(codeOnly).not.toMatch(/\bSELECT\s+\*\s+FROM\b/i);
    });
  });
});
