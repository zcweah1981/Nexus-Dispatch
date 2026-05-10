# Long Proof — V8-R9-T5 cron registry isolation smoke

任务：`nexus-v8-r9-t5-cron-registry-isolation-smoke`

范围：仅补齐 R9-T5 daemon smoke 合同，证明 V8 daemon tick 不会因为 `project_cronjobs` registry 中存在 active cronjob 而自动启动/暂停/停止/更新 cronjob，也不会跨项目触碰同名 cronjob。未进入真实 Hermes cron scheduler、Telegram session 自动启停、WebUI、生产/ignored SQLite 或后续阶段。

## 前置阅读

- `docs/v8/README.md` — V8 clean rebuild 主线约束。
- `docs/v8/legacy-test-classification.md` — V8 默认验证与 legacy 边界。
- `docs/v8/legacy-dal-boundary.md` — Cron Registry 不得回退 legacy DAL/direct SQLite。
- `docs/v8/prisma-schema-boundary.md` — Prisma schema / Client 为 V8 主线数据层契约。
- `docs/v8/long-proof-r7-t1-cronjobs-schema-api.md` — `project_cronjobs` registry project-scoped schema/API/service/repository 输入。
- `docs/v8/long-proof-r7-t4-watchdog-template.md` — watchdog/patrol prompt 只读边界。
- `docs/v8/long-proof-r7-t5-ops-runbook.md` — cron/watchdog 只能按 registry 选择，不自动启停。
- `docs/v8/long-proof-r9-t2-worker-proof-review-pass-e2e.md`、`long-proof-r9-t3-review-fail-retry-pass-e2e.md`、`long-proof-r9-t4-group-closeout-e2e.md` — R9 daemon E2E 前序输入。

## 修改文件

本卡 task-scoped 修改：

- `tests/v8/v8_daemon_tick_loop.test.ts`
  - 新增 `R9-T5 daemon smoke keeps project_cronjobs registry isolated and never starts or mutates cronjobs`。
  - 在 temp Prisma DB 中 seed 两个 project 的同名 active `project_cronjobs`：当前 project 与 cross-project sentinel。
  - 运行一次 `V8DaemonTickLoop.tick()`，断言：
    - 无 task claim/dispatch/ingest/review/closeout。
    - worker `dispatch` 未调用。
    - 当前 project 与另一个 project 的同名 cronjob 均保持 `status='active'`、`last_run_at=null`、`config_json` 未改。
    - 未创建 cron 相关 report/artifact。
  - 扩展 source guard：`src/daemon/v8_tick_loop.ts` 不得出现 `cronjob.start/stop/pause/resume`、`startCronjob/stopCronjob/pauseCronjob/resumeCronjob` 或 `updateCronjobStatus(` 调用。
- `docs/v8/long-proof-r9-t5-cron-registry-isolation-smoke.md`
  - 本 proof 文档。

## TDD 记录

| 阶段 | 命令 | 结果 |
|---|---|---|
| RED | `npm test -- --runInBand tests/v8/v8_daemon_tick_loop.test.ts -t 'R9-T5'` | 失败：新合同断言 `result.closeout` 形状少计 `count: 0`，测试捕获了 daemon 返回的实际 closeout 结构，证明新增 smoke 合同被执行。 |
| GREEN | `npm test -- --runInBand tests/v8/v8_daemon_tick_loop.test.ts -t 'R9-T5'` | PASS：1 passed，cron registry 行保持隔离且无自动 cron lifecycle mutation。 |

## 验证命令与结果

首次 bundle 因 source-boundary scan 把测试内 intentional denylist regex literal 当作命中而失败；已保留为 traceability，并用 production-source-only corrected scan 重跑。

最终完整验证日志：

- `/tmp/nexus-v8-r9-t5-cron-registry-isolation-smoke-verify2.log`
- 行数：`217 /tmp/nexus-v8-r9-t5-cron-registry-isolation-smoke-verify2.log`
- SHA256：`4ebfb0a096d46a3d876d034c5a93a5030a0c216647751d4824bf641de98ec647`
- Summary：`/tmp/nexus-v8-r9-t5-cron-registry-isolation-smoke-summary2.md`

通过命令：

```bash
npm test -- --runInBand tests/v8/v8_daemon_tick_loop.test.ts -t 'R9-T5|no direct cron lifecycle mutation'
npm test -- --runInBand tests/v8/v8_daemon_tick_loop.test.ts
npm test -- --runInBand tests/v8/v8_repositories.test.ts tests/v8/v8_runtime_api_route_boundary.test.ts tests/v8/v8_watchdog_prompt_template.test.ts --testNamePattern 'ProjectCronjobRepository|projects/tasks/runs/reports Runtime routes|watchdog|patrol'
npm test -- --runInBand tests/v8
npx prisma validate
npm run build
git diff --check
python3 production source boundary scan
python3 cron lifecycle mutation scan
python3 thin route cron scan
python3 pollution status scan
```

结果摘要：

- Focused R9-T5：2 passed（R9-T5 smoke + source guard）。
- `tests/v8/v8_daemon_tick_loop.test.ts`：15 passed。
- cron registry repository/API/prompt slice：3 suites passed / 5 passed / 7 skipped。
- `tests/v8`：21 suites passed / 99 tests passed。
- `npx prisma validate`：valid。
- `npm run build`：`tsc` 通过。
- `git diff --check`：通过。
- production source boundary scan：`production_source_boundary_hits=[]`。
- test source note：`test_contains_intentional_denylist_literals=True`（仅测试 guard 字符串，不是生产源违规）。
- daemon cron lifecycle scan：`daemon_cron_lifecycle_hits=[]`。
- thin route cron scan：`thin_route_forbidden_hits=[]`，`service_calls=True`。
- pollution status scan：`pollution_status_hits=[]`。

## 剩余风险 / 非阻断观察

- 当前仓库进入本卡前已有大量 R4/R5/R6/R7/R8/R9 相关 dirty/untracked WIP；本卡主审范围仅为 `tests/v8/v8_daemon_tick_loop.test.ts` 的 R9-T5 smoke/source guard 与本 proof 文档。历史/legacy/未触碰文件问题按治理要求只列为非阻断观察。
- 本卡只证明 daemon smoke 不自动触发 cron lifecycle；真实 Hermes cron scheduler adapter、Telegram session selector 与 registry 的端到端启停治理仍应由后续专卡实现。
- `project_cronjobs.status='active'` 仍只是 registry 状态，不代表后台 cronjob 已启动。

## 下一阶段输入

- 后续 cron scheduler/worker 必须先按 `project_id + cronjob_id` 读取 `project_cronjobs` registry，并只选择同项目 eligible cronjob。
- Telegram session 只能选择当前 project，不得作为自动启停后台 cronjob 的触发器。
- 若要实现真实 cron backend，应单独增加 adapter 合同：registry ownership 校验、project partition、manual/active/paused/disabled 映射、以及不跨项目启动同名 job。
