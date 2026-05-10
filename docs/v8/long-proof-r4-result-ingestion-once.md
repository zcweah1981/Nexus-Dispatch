# Long Proof — V8-R4-T4 Run Result Ingestion Exactly-Once

任务：`nexus-v8-r4-t4-result-ingestion-once`

范围：仅收紧 R4 daemon worker result ingest 的幂等 proof/side-effect 边界；不进入 resident cron/systemd、真实 Telegram 投递、review verdict 终局处理、WebUI、生产/ignored SQLite 迁移或 schema hardening。

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
- R4 proof：daemon tick loop / stale takeover lease / worker OpenAI-compatible dispatch

## 修改文件

本卡新增/修改：

- `src/daemon/v8_tick_loop.ts`
  - worker result ingest 成功后写入 `worker_result_ingest` artifact。
  - artifact 按 `project_id + task_id + run_id + artifact_type + path(idempotency_key)` 查询既有 proof，避免同一 worker result 重复写 proof。
  - idempotency key：`project_id:run_id:worker_run_id|no-worker-run:lease_token|no-lease`。
  - 保持状态变化经 `transitionTask()` / `V8RuntimeApiService`，DB 写入均携带 `project_id`。
- `tests/v8/v8_daemon_tick_loop.test.ts`
  - 新增 regression contract：同一 tick 内重复 active lease result 只摄取一次；后续 replay 不再重复闭环；`agent_result` report 与 `worker_result_ingest` artifact 均只保留一份。
- `docs/v8/long-proof-r4-result-ingestion-once.md`
  - 本 proof。

工作区中还存在前序 R4-T3 未提交改动/证明：

- `docs/v8/long-proof-r4-worker-openai-dispatch.md` 为进入本任务前已存在的 untracked proof 文档。
- `src/daemon/v8_tick_loop.ts`、`tests/v8/v8_daemon_tick_loop.test.ts` 也包含进入本任务前已有的 R4-T3 OpenAI-compatible worker dispatch 改动；本卡只在同文件上追加 result ingest exactly-once contract 与 proof artifact。

## TDD 记录

| 阶段 | 命令 | 结果 |
| --- | --- | --- |
| RED | `npm test -- --runInBand tests/v8/v8_daemon_tick_loop.test.ts --testNamePattern "worker result ingest is exactly-once"` | 失败：`worker_result_ingest` artifact 数量为 0，证明当前 ingest 缺少可幂等追踪的 result proof。 |
| GREEN | 同上 | 通过：1 passed / 7 skipped。 |
| Focused | `npm test -- --runInBand tests/v8/v8_daemon_tick_loop.test.ts` | 通过：8 tests passed。 |

## 验证命令与结果

| 命令 | 结果 |
| --- | --- |
| `npm test -- --runInBand tests/v8/v8_daemon_tick_loop.test.ts` | passed：1 suite / 8 tests。 |
| `npm test -- --runInBand tests/v8` | passed：12 suites / 50 tests。 |
| `npx prisma validate` | passed：schema valid。 |
| `npm run build` | passed：`tsc` exit 0。 |
| `git diff --check` | passed。 |
| `npm test -- --runInBand` | passed：33 suites / 230 tests。 |

验证日志：

- `/tmp/nexus-v8-r4-t4-current-verify.log` — 84 lines，sha256 `b077e655640bd12beeeef984c55d3de7da08c50ef0ddcbe12c66e043aa40f7cd`。
- `/tmp/nexus-v8-r4-t4-current-full-jest.log` — 83 lines，sha256 `824a0761845719453a05612dc40fef6cb9160e451bea12ee01b485713e6bf675`。

## 污染与边界扫描

- `git diff --check` clean。
- status pollution scan 未发现新增/修改 DB、SQLite、dist、node_modules、secrets、proof JSON、`.env`。
- tracked pollution scan 仅命中既有 tracked safe template：`.env.example`。
- denylist source scan 对生产路径未发现 legacy DAL / ignored DB / raw SQL；测试文件内存在 intentional denylist regex string，用于 source-boundary contract。

## 已实现内容

1. Worker result ingest 对重复 active lease result 做 exactly-once 闭环：首个合法 result 推进 run/task/report/artifact；同 tick 后续重复 result 因 task 已离开 `running` 被忽略；后续 replay 不再重复 report/closeout。
2. 增加 `worker_result_ingest` artifact 作为 runtime proof，携带 `project_id/task_id/run_id/worker_run_id/lease_token/idempotency_key/worker_proof`。
3. 所有新增查询/写入均按 `project_id` 分区；状态变化仍通过 V8 service/FSM boundary。

## 剩余风险

1. 当前 exactly-once proof 使用 artifact `path` 存储 idempotency key，但 schema 尚无 `worker_result_ingest` 专用唯一索引；并发多 daemon 下仍建议后续 schema hardening 增加强唯一约束或专用 result-ingest table。
2. R4 worker completion 真实轮询/回调协议仍未定义；本卡覆盖注入式 `drainResults(project_id)` 的 daemon ingest contract。
3. Telegram 可见消息不在本卡范围；result proof 只进入 runtime DB artifact/report。

## 下一阶段输入

- 后续 worker integration 必须回传 `project_id/task_id/worker_run_id/lease_token/proof`，否则 ingest 会 fail-closed 到 ignored branch。
- 后续 schema hardening 可将 `worker_result_ingest` idempotency key 落为数据库唯一约束，提升多进程并发 exactly-once 保证。
- Reviewer 主审本次 diff/proof；前序 R4-T3 未提交文件只作为工作区观察，不应混入本卡验收范围。
