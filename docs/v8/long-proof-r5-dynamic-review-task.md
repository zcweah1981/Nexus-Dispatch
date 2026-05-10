# Long Proof — V8-R5-T2 Dynamic Review Task

任务：`nexus-v8-r5-t2-dynamic-review-task`

范围：仅强化 R5 daemon 动态生成 review task 的输入快照：按原任务 `lane_required / acceptance_mode / reviewer / acceptance_criteria` 和 R5-T1 review policy evaluator 结果生成 review task / review bridge proof。未进入 reviewer verdict 解析、PM final decision、WebUI、真实 Telegram 投递、生产/ignored SQLite 迁移。

## 前置阅读

- `docs/v8/README.md` — V8 clean rebuild baseline、R1 单一数据层主线。
- `docs/v8/long-proof-r0-clean-rebuild-baseline.md` — R0 baseline proof。
- `docs/v8/legacy-test-classification.md` — legacy/keep/rewrite 测试边界。
- `docs/v8/legacy-dal-boundary.md` — legacy DAL 退场边界。
- `docs/v8/prisma-schema-boundary.md` — Prisma schema 单一主线边界。
- `docs/v8/long-proof-r1-legacy-dal-boundary.md` — R1 legacy boundary proof。
- `docs/v8/long-proof-r2-transition-task-service.md` — R2 FSM/service 状态边界。
- `docs/v8/long-proof-r3-thaw-current-phase.md` — R3 thaw 当前阶段边界。
- `docs/v8/long-proof-r4-stale-takeover-lease.md` — R4 daemon/lease 边界。
- `docs/v8/long-proof-r5-review-policy-table.md` — R5-T1 review policy table/evaluator 前置 proof。

## 修改文件

- `src/daemon/v8_tick_loop.ts`
  - 新增 `parseJsonStringArray()`，安全解析原任务 `acceptance_criteria`。
  - `spawnReviewTasks()` 为 review task payload 写入 `source_task` 快照：`task_id / lane_required / acceptance_mode / requested_reviewer / acceptance_criteria`。
  - review task `acceptance_criteria` 动态包含原任务 lane、acceptance mode、requested reviewer 与原 AC，再追加 reviewer 显式 PASS/FAIL proof 要求。
  - `reviews.rework_json` 同步写入 `source_task` 快照，与 R5-T1 的 `review_policy`/`policy_source` 一起形成 bridge proof。
- `tests/v8/v8_review_policy.test.ts`
  - 新增 fail-first contract：daemon 动态生成 review task 时必须按原任务 lane/acceptance_mode/reviewer/AC 写入 review task payload、AC 与 review bridge。
- `docs/v8/long-proof-r5-dynamic-review-task.md`
  - 本 proof 文件。

## TDD 记录

| 阶段 | 命令 | 结果 |
| --- | --- | --- |
| RED | `npm test -- --runInBand tests/v8/v8_review_policy.test.ts` | failed：新增测试期望 `payload.source_task`，旧实现只写入 `original_task_id/reviewer/review_policy`，证明动态源任务快照缺失。 |
| GREEN | `npm test -- --runInBand tests/v8/v8_review_policy.test.ts` | passed：1 suite / 5 tests。 |

## 验证命令与结果

| 命令 | 结果 |
| --- | --- |
| `npm test -- --runInBand tests/v8/v8_review_policy.test.ts` | passed：1 suite / 5 tests。 |
| `npm test -- --runInBand tests/v8/v8_review_policy.test.ts tests/v8/v8_daemon_tick_loop.test.ts` | passed：2 suites / 16 tests。 |
| `npx prisma validate` | passed：`prisma/schema.prisma` valid。 |
| `npm run build` | passed：`tsc` exit 0。 |
| `git diff --check` | passed：无 whitespace error。 |
| source boundary grep (`src/daemon/v8_tick_loop.ts`, `src/review/v8_review_policy.ts`) | passed：未命中 `src/db/dal` / `better-sqlite3` / `sqlite3` / ignored DB / Prisma raw SQL。 |
| pollution status/tracked scan | passed：无 DB、dist、node_modules、secrets、proof JSON、`.env` 污染；`.env.example` 为 tracked allowlist。 |

完整验证日志：

- `/tmp/nexus-v8-r5-t2-dynamic-review-task-verify.log` — 84 lines，sha256 `bc40bb7ea87a15afafdddbcdc511334d47b97d4c85cc5b62db24da64903958aa`。
- `/tmp/nexus-v8-r5-t2-dynamic-review-task-summary.md` — sidecar summary，记录 exit_status=0 / line count / sha256。

环境噪声：shell 启动时输出 `/root/.openclaw/completions/openclaw.bash: No such file or directory`，但验证 bundle exit_status=0。

## 已实现内容

1. pm_audit 原任务进入 `completion_pending` 后，daemon 仍只通过 R2 `transitionTask(event='request_review')` 推进到 `review_pending`。
2. review task 动态携带原任务的 lane、acceptance_mode、requested reviewer 和原 AC，Reviewer 可直接主审本次 diff/proof，不需要从历史上下文推断。
3. reviewer 路由继续沿用 R5-T1 evaluator：`agent_override -> lane_override -> project_default -> fallback`；本卡只补齐 review task/bridge 输入快照。
4. 所有新增查询/写入仍在当前 `project_id` 内，未接触生产 DB、ignored SQLite、dist、node_modules、secrets、proof JSON 或 `.env`。

## 剩余风险

- 本卡不处理 reviewer PASS/FAIL verdict 解析、PM final decision 或返工 loop breaker；后续 R5 卡可消费 `payload.source_task` 与 `rework_json.source_task`。
- 当前工作区在进入本卡前已有未跟踪 R4 proof 文档；本卡未修改这些文件。

## 下一阶段输入

- Review verdict / PM audit 阶段可读取：
  - review task `payload.review_policy` / `payload.source_task`
  - review bridge `rework_json.policy_source` / `rework_json.policy_id` / `rework_json.source_task`
- Reviewer 可用动态 AC 判断原任务范围与本次 proof 是否满足。 
