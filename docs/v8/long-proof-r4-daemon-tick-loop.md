# Long Proof — V8-R4-T1 Daemon Tick Loop 五步重建

任务：`nexus-v8-r4-t1-daemon-tick-loop`
范围：仅实现 R4-T1 daemon tick loop 的五步组织与 focused contract；不进入 resident cron/systemd、真实 Telegram 投递、外部 worker 网络发送、review verdict 终局处理、WebUI 或生产/ignored SQLite 迁移。

## 前置阅读

- `docs/v8/README.md`
- `docs/v8/long-proof-r0-clean-rebuild-baseline.md`
- `docs/v8/legacy-dal-boundary.md`
- `docs/v8/prisma-schema-boundary.md`
- `docs/v8/long-proof-r2-api-contract-tests.md`
- `docs/v8/long-proof-r3-blueprint-json-schema.md`
- `docs/v8/long-proof-r3-freeze-blueprint.md`
- `docs/v8/long-proof-r3-thaw-current-phase.md`
- `docs/v8/long-proof-r3-group-summary-proof-gate.md`
- `docs/v8/long-proof-r3-phase-advance-api.md`

## 修改文件

- `src/daemon/v8_tick_loop.ts` — 新增 V8 daemon tick loop，按 `claim -> dispatch -> ingest -> review -> closeout` 五步执行；任务状态变化调用 `transitionTask()`；run/report/task 创建调用 `V8RuntimeApiService`；所有查询/写入均带 `project_id` 过滤。
- `tests/v8/v8_daemon_tick_loop.test.ts` — 新增 R4-T1 focused contracts：五步顺序、project isolation、worker result ingest、pm_audit review task 创建、group closeout + sent group summary proof、source denylist。
- `docs/v8/long-proof-r4-daemon-tick-loop.md` — 本 proof 文件。

## 实现内容

1. `V8DaemonTickLoop.tick()` 固定输出五步：`claim`、`dispatch`、`ingest`、`review`、`closeout`，并返回结构化 step proof。
2. Claim：只扫描当前 `project_id` 下 `created` 且依赖已完成的任务；用 `transitionTask(event='dispatch')` 推进到 `dispatched`。
3. Dispatch：选择同项目或全局 online agent；通过 `V8RuntimeApiService.createRun()` 创建 run，再用 `transitionTask(event='start')` 推进任务到 `running`；worker 发送由可注入 `workerClient` 承担，R4-T1 不做真实网络派发。
4. Ingest：从 `workerClient.drainResults(project_id)` 读取同项目 worker 结果；更新 run success，调用 `transitionTask(event='submit_completion')`，并创建 `agent_result` report proof。
5. Review：对 `completion_pending + acceptance_mode='pm_audit'` 创建 reviewer task 与 `reviews` 桥接行，再调用 `transitionTask(event='request_review')` 推进原任务到 `review_pending`；非 pm_audit 任务走 `auto_complete`。
6. Closeout：仅当同项目 group 内任务全部 terminal 时，归档该 group 并创建 `message_type='group_summary' AND status='sent'` 的 summary proof，为 R3 phase advance gate 提供输入。
7. Boundary：未 import legacy DAL，未打开 `data/nexus.db` / `prisma/data/nexus.db`，未使用 `better-sqlite3` / `sqlite3` / `$queryRaw` / `$executeRaw`；测试 DB 由 `npm run db:init:test -- <tmp-db>` 在 `/tmp` 初始化。

## TDD 记录

| 阶段 | 命令 | 结果 |
|---|---|---|
| RED | `npm test -- --runInBand tests/v8/v8_daemon_tick_loop.test.ts` | 预期失败：`Cannot find module '../../src/daemon/v8_tick_loop'`，证明新 contract 先于实现。 |
| GREEN | `npm test -- --runInBand tests/v8/v8_daemon_tick_loop.test.ts` | passed：1 suite / 3 tests。 |

## 验证命令与结果

| 命令 | 结果 |
|---|---|
| `npm test -- --runInBand tests/v8/v8_daemon_tick_loop.test.ts` | passed：1 suite / 3 tests。 |
| `npx prisma validate` | passed：schema valid。 |
| `npm run build` | passed：`tsc` exit 0。 |
| `npm test -- --runInBand tests/v8` | passed：12 suites / 45 tests。 |
| `npm test -- --runInBand` | passed：33 suites / 225 tests。 |
| `git diff --check` | passed：no output。 |
| source denylist：`grep -R "better-sqlite3\|sqlite3\|data/nexus.db\|prisma/data/nexus.db\|\$queryRaw\|\$executeRaw" src/daemon/v8_tick_loop.ts tests/v8/v8_daemon_tick_loop.test.ts \|\| true` | 仅命中测试中的 denylist regex 字符串；生产 daemon 文件无 direct SQLite / ignored DB / raw query。 |
| pollution scan：`git status --short --untracked-files=all \| grep -E '(^\|/)(dist\|node_modules)(/\|$)\|\.db(-wal\|-shm)?$\|\.sqlite(3)?$\|secret\|\.env\|proof.*\.json\|test_proof.*\.json' \|\| true` | no output。 |
| tracked pollution：`git ls-files data prisma/data dist src/webui/dist '*.db' '*.sqlite' '*.sqlite3' 'proof*.json' '*proof*.json' '.env' '*.env' \|\| true` | no output。 |

## 剩余风险

1. 本卡是 daemon tick loop 的可测试核心服务，不启动 resident loop，不注册/恢复 cronjob，也不做 systemd live smoke。
2. Worker dispatch 仍是注入接口；真实 HTTP/Telegram 可见投递、agent bot ownership、消息脱敏模板属于后续 R4 report/notification 卡。
3. Review 本卡只创建 review task 与 review bridge，不处理 reviewer PASS/FAIL 终局、返工合同或 loop breaker。
4. Closeout summary proof 采用 `reports.payload_json` 绑定 `group_id/task_group_id`，与 R3 gate 对齐；后续可升级为更强 artifact schema。

## 下一阶段输入

- R4 后续 dispatcher/worker integration 可复用 `V8DaemonWorkerClient` 接口，把真实 worker endpoint 发送与结果回收接入 `dispatch()` / `drainResults()`。
- Review verdict 阶段必须继续使用 `transitionTask()`，从 `review_pending` 进入 `completed/retry_ready/blocked`，不得直接写 `Task.status`。
- Phase advance 自动化阶段可在 closeout summary sent 后调用 R3 `advancePhase()` / API，不得绕过 group summary proof gate。
