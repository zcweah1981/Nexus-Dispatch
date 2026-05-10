# Long Proof — V8-R9-T6 Daemon Restart Recovery Smoke

任务：`nexus-v8-r9-t6-daemon-restart-recovery-smoke`

范围：仅补齐 R9-T6 daemon restart recovery smoke 合同，证明 V8 daemon 在模拟重启场景下能正确恢复中断的任务生命周期：stale run 检测 → timeout recovery → retry_ready → 下一 tick 重新派发 → worker result ingest → review → completed → group closeout。全程保持 project isolation，无重复 dispatch，无数据损坏。未进入真实 systemd 进程管理、进程信号处理、生产/ignored SQLite 迁移、WebUI 或后续阶段。

## 前置阅读

- `docs/v8/README.md` — V8 clean rebuild 主线约束。
- `docs/v8/legacy-test-classification.md` — V8 默认验证与 legacy 边界。
- `docs/v8/legacy-dal-boundary.md` — Daemon 不得回退 legacy DAL/direct SQLite。
- `docs/v8/prisma-schema-boundary.md` — Prisma schema / Client 为 V8 主线数据层契约。
- `docs/v8/long-proof-r4-daemon-tick-loop.md` — V8DaemonTickLoop 五步 tick loop 初始实现。
- `docs/v8/long-proof-r4-timeout-recovery.md` — timeout recovery 语义（retry_ready / dead_letter）。
- `docs/v8/long-proof-r9-t2-worker-proof-review-pass-e2e.md` — R9-T2 E2E: worker proof → review PASS → completed。
- `docs/v8/long-proof-r9-t3-review-fail-retry-pass-e2e.md` — R9-T3 E2E: review FAIL → retry → review PASS → completed。
- `docs/v8/long-proof-r9-t4-group-closeout-e2e.md` — R9-T4 E2E: group closeout + next phase thaw。
- `docs/v8/long-proof-r9-t5-cron-registry-isolation-smoke.md` — R9-T5 daemon smoke: cron registry isolation。

## 修改文件

本卡 task-scoped 修改：

- `tests/v8/v8_daemon_tick_loop.test.ts`
  - 新增 `R9-T6 daemon restart recovery smoke: interrupted mid-flight tasks recover and complete after daemon restart`。
  - 场景覆盖：
    - **Tick 1（初始 daemon）**：dispatch 可恢复任务，模拟 dispatch 过程中第二个任务出错（per-task catch）。
    - **Tick 2（重启后 daemon）**：检测 stale run → timeout recovery → retry_ready；同时 claim/dispatch 未被处理的 standard 任务 → auto-complete。
    - **Tick 3（继续 tick）**：从 retry_ready 重新派发恢复任务 → worker result ingest → review task 创建。
    - **Tick 4（review 闭环）**：dispatch review task → reviewer PASS → 原任务 completed → group closeout + summary proof。
  - 断言覆盖：
    - stale run 被标记为 error，`error_stack` 包含 `timeout_recovery`。
    - 恢复任务进入 `retry_ready`，`retry_count` 递增，`ext_meta.timeout_recovery` 记录前序 run 与恢复决策。
    - 重启后 daemon 不在同一 tick 重派恢复任务（跳过 claim）。
    - 跨重启保持 project isolation（other project sentinel 保持 `created`）。
    - 最终全量 closeout：group archived，summary proof 记录 `completed: 2, total: 2`。
    - audit trail：可恢复任务至少有 2 条 run（error + success）。
    - dispatch audit：按 tick 追踪 dispatch 序列，验证无重复派发。
- `docs/v8/long-proof-r9-t6-daemon-restart-recovery-smoke.md`
  - 本 proof 文档。

## 实现内容

1. **重启恢复 smoke**：通过连续 5 次 tick（模拟 daemon 从运行到崩溃到重启的完整生命周期），验证 V8DaemonTickLoop 的 `recoverStaleRuns()` 在新实例中正确检测 stale run。
2. **中断任务恢复**：任务从 `running` → timeout recovery → `retry_ready` → 下一 tick claim/dispatch → fresh run → 全流程完成。
3. **并行处理**：重启后的 daemon 同时处理恢复任务（retry_ready）和新任务（created/standard），互不干扰。
4. **Review 闭环**：恢复任务走 `pm_audit` 路径，创建 review task，reviewer PASS 后原任务 completed。
5. **Group closeout**：所有任务 terminal 后，daemon 自动 archive group 并创建 summary proof。
6. **Cross-project isolation**：全程保持 project_id 分区，重启不影响其他 project 的任务。
7. **无重复 dispatch**：恢复任务在 recovery tick 不被 dispatch，下一 tick 才重新 claim。

## 验证命令与结果

| 命令 | 结果 |
|---|---|
| `npm test -- --runInBand tests/v8/v8_daemon_tick_loop.test.ts -t 'R9-T6'` | PASS：1 passed。 |
| `npm test -- --runInBand tests/v8/v8_daemon_tick_loop.test.ts` | PASS：16 passed（含 R9-T6 新增 smoke）。 |
| `npm test -- --runInBand tests/v8` | PASS：21 suites / 100 tests。 |
| `npx prisma validate` | passed：schema valid。 |
| `npm run build` | passed：`tsc` exit 0。 |
| `git diff --check` | passed：no output。 |
| source denylist：`grep -R "better-sqlite3\|sqlite3\|data/nexus\.db\|prisma/data/nexus\.db\|\$queryRaw\|\$executeRaw" src/daemon/v8_tick_loop.ts` | CLEAN：无命中。 |
| pollution scan：`git status --short --untracked-files=all \| grep -E 'pollution patterns'` | CLEAN：无污染。 |

## TDD 记录

| 阶段 | 命令 | 结果 |
|---|---|---|
| RED-1 | 首次运行新测试（dispatch step `ok` 断言错误） | 失败：tick1 dispatch step 实际 `ok: true`（per-task catch），测试期望 `false`。 |
| RED-2 | 修正 dispatch step 断言后（closeout 在 tick 5 空结果） | 失败：closeout 在 tick 4 已触发（两个任务在 tick 4 全部 terminal）。 |
| RED-3 | 修正 closeout 到 tick 4 后（tick3 dispatch audit 期望含 review task） | 失败：review task 在 tick 3 仅创建（review step），tick 4 才 dispatch。 |
| GREEN | `npm test -- --runInBand tests/v8/v8_daemon_tick_loop.test.ts -t 'R9-T6'` | PASS：1 passed。 |

## 剩余风险 / 非阻断观察

1. 本 smoke 通过创建新的 `V8DaemonTickLoop` 实例模拟 daemon 重启，未测试真实进程级重启（SIGTERM/SIGKILL）、systemd `Restart=on-failure` 或 PrismaClient 连接池恢复。真实进程重启的 ops smoke 应由后续 R10+ systemd 部署卡覆盖。
2. 前序 R4-R9 累积了大量 WIP dirty files（`git diff --stat` 显示 18 files, +3568/-637 lines），本卡主审范围仅为 `tests/v8/v8_daemon_tick_loop.test.ts` 的 R9-T6 smoke 与本 proof 文档。历史/legacy/未触碰文件问题按治理要求只列为非阻断观察。
3. 恢复任务的 fresh run 使用新的 `lease_token`，但本 smoke 未验证旧 lease 的过期机制是否阻止了旧 worker result 被重复 ingest（已由 R4 lease ingest test 独立覆盖）。

## 下一阶段输入

- 若进入真实 systemd 部署阶段，应增加进程级 restart smoke：`systemctl restart nexus-dispatch-daemon` + journald 日志验证 + DB 状态一致性检查。
- Daemon 优雅关停（SIGTERM handler）需要 `V8DaemonTickLoop` 支持可中断的 tick 与 run 级别 cleanup。
- 多 daemon 实例并发场景（分布式锁 / lease 竞争）为后续 R10+ 扩展方向。
