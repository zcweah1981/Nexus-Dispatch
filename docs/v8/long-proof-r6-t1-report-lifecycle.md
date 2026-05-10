# Long Proof — V8-R6-T1 completion_reports lifecycle

任务：`nexus-v8-r6-t1-report-lifecycle`

范围：仅实现/收紧 V8 completion report（当前 Prisma `Report` / DB `reports`，调度语义对应 completion_reports 队列）的状态生命周期；不进入真实 Telegram delivery、PM final decision、WebUI、生产/ignored SQLite 迁移或后续 R6 子任务。

## 前置阅读

已阅读并按边界执行：

- `docs/v8/README.md` — V8 clean rebuild baseline 与 R1+ 主线边界。
- `docs/v8/long-proof-r0-clean-rebuild-baseline.md` — R0 测试/仓库/契约边界与 DB 污染限制。
- `docs/v8/legacy-dal-boundary.md` — legacy DAL 只读/archive；V8 report 主流程不得回退 `src/db/dal.ts` / direct SQLite。
- `docs/v8/prisma-schema-boundary.md` — Prisma schema / Client 是 V8 主线数据层契约。
- R2 proof：`docs/v8/long-proof-r2-transition-task-service.md` — 状态变化需走 service/FSM boundary。
- R4/R5 proof：result ingest exactly-once、review PASS/FAIL/loop-breaker proof，确认 R6 输入只接 report lifecycle，不越级。

## 修改文件

本卡新增/修改：

- `src/repositories/v8.ts`
  - `ReportRepository.create()` 校验初始 status 必须属于 V8 report FSM 状态。
  - `ReportRepository.updateStatus()` 按 `project_id + report_id` 读取后调用 `assertV8TransitionAllowed('report', from, to)`，禁止 `pending -> sent`、`sent -> pending` 等跳跃/回退。
  - 保持写入通过 Prisma Repository，未引入 direct SQL/legacy DAL。
- `src/services/v8_runtime_api_service.ts`
  - 将 report lifecycle 非法迁移映射为 Runtime API `409 ILLEGAL_TRANSITION`。
  - 未知 report status 映射为 `400 BAD_REQUEST`。
- `tests/v8/v8_repositories.test.ts`
  - 增加 fail-first contract：`pending -> sent` 必须失败；合法链路为 `pending -> sending -> sent`；terminal `sent -> pending` 失败；跨项目更新仍失败。
- `tests/v8/v8_runtime_api_route_boundary.test.ts`
  - 增加 Runtime API contract：`PATCH /runtime/reports/:id/status` 对 `pending -> sent` 返回 409，合法 `sending -> sent` 返回 200。
- `docs/v8/long-proof-r6-t1-report-lifecycle.md`
  - 本 proof 文件。

进入本卡前工作区已有 R4/R5 累计 diff/untracked proof 文档；本卡主审范围应聚焦上述 R6 report lifecycle 文件。

## TDD 记录

| 阶段 | 命令 | 结果 |
|---|---|---|
| RED | `npm test -- --runInBand tests/v8/v8_repositories.test.ts tests/v8/v8_runtime_api_route_boundary.test.ts --testNamePattern "ReportRepository|projects/tasks/runs/reports"` | failed：Repository 允许 `pending -> sent`，API 返回 200；证明 lifecycle 未被 Repository/API 强制执行。 |
| GREEN | 同上 | passed：2 suites / 2 focused tests；Repository 走 FSM，API 非法迁移映射 409。 |
| Regression | `npm test -- --runInBand tests/v8/v8_fsm_state_matrix.test.ts tests/v8/v8_repositories.test.ts tests/v8/v8_runtime_api_route_boundary.test.ts tests/v8/v8_daemon_tick_loop.test.ts` | passed：4 suites / 22 tests。 |

## 验证命令与结果

完整验证日志：`/tmp/nexus-v8-r6-t1-report-lifecycle-verify.log`

- 行数/SHA：`62 /tmp/nexus-v8-r6-t1-report-lifecycle-verify.log`；`a3600bd8e84d9b5d6345e94eb3ab611ae4fc62a28992001b6ba2c027936315d2`。
- Summary：`/tmp/nexus-v8-r6-t1-report-lifecycle-summary.md`。
- 追加 hygiene diff/source log：`/tmp/nexus-v8-r6-t1-report-lifecycle-final-hygiene.log`；`147` lines；`63a1d2bae2ed9f02ec1363fd60e01527c3a30804e5fe3a1aeef78c510fbb8e72`。

| 命令 | 结果 |
|---|---|
| `npx prisma validate` | passed：schema valid。 |
| `npm test -- --runInBand tests/v8/v8_repositories.test.ts tests/v8/v8_runtime_api_route_boundary.test.ts --testNamePattern "ReportRepository|projects/tasks/runs/reports"` | passed：2 suites / 2 focused tests。 |
| `npm test -- --runInBand tests/v8/v8_fsm_state_matrix.test.ts tests/v8/v8_repositories.test.ts tests/v8/v8_runtime_api_route_boundary.test.ts tests/v8/v8_daemon_tick_loop.test.ts` | passed：4 suites / 22 tests。 |
| `npm run build` | passed。 |
| `git diff --check` | passed，无 whitespace error。 |
| source boundary scan（R6 production files） | passed：`src/repositories/v8.ts`、`src/services/v8_runtime_api_service.ts` 未命中 legacy DAL / direct SQLite / ignored DB / Prisma raw SQL。测试文件中的 denylist 字符串仅为既有 source-boundary regex assertion。 |
| pollution scan | passed：`pollution_status_hits=[]`，`tracked_pollution_hits=[]`。 |

环境噪声：shell 启动时输出 `/root/.openclaw/completions/openclaw.bash: No such file or directory`，验证命令 exit 0。

## 已实现内容

1. completion report 创建时只能使用 V8 report FSM 已知状态：`pending/sending/sent/suppressed/error`。
2. completion report 状态更新必须按 `project_id` 读取报告并通过 FSM：
   - 合法：`pending -> sending -> sent`、`pending -> suppressed`、`sending -> error/suppressed`、`error -> pending/suppressed`。
   - 非法：`pending -> sent`、terminal `sent -> pending` 等跳跃/回退。
3. Runtime API 对非法 report transition 返回 `409 ILLEGAL_TRANSITION`，避免把 lifecycle 错误误报为 404。
4. 既有 daemon result ingest 创建 `agent_result` report 保持 `pending`，后续 delivery worker 必须显式推进到 `sending` 再 `sent`。
5. 所有新增逻辑继续走 Prisma Repository / Runtime API service；无生产 DB、ignored SQLite、proof JSON、dist/node_modules/secrets/.env 污染。

## 剩余风险

1. Prisma schema 注释仍写 `failed`，而 V8 FSM/API 当前使用 `error`；本卡未做 schema/comment/API enum 清理，建议后续单独统一 report status 词表。
2. 真实 Telegram/report delivery worker 尚未实现；本卡只提供 lifecycle guard，不负责实际发送/重试调度。
3. 工作区存在进入本卡前的 R4/R5 累计 diff/untracked proof，非本卡新增阻塞；Reviewer 主审需聚焦 R6 相关 diff/proof。

## 下一阶段输入

- R6 后续 delivery/PM audit 阶段应调用 `updateReportStatus(project_id, report_id, 'sending')` 取得发送锁，再根据结果推进 `sent` 或 `error`，不得从 `pending` 直接置 `sent`。
- 后续如果要使用表名 `completion_reports`，需单独做 schema/model rename/migration 卡；当前 V8 Prisma 模型为 `Report @@map("reports")`，本卡按现有主线收紧 completion report lifecycle。
