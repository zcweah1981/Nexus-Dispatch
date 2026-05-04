/**
 * Nexus Dispatch Daemon — Tick 核心重写（全走 API）
 * Task: nd-v75-t31 | Agent: long-coder-1
 *
 * 核心原则：
 *   1. tick() 全走 REST API，严禁 sqlite3.connect() 或直接 DAL 操作
 *   2. 步骤: GET /pending → find agent → claim → create run → adapt → POST worker → notify
 *   3. 发包失败 rollback 状态到 created
 *   4. 超时任务回收（>15min dispatched → created）
 *   5. 派单通知用被派 Agent 自己的 bot token 发送（不用 Daemon bot）
 *   6. 派单和接单合并为一条消息：已派发已接单
 *   7. 单次 tick 完整日志输出
 */

import axios, { AxiosInstance } from 'axios';
import { AdapterFactory } from '../adapters';
import { FreezerEngine } from '../engine/freezer';
import { PrismaDAL } from '../db/prisma_dal';

// ─── 配置类型 ────────────────────────────────────────────

export interface AgentNotificationConfig {
  bot_token: string;
  chat_id: string;
}

export interface DaemonConfig {
  /** API Server base URL (e.g. http://localhost:8000/api/v1) */
  apiUrl: string;
  /** API auth token */
  authToken: string;
  /** Tick interval in ms (default 5000) */
  tickInterval: number;
  /** Timeout for dispatch to worker in ms (default 10000) */
  dispatchTimeout: number;
  /** Timeout for task recovery in minutes (default 15) */
  recoveryTimeoutMinutes: number;
  /** Per-agent notification config: agent_id → { bot_token, chat_id } */
  agentNotifications: Record<string, AgentNotificationConfig>;
  /** Default notification config (fallback if agent has no specific config) */
  defaultNotification?: AgentNotificationConfig;
  /** Injected notification function for testing */
  notificationFn?: (config: AgentNotificationConfig, message: string) => Promise<void>;
}

export interface TickResult {
  recovered: number;
  dispatched: number;
  failed: number;
  skipped: number;
  details: string[];
}

// Sleep helper
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// ─── Daemon 主类 ─────────────────────────────────────────

class Daemon {
  private running: boolean = false;
  private config: DaemonConfig;
  private apiClient: AxiosInstance;

  // Freezer 仍使用 PrismaDAL（独立关注点，不在 tick API 重写范围）
  private prismaDal: PrismaDAL | null = null;
  private freezerEngine: FreezerEngine | null = null;

  constructor(config?: Partial<DaemonConfig>) {
    this.config = {
      apiUrl: process.env.PM_API_URL || 'http://localhost:8000/api/v1',
      authToken: process.env.PM_API_TOKEN || 'valid-token',
      tickInterval: parseInt(process.env.TICK_INTERVAL || '5000', 10),
      dispatchTimeout: parseInt(process.env.DISPATCH_TIMEOUT || '10000', 10),
      recoveryTimeoutMinutes: parseInt(process.env.RECOVERY_TIMEOUT_MINUTES || '15', 10),
      agentNotifications: this.parseAgentNotifications(),
      ...config,
    };

    this.apiClient = axios.create({
      baseURL: this.config.apiUrl,
      headers: { 'Authorization': `Bearer ${this.config.authToken}` },
      timeout: this.config.dispatchTimeout,
    });
  }

  /**
   * 解析环境变量中的 Agent 通知配置
   * 格式: AGENT_NOTIFICATIONS='{"long-coder-1":{"bot_token":"xxx","chat_id":"-100xxx"}}'
   */
  private parseAgentNotifications(): Record<string, AgentNotificationConfig> {
    try {
      const raw = process.env.AGENT_NOTIFICATIONS;
      if (raw) return JSON.parse(raw);
    } catch {}
    return {};
  }

  /**
   * 单次 tick 执行（全走 REST API）
   *
   * 流程：
   *   1. 超时回收：POST /tasks/recover-timeouts
   *   2. 获取待派发任务：GET /tasks/pending
   *   3. 逐任务派发：
   *      a. 查找匹配 Agent（GET /agents）
   *      b. 原子 claim（POST /tasks/:id/claim）
   *      c. 创建 Run 记录（POST /runs）
   *      d. Adapter 适配 payload
   *      e. 发送到 Agent endpoint
   *      f. 失败 rollback（PATCH /tasks/:id/status → created）
   *      g. 成功则发送通知（用 Agent 自己的 bot）
   *   4. Freezer 闭环（仍用 PrismaDAL）
   *   5. 输出完整 tick 日志
   */
  async tick(): Promise<TickResult> {
    const result: TickResult = {
      recovered: 0,
      dispatched: 0,
      failed: 0,
      skipped: 0,
      details: [],
    };
    const tickStart = Date.now();

    // ── Step 1: 超时任务回收 ──────────────────────────────
    try {
      const recoverRes = await this.apiClient.post('/tasks/recover-timeouts', {
        timeout_minutes: this.config.recoveryTimeoutMinutes,
      });
      result.recovered = recoverRes.data.recovered || 0;
      if (result.recovered > 0) {
        result.details.push(
          `[Recovery] ✅ ${result.recovered} timed-out tasks reset to created: ${recoverRes.data.task_ids?.join(', ')}`,
        );
      }
    } catch (error: any) {
      result.details.push(`[Recovery] ⚠️ Error: ${error.message}`);
    }

    // ── Step 2: 获取待派发任务 ────────────────────────────
    let pendingTasks: any[] = [];
    try {
      const pendingRes = await this.apiClient.get('/tasks/pending');
      pendingTasks = pendingRes.data.tasks || [];
    } catch (error: any) {
      if (error.response?.status === 404) {
        result.details.push('[Dispatch] No pending tasks');
      } else {
        result.details.push(`[Dispatch] ⚠️ Error fetching pending: ${error.message}`);
      }
    }

    // ── Step 3: 逐任务派发 ────────────────────────────────
    for (const task of pendingTasks) {
      try {
        // 3a. 查找匹配的 Agent
        const agentsRes = await this.apiClient.get('/agents');
        const agents: any[] = agentsRes.data.agents || [];
        const matchingAgent = agents.find(
          (a: any) => a.lane === task.lane_required && a.status === 'online',
        );

        if (!matchingAgent) {
          result.skipped++;
          result.details.push(
            `[Dispatch] ⏭️ No online agent for task ${task.id} (lane: ${task.lane_required})`,
          );
          continue;
        }

        // 3b. 原子 claim（created → dispatched）
        try {
          await this.apiClient.post(`/tasks/${task.id}/claim`);
        } catch (claimError: any) {
          if (claimError.response?.status === 409) {
            // 已被其他 daemon tick claim
            result.skipped++;
            result.details.push(`[Dispatch] ⏭️ Task ${task.id} already claimed`);
            continue;
          }
          throw claimError;
        }

        // 3c. 创建 Run 记录
        const idempotencyKey = `tick-${task.id}-${Date.now()}`;
        let runRecord: any;
        try {
          const runRes = await this.apiClient.post('/runs', {
            task_id: task.id,
            agent_id: matchingAgent.agent_id,
            idempotency_key: idempotencyKey,
          });
          runRecord = runRes.data.run;
        } catch (runError: any) {
          // Run 创建失败 → rollback task status
          try {
            await this.apiClient.patch(`/tasks/${task.id}/status`, { status: 'created' });
          } catch {}
          result.failed++;
          result.details.push(
            `[Dispatch] ❌ Run creation failed for ${task.id}: ${runError.message}`,
          );
          continue;
        }

        // 3d. Adapter 适配 payload
        const dialect = matchingAgent.dialect || 'openclaw';
        const adapter = AdapterFactory.get_adapter(dialect);
        const payload = adapter.adapt(task);

        // 注入 workdir
        if (task.project_id) {
          const basePath = process.env.NEXUS_PROJECTS_BASE || '/root/.hermes/projects';
          const workdir = require('path').resolve(basePath, task.project_id);
          payload.payload.workdir = workdir;
        }

        // 注入 run_id 到 payload
        if (runRecord) {
          payload.payload.run_id = runRecord.run_id;
        }

        // 3e. 发送到 Agent endpoint
        try {
          await axios.post(matchingAgent.endpoint, payload, {
            timeout: this.config.dispatchTimeout,
          });
          result.dispatched++;
          result.details.push(
            `[Dispatch] ✅ ${task.id} → ${matchingAgent.agent_id} (run: ${runRecord?.run_id})`,
          );

          // 3g. 发送派单通知（用 Agent 自己的 bot）
          await this.sendDispatchNotification(matchingAgent, task);
        } catch (dispatchError: any) {
          // 3f. 发送失败 → rollback
          result.failed++;
          result.details.push(
            `[Dispatch] ❌ Worker dispatch failed for ${task.id} → ${matchingAgent.agent_id}: ${dispatchError.message}`,
          );

          // Rollback: task status → created
          try {
            await this.apiClient.patch(`/tasks/${task.id}/status`, { status: 'created' });
            result.details.push(`[Dispatch] ↩️ Task ${task.id} rolled back to created`);
          } catch (rollbackError: any) {
            result.details.push(
              `[Dispatch] ⚠️ Rollback failed for ${task.id}: ${rollbackError.message}`,
            );
          }

          // Mark run as failed
          if (runRecord?.run_id) {
            try {
              await this.apiClient.patch(`/runs/${runRecord.run_id}/status`, {
                status: 'failed',
                error_stack: `Dispatch to worker failed: ${dispatchError.message}`,
              });
            } catch {}
          }
        }
      } catch (taskError: any) {
        result.failed++;
        result.details.push(
          `[Dispatch] ❌ Task ${task.id} unexpected error: ${taskError.message}`,
        );
      }
    }

    // ── Step 4: Freezer 闭环 ──────────────────────────────
    await this.runFreezerTick();

    // ── Step 5: 完整 tick 日志 ────────────────────────────
    const tickDuration = Date.now() - tickStart;
    const summary = [
      `[Tick Summary] ${new Date().toISOString()}`,
      `  Duration: ${tickDuration}ms`,
      `  Recovered: ${result.recovered}`,
      `  Dispatched: ${result.dispatched}`,
      `  Failed: ${result.failed}`,
      `  Skipped: ${result.skipped}`,
      `  Pending checked: ${pendingTasks.length}`,
      ...result.details.map((d) => `  ${d}`),
    ];
    console.log(summary.join('\n'));

    return result;
  }

  /**
   * 发送派单通知
   *
   * 使用被派 Agent 自己的 bot token 发送到群组。
   * 派单和接单合并为一条消息：动作=已派发已接单
   *
   * 通知配置优先级：
   *   1. config.agentNotifications[agent.agent_id] （per-agent 配置）
   *   2. config.defaultNotification （全局默认）
   *   3. 无配置则静默跳过
   */
  private async sendDispatchNotification(agent: any, task: any): Promise<void> {
    const agentId = agent.agent_id;
    const notifConfig =
      this.config.agentNotifications[agentId] || this.config.defaultNotification;

    if (!notifConfig) {
      // 无通知配置 — 静默跳过
      return;
    }

    const message = [
      '📋 任务已派发已接单',
      `📌 任务: ${task.title}`,
      `👤 Agent: ${agentId}`,
      `🆔 Task ID: ${task.id}`,
      `⏰ 时间: ${new Date().toISOString()}`,
    ].join('\n');

    try {
      if (this.config.notificationFn) {
        // 可注入的通知函数（方便测试）
        await this.config.notificationFn(notifConfig, message);
      } else {
        // 默认: Telegram Bot API
        await axios.post(
          `https://api.telegram.org/bot${notifConfig.bot_token}/sendMessage`,
          {
            chat_id: notifConfig.chat_id,
            text: message,
          },
          { timeout: 5000 },
        );
      }
    } catch (error: any) {
      console.error(
        `[Notification] Failed for agent ${agentId}: ${error.message}`,
      );
    }
  }

  /**
   * Freezer 闭环 — tick 末尾执行
   *
   * 注意：Freezer 是独立关注点（T3.2），仍使用 PrismaDAL 直接操作。
   * 这部分不在 "tick 全走 API" 的重写范围内。
   */
  private async runFreezerTick() {
    try {
      await this.ensureInit();
      if (!this.prismaDal || !this.freezerEngine) return;

      const projects = await (this.prismaDal as any).prisma.project.findMany({
        where: { status: 'active' },
      });

      for (const project of projects) {
        const freezerResult = await this.freezerEngine.run_once(project.id);
        if (freezerResult.groups_archived.length > 0) {
          console.log(
            `[Freezer] Project ${project.id}: archived [${freezerResult.groups_archived.join(', ')}], ` +
              `injected ${Object.values(freezerResult.tasks_injected).flat().length} tasks`,
          );
        }
        if (freezerResult.errors.length > 0) {
          console.error(`[Freezer] Project ${project.id} errors:`, freezerResult.errors);
        }
      }
    } catch (error: any) {
      console.error('[Freezer] Tick error:', error.message);
    }
  }

  private async ensureInit() {
    if (!this.prismaDal) {
      const dbUrl = process.env.DATABASE_URL || 'file:../prisma/data/nexus.db';
      this.prismaDal = new PrismaDAL(dbUrl);
      await this.prismaDal.initPragmas();
      this.freezerEngine = new FreezerEngine(this.prismaDal);
    }
  }

  async start() {
    this.running = true;
    console.log('Nexus Dispatch Daemon started (API-only tick)...');
    while (this.running) {
      await this.tick();
      await sleep(this.config.tickInterval);
    }
  }

  async stop() {
    this.running = false;
    if (this.prismaDal) {
      await this.prismaDal.close();
    }
    console.log('Nexus Dispatch Daemon stopped.');
  }
}

// Ensure it can be imported for testing or executed directly
if (require.main === module) {
  const daemon = new Daemon();
  process.on('SIGINT', () => daemon.stop());
  process.on('SIGTERM', () => daemon.stop());
  daemon.start();
}

export default Daemon;
