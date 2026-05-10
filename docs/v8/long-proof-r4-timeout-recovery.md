# Long Proof — V8-R4-T5 Timeout Recovery

任务：`nexus-v8-r4-t5-timeout-recovery`

范围：仅收紧 R4 daemon 对超时/陈旧 running run 的恢复语义：timeout 后进入 `retry_ready` 或 `dead_letter`，并保证下一 tick 可恢复派发；不进入 resident cron/systemd、真实 Telegram 投递、review verdict 终局处理、WebUI、生产/ignored SQLite 迁移或 R5 后续阶段。

## 前置阅读

已阅读并按范围执行：

- `docs/v8/README.md`
- `docs/v8/legacy-test-classification.md`
- `docs/v8/legacy-dal-boundary.md`
- `docs/v8/prisma-schema-boundary.md`
- `docs/v8/long-proof-r0-clean-rebuild-baseline.md`
- R1 proof：schema drift / legacy DAL boundary / repositories
- R2 proof：transition service / API contract tests
- R3 proof：freeze blueprint / thaw current phase
- R4 proof：daemon tick loop / stale takeover lease / worker OpenAI-compatible dispatch / result ingestion exactly-once

## 修改文件

本卡新增/修改：

- `src/daemon/v8_tick_loop.ts`
  - `recoverStaleRuns()` 将 stale/timeout running run 统一标记为 `error`，`error_stack` 写入 `timeout_recovery`。
  - 当 `retry_count < max_retries`：递增 `retry_count`，通过 `transitionTask(... event: 'retry')` 进入 `retry_ready`，本 tick 不立即重派；下一 tick claim `retry_ready` 并通过 FSM `dispatch -> start` 恢复运行。
  - 当 `retry_count >= max_retries`：通过 `transitionTask(... event: 'dead_letter')` 进入 `dead_letter`，不再重派。
  - `ext_meta.timeout_recovery` 记录 `previous_run_id/previous_worker_run_id/retry_count/max_retries/outcome/recovered_at`；保留 `stale_takeover` alias 兼容前序 proof 观察。
  - 所有 DB 查询/写入继续按 `project_id` 分区；状态变化走 `transitionTask()` / `V8RuntimeApiService`。
- `tests/v8/v8_daemon_tick_loop.test.ts`
  - 新增 timeout retry-ready contract：timeout 后停在 `retry_ready`，下一 tick 可重新 dispatch 并产生 fresh run。
  - 新增 timeout dead-letter contract：重试耗尽后进入 `dead_letter`，不 claim、不 dispatch。
  - 更新前序 stale takeover test 断言，匹配新的 timeout 恢复语义（本 tick 不立即重派）。
- `docs/v8/long-proof-r4-timeout-recovery.md`
  - 本 proof。

工作区中还存在进入本任务前已存在的前序 R4 untracked proof：

- `docs/v8/long-proof-r4-worker-openai-dispatch.md`
- `docs/v8/long-proof-r4-result-ingestion-once.md`

## TDD 记录

| 阶段 | 命令 | 结果 |
| --- | --- | --- |
| RED-0 | `npm test -- --runInBand tests/v8/v8_daemon_tick_loop.test.ts --testNamePattern "timeout recovery sends exhausted retries to dead_letter"` | 测试不存在，suite skipped，用于确认需新增合同。 |
| RED-1 | 新增 dead_letter 合同后：`npm test -- --runInBand tests/v8/v8_daemon_tick_loop.test.ts --testNamePattern "timeout recovery sends exhausted retries to dead_letter"` | 失败：旧逻辑 timeout 后仍 claimed/re-dispatched，未进入 dead_letter。 |
| RED-2 | 新增 retry_ready 合同后：`npm test -- --runInBand tests/v8/v8_daemon_tick_loop.test.ts --testNamePattern "timeout recovery"` | 失败：旧逻辑立即 claim/dispatch timeout task。 |
| GREEN | `npm test -- --runInBand tests/v8/v8_daemon_tick_loop.test.ts --testNamePattern "timeout recovery"` | passed：2 tests。 |
| Focused full daemon | `npm test -- --runInBand tests/v8/v8_daemon_tick_loop.test.ts` | passed：10 tests。 |

## 验证命令与结果

| 命令 | 结果 |
| --- | --- |
| `npm test -- --runInBand tests/v8/v8_daemon_tick_loop.test.ts --testNamePattern "timeout recovery"` | passed：2 tests。 |
| `npm test -- --runInBand tests/v8/v8_daemon_tick_loop.test.ts` | passed：1 suite / 10 tests。 |
| `npm test -- --runInBand tests/v8` | passed：12 suites / 52 tests。 |
| `npx prisma validate` | passed：schema valid。 |
| `npm run build` | passed：`tsc` exit 0。 |
| `git diff --check` | passed。 |
| `npm test -- --runInBand` | passed：33 suites / 232 tests。 |

验证日志：

- 本轮 dispatch3 复验：`/tmp/nexus-v8-r4-t5-dispatch3-verify.log` — 154 lines，sha256 `507ca4158fc4558763259efe42d1e11b641a159d4c9026fda86b2cfa19c27833`。
- 本轮 dispatch3 full Jest：`/tmp/nexus-v8-r4-t5-dispatch3-full-jest.log` — 79 lines，sha256 `ab1e24b1435067995eb272601e95f3fe6685d2ce18900e8fca976c2daca43e1b`。
- 本轮 dispatch3 final hygiene：`/tmp/nexus-v8-r4-t5-dispatch3-final-hygiene.txt` — 23 lines，sha256 `27e590ce892b3fe8c81d8febe8ae47ae0f00087071406e12ed3225f6ed5c741c`。
- 早前本卡验证留存：`/tmp/nexus-v8-r4-t5-timeout-recovery-verify.log` — 79 lines，sha256 `db0d81e7b88760e37447eeb333fe332c7c3195aed0998134cf9ca940a19a8c0d`；`/tmp/nexus-v8-r4-t5-timeout-recovery-full-jest.log` — 77 lines，sha256 `86f1b47a14b1549d981656ee49e5a966c0455b298df98eecf0980bd36b0535d6`。

## 污染与边界扫描

- `git diff --check` clean。
- status pollution scan 未发现新增/修改 DB、SQLite、dist、node_modules、secrets、proof JSON、`.env`。
- tracked pollution scan 仅命中既有 tracked safe template：`.env.example`。
- source hook scan 显示 timeout recovery 相关逻辑集中在 `src/daemon/v8_tick_loop.ts`，状态迁移仍调用 `transitionTask()`；生产 daemon 无 legacy DAL / ignored DB / raw SQL。

## 已实现内容

1. timeout 可恢复：未耗尽重试预算时，旧 run 标记 `error`，task 进入 `retry_ready`，下一 tick 通过 FSM `dispatch/start` 获得 fresh run。
2. timeout 可终局：重试预算耗尽时，task 进入 `dead_letter`，daemon 不再 claim/dispatch。
3. retry 计数可审计：未耗尽场景递增 `retry_count`；耗尽场景不继续递增，保留已耗尽值。
4. runtime proof 可审计：`proof_data` 记录 FSM event，`ext_meta.timeout_recovery` 记录恢复决策与前一 run/worker_run。
5. 保持 project-scoped 边界与 V8 service/FSM Controller 边界。

## 剩余风险

1. `stale_takeover` 字段作为兼容 alias 暂保留，语义上已由 `timeout_recovery` 接管；后续如要清理命名，建议单独 R5/R6 cleanup 卡处理。
2. `retry_count` 当前由 daemon 以 project-scoped `updateMany` 写业务计数，任务状态仍走 `transitionTask()`；若后续要把 retry policy 完全内聚到 FSM Controller，需要新增 service-level API。
3. timeout 判断仍基于 `started_at < now - staleRunMs`，未单独解析 `lease_expires_at` 做更细粒度策略；R5 可定义 lease/timeout 双阈值协议。

## R5 输入

- 定义 retry policy/lease policy 的统一 service/API 合同：`retry_count/max_retries` 是否由 Runtime API/FSM Controller 原子维护。
- 明确 `retry_ready` 的运营可见语义：是否需要 pending report / group summary 展示“等待重派”。
- 如进入 resident daemon/cron 阶段，加入跨 tick e2e：timeout -> retry_ready -> next tick redispatch -> worker result ingest -> review/closeout。
