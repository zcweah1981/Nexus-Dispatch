# PM Acceptance Report — Nexus Dispatch V8 RC1

任务：`nexus-v8-r9-t7-rc-report-tag`
RC 标记：`v8-rc1`
验证时间：`2026-05-09T23:35:18Z`（UTC，见验证日志）

## 1. 验收结论

**RC 候选结论：PASS（组级验收可用，带非阻断遗留观察）**

本报告覆盖 V8 R0-R9 当前本地工作区的 RC 验收汇总与等价 RC 标记；本卡未新增 Runtime API / daemon / review / report / cron / WebUI 业务语义，未触碰生产 DB / ignored SQLite / dist / node_modules / secrets / proof JSON / `.env`，未推送远端 GitHub。

## 2. 前置阅读与依据

已读取/校验以下 V8 总方案、边界与前序 proof：

- `docs/v8/README.md`：V8 clean rebuild baseline；R2+ 基于 Repository / Runtime API / FSM Controller。
- `docs/v8/legacy-test-classification.md`：legacy / keep / rewrite 测试边界。
- `docs/v8/legacy-dal-boundary.md`：legacy DAL 只读/archive；V8 主流程不得回退 direct SQLite / legacy DAL。
- `docs/v8/prisma-schema-boundary.md`：Prisma schema / Client 为 V8 主线数据层契约。
- `docs/v8/long-proof-r0-clean-rebuild-baseline.md`：R0 仓库与测试卫生基线。
- `docs/v8/long-proof-r9-t2-worker-proof-review-pass-e2e.md`：worker proof -> review PASS -> completed E2E。
- `docs/v8/long-proof-r9-t3-review-fail-retry-pass-e2e.md`：review FAIL -> retry -> PASS E2E。
- `docs/v8/long-proof-r9-t4-group-closeout-e2e.md`：group closeout -> next phase thaw E2E。
- `docs/v8/long-proof-r9-t5-cron-registry-isolation-smoke.md`：cron registry isolation smoke。
- `docs/v8/long-proof-r9-t6-daemon-restart-recovery-smoke.md`：daemon restart recovery smoke。

## 3. RC 覆盖范围

| 阶段 | 当前 RC 覆盖 | 依据 |
|---|---|---|
| R0 | clean rebuild baseline、legacy 隔离、Jest/TS/污染基线 | R0 proof |
| R1 | Prisma schema / Repository / legacy DAL boundary | R1 proof + boundary docs |
| R2 | Runtime API / FSM Controller / forbidden direct completed path | R2 proof |
| R3 | Blueprint freezer / current phase thaw / phase advance gates | R3 proof |
| R4 | daemon tick loop、worker dispatch、result ingest、timeout recovery | R4 proof |
| R5 | review policy、dynamic review task、PASS/FAIL/retry/loop-breaker | R5 proof |
| R6 | report lifecycle、visible message、dedupe/redaction/delivery proof | R6 proof |
| R7 | project cronjobs registry / runbook / watchdog prompt boundary | R7 proof |
| R8 | WebUI V8 display / artifact summary / SSE display boundaries | R8 proof |
| R9 | project-agent-blueprint-thaw + worker/review/group/cron/restart E2E | R9 proof |

## 4. 修改文件 / 标记

本卡新增/修改：

- `docs/v8/pm-acceptance-report-v8-rc1.md` — PM RC 验收报告。
- `docs/v8/long-proof-r9-t7-rc-report-tag.md` — 本任务 proof。
- `tests/v8/v8_daemon_tick_loop.test.ts` — 修正 R9-T6 audit trail 断言：不再依赖 `run_id` 字典序推断 original stale run，而按 `status='error'` 与 `error_stack contains timeout_recovery` 定位；这是 RC 验证中暴露的测试脆弱性修复。
- 本地 annotated tag：`v8-rc1`，指向 `5cf75df765d7e95ff19c2f541498a3cfba815bb9`；未 push。

## 5. 验证命令与结果

验证日志：

- `/tmp/nexus-v8-r9-t7-rc-report-tag-verify.log`
- 行数：`174`
- SHA256：`2e5a124401a7047faf8d81777471ac060e9d33fd2def66d9ff2fbc1a41f02c7b`
- Summary：`/tmp/nexus-v8-r9-t7-rc-report-tag-summary.md`

| 命令/检查 | 结果 |
|---|---|
| `npm test -- --runInBand tests/v8` | PASS：21 suites / 100 tests。 |
| `npm test -- --runInBand tests/v8/v8_project_agent_blueprint_e2e.test.ts tests/v8/v8_daemon_tick_loop.test.ts` | PASS：2 suites / 18 tests。 |
| `npx prisma validate` | PASS：schema valid。 |
| `npm run build` | PASS：root `tsc`。 |
| `npm --prefix src/webui run build` | PASS：Vite build；生成物在 ignored `src/webui/dist`，未进入 git status。 |
| `git diff --check` | PASS：无 whitespace error。 |
| V8 source boundary scan | PASS：`v8_source_boundary_hits=[]`。 |
| V8 runtime route thin scan | PASS：`v8_runtime_route_forbidden_hits=[]`，slice `58..492`。 |
| pollution status scan | PASS：`pollution_status_hits=[]`。 |
| tracked pollution scan | PASS：`tracked_pollution_hits=[]`。 |
| `git show --no-patch v8-rc1` | PASS：tag 存在并指向 HEAD `5cf75df765d7e95ff19c2f541498a3cfba815bb9`。 |

## 6. RC 标记策略

- 使用本地 annotated tag：`v8-rc1`。
- 不执行 `git push` / 不修改远端 GitHub。
- 当前工作区存在前序 R4-R9 累积 dirty/untracked WIP，tag 只能标记当前 HEAD；未提交 WIP 通过本报告/proof 文件、验证日志与 git status 作为 RC workspace evidence，而不是远端发布物。

## 7. 剩余风险 / 非阻断观察

1. 当前仓库进入 R9-T7 前已有大量前序 R4-R9 dirty/untracked WIP；本卡只生成 RC 验收报告、修正一个 R9-T6 测试脆弱断言、创建本地 RC 标记，不重写前序实现。
2. `v8-rc1` 本地 tag 指向 HEAD，不能包含未提交 WIP 文件；若需要远端可复现 release，应先由 PM 明确允许整理提交/推送策略。
3. legacy route observation scan 仍发现旧入口/旧 API 路由中的 direct DB/raw SQL 历史痕迹（例如 `src/api/index.ts`、`src/daemon/main.ts`、`src/api/routes.ts` legacy route slice）；V8 Runtime route slice 已单独验证 clean，按治理要求列为历史/legacy/未触碰非阻断观察。
4. 真实生产部署、systemd 长跑、真实 Telegram delivery、真实 cron scheduler adapter 仍应进入后续 R10+/ops 卡，不在本 RC 报告卡范围内。
5. R9 E2E 大多基于 temp Prisma DB / mock workerClient；这符合当前 V8 RC 的 contract smoke 边界，但不是生产环境 soak test。

## 8. 下一阶段输入

- R10+/ops：systemd 级 daemon restart smoke、健康检查、真实部署 runbook。
- Release hygiene：如需公开发布，先冻结/提交当前 WIP，再创建可复现 tag，并由 PM 明确 remote push 权限。
- Legacy route retirement：旧 `/tasks/*` direct DB/raw SQL route 与旧 default DB path 应单独排期迁移/删除，避免和 V8 runtime slice 混淆。
- WebUI/API alignment：旧 `/api/v1/tasks` 图数据与 artifact proof summary 可继续按 R8 风险项补齐。
