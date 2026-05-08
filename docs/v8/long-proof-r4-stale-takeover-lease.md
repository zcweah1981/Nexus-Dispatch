# Long Proof — V8-R4-T2 Stale Takeover 与 Lease

任务：`nexus-v8-r4-t2-stale-takeover-lease`
范围：仅在 R4 daemon tick core 内实现 stale takeover 与 lease，避免重复派发/僵尸 run；不进入 resident cron/systemd、真实 worker 网络、Telegram 投递、review verdict 终局处理、WebUI 或生产/ignored SQLite 迁移。

## 前置阅读

- `docs/v8/README.md`
- `docs/v8/long-proof-r0-clean-rebuild-baseline.md`
- `docs/v8/legacy-dal-boundary.md`
- `docs/v8/prisma-schema-boundary.md`
- `docs/v8/long-proof-r2-api-contract-tests.md`
- `docs/v8/long-proof-r3-phase-advance-api.md`
- `docs/v8/long-proof-r4-daemon-tick-loop.md`

## 修改文件

- `src/daemon/v8_tick_loop.ts` — 在 V8 daemon tick 中加入 stale run takeover、dispatch lease 生成/传递、worker result lease 校验。
- `src/repositories/v8.ts` — 修正 V8 RunRepository 对 `status='error'` 的 terminal `ended_at` stamping，保证 stale takeover 关闭旧 run 可审计。
- `tests/v8/v8_daemon_tick_loop.test.ts` — 扩展 R4 focused contracts，覆盖 stale takeover、新 lease 派发、stale lease result 拒收、active lease result 接收、未到 stale 阈值不重复派发。
- `docs/v8/long-proof-r4-stale-takeover-lease.md` — 本 proof 文件。

## 实现内容

1. `V8DaemonTickLoop.tick()` 在原五步前执行 `recoverStaleRuns()`，只扫描当前 `project_id` 下超出 `staleRunMs` 的 active running/dispatched task + running run。
2. stale takeover 会：
   - 通过 `V8RuntimeApiService.updateRunStatus(project_id, run_id, 'error')` 关闭旧 run；
   - 在 task `ext_meta.stale_takeover` 写入旧 `run_id/worker_run_id/takeover_at`；
   - 将 task 回到可重新派发边界并通过 `transitionTask(event='dispatch')` 进入 FSM 控制的 dispatched 状态。
3. Dispatch 为每个新 run 生成 lease：`lease_token`、`lease_ttl_ms`、`lease_expires_at`；lease 写入 run `result_summary`，并传给注入式 `workerClient.dispatch(payload).lease`。
4. Ingest 只接受当前 project/task 的 active running run，且 worker result 的 `lease_token` 与 run 内记录一致；旧 worker/zombie result 会进入 `ignored-stale-lease`，不会推进 task/run/report。
5. 未超过 stale 阈值的 running run 即使 lease 过期，也不会重复 dispatch；等待 takeover 阈值统一回收，避免同一 active run 被多 daemon 重复派发。
6. 仍保持 V8 边界：生产 daemon 不 import legacy DAL、不打开 ignored DB、不用 `$queryRaw/$executeRaw`；新增查询/写入均包含 `project_id` scope，状态推进仍复用 V8 service/FSM 边界。

## TDD 记录

| 阶段 | 命令 | 结果 |
|---|---|---|
| BASELINE | `npm test -- --runInBand tests/v8/v8_daemon_tick_loop.test.ts` | passed：原 R4-T1 3 tests。 |
| RED | 新增 stale/lease contracts 后运行同命令 | 预期失败：`leaseTtlMs` / `recovered_stale_task_ids` 未实现，证明测试先于实现。 |
| GREEN | `npm test -- --runInBand tests/v8/v8_daemon_tick_loop.test.ts` | passed：1 suite / 6 tests。 |

## 验证命令与结果

| 命令 | 结果 |
|---|---|
| `npm test -- --runInBand tests/v8/v8_daemon_tick_loop.test.ts` | passed：1 suite / 6 tests。 |
| `npx prisma validate` | passed：schema valid。 |
| `npm run build` | passed：`tsc` exit 0。 |
| `npm test -- --runInBand tests/v8` | passed：12 suites / 48 tests。 |
| `git diff --check` | passed：no output。 |
| source denylist：`grep -R "better-sqlite3\|sqlite3\|data/nexus.db\|prisma/data/nexus.db\|\$queryRaw\|\$executeRaw" src/daemon/v8_tick_loop.ts tests/v8/v8_daemon_tick_loop.test.ts \|\| true` | 仅命中测试中的 denylist regex 字符串；生产 daemon 文件无 direct SQLite / ignored DB / raw query。 |
| pollution scan：`git status --short --untracked-files=all \| grep -E '(^\|/)(dist\|node_modules)(/\|$)\|\.db(-wal\|-shm)?$\|\.sqlite(3)?$\|secret\|\.env\|proof.*\.json\|test_proof.*\.json' \|\| true` | no output。 |
| tracked pollution：`git ls-files data prisma/data dist src/webui/dist '*.db' '*.sqlite' '*.sqlite3' 'proof*.json' '*proof*.json' '.env' '*.env' \|\| true` | no output。 |

## 剩余风险

1. 当前 lease 持久化复用 run `result_summary` JSON，属于 R4 最小实现；后续如增加专门 lease 字段/表，需要迁移为强结构存储。
2. stale takeover 阈值默认 30 分钟、lease TTL 默认 15 分钟，可通过构造参数注入测试；生产配置化/多 daemon 分布式锁属于后续 resident/runtime integration 卡。
3. 非 `pm_audit` completion auto-complete 仍是 daemon 内最小闭环，保留 R2 FSM 对 worker direct completion 的禁用；后续可抽到专用 runtime acceptance service，减少 daemon 内部写状态。
4. 未触碰真实 worker HTTP/Telegram；worker 必须在后续 integration 中回传 `lease_token` 才能通过 ingest。

## 下一阶段输入

- R4 后续 worker integration：dispatch payload 必须包含并保存 `lease_token`，completion result 必须原样回传 `lease_token` 与 `worker_run_id`。
- R4 resident/cron：将 `leaseTtlMs/staleRunMs` 接入 project-scoped config，避免硬编码运营参数。
- 后续 schema hardening：考虑给 Run 增加强结构 lease 字段，或将 lease 写入 Artifact/Run metadata，替代 `result_summary` 临时 JSON。
