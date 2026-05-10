# Long Proof — V8-R5-T4 Review PASS Closure

任务：`nexus-v8-r5-t4-review-pass-closure`

范围：仅闭环 R5 review PASS 后的原任务终局：daemon review step 读取同项目 active review bridge 与 reviewer task 的显式 PASS proof，通过 R2 `transitionTask()` / FSM 关闭 review task 与 original pm_audit task，并将 review bridge 标记为 `passed`。未进入 FAIL/返工 redispatch、PM final decision、WebUI、真实 Telegram 投递、生产/ignored SQLite 迁移或后续阶段。

## 前置阅读

已按调度要求阅读/复核：

- `docs/v8/README.md` — V8 clean rebuild baseline；R2+ 主线必须基于 Repository / Runtime API / FSM Controller。
- `docs/v8/legacy-test-classification.md` — legacy/keep/rewrite 边界。
- `docs/v8/legacy-dal-boundary.md` — legacy DAL 只读/archive；V8 review/report 等主流程不得回退到 `src/db/dal.ts`、`better-sqlite3` 或 ignored DB。
- `docs/v8/prisma-schema-boundary.md` — Prisma schema / Client 是 V8 主线数据层契约。
- `docs/v8/long-proof-r0-clean-rebuild-baseline.md`。
- `docs/v8/long-proof-r2-transition-task-service.md` — `transitionTask(project_id, task_id, event, proof)` 的 project-scoped FSM 边界。
- `docs/v8/long-proof-r3-thaw-current-phase.md`。
- `docs/v8/long-proof-r4-timeout-recovery.md`。
- `docs/v8/long-proof-r5-review-policy-table.md` — R5-T1 review policy / evaluator 输入。
- `docs/v8/long-proof-r5-dynamic-review-task.md` — R5-T2 review task/source snapshot 输入。

## 修改文件

本卡相关实现/测试文件：

- `src/daemon/v8_tick_loop.ts`
  - 新增/保留 `closePassedReviews()`：在 `spawnReviewTasks()` 前扫描当前 `project_id` 下 `reviews.status in ['created','dispatched','running']` 且有 `review_task_id` 的 bridge。
  - 仅当同项目 review task 处于 `completion_pending` 且 `proof_data/payload/objective/title` 中可解析出显式 PASS verdict 时闭环。
  - review task closure 走 `transitionTask(event='request_review')` 再 `transitionTask(event='review_pass')`，避免绕过当前 FSM。
  - original task closure 走 `transitionTask(event='review_pass')`，要求原任务处于 `review_pending`。
  - review bridge 用 project-scoped `updateMany({ project_id, id })` 标记 `status='passed'`，并写入 `rework_json.verdict='pass'` / `closed_by='v8_daemon_tick_loop'`。
  - step detail 输出 `review-pass-closed:<original_task_id>:<review_task_id>`，方便 tick proof grep。
- `tests/v8/v8_review_policy.test.ts`
  - 新增/保留 contract：`daemon closes original pm_audit task when reviewer task submits PASS proof`。
  - 种子包含 Project A 原任务 `review_pending`、review task `completion_pending` + structured PASS proof、active review bridge；Project B 同形 PASS 行用于证明 cross-project row untouched。
  - 断言 Project A original/review task 均 `completed`，`proof_data.event='review_pass'`、`from_status='review_pending'`、`to_status='completed'`，且 `proof.target` 分别为 `original_task` / `review_task`。
  - 断言 Project A review bridge `passed`，Project B original/review bridge 保持 `review_pending` / `running`。
- `docs/v8/long-proof-r5-review-pass-closure.md`
  - 本 proof 文档。

当前工作区还存在前序 R4/R5 proof 文档 untracked，以及 R5-T1/R5-T2/R5-T3 在同一文件上的累计 diff；本卡主审范围应聚焦上述 `closePassedReviews()` 与对应 PASS closure contract。

## TDD / 实现记录

| 阶段 | 命令/证据 | 结果 |
| --- | --- | --- |
| Inspect | `git status --short --untracked-files=all`; `git diff --name-status`; grep `closePassedReviews/review-pass-closed/review_pass_closeout` | 当前树已包含 R5-T4 目标实现与 contract，无需制造重复代码 churn。 |
| GREEN | `npm test -- --runInBand tests/v8/v8_review_policy.test.ts` | passed：1 suite / 8 tests；包含 review PASS closure contract。 |
| Regression | `npm test -- --runInBand tests/v8/v8_review_policy.test.ts tests/v8/v8_daemon_tick_loop.test.ts` | passed：2 suites / 19 tests。 |
| V8 full slice | `npm test -- --runInBand tests/v8` | passed：13 suites / 61 tests。 |

## 验证命令与结果

| 命令 | 结果 |
| --- | --- |
| focused source grep (`closePassedReviews`, `review-pass-closed`, `review_pass_closeout`, project scope filters) | passed：hook 位于 `src/daemon/v8_tick_loop.ts`，bridge 查询/更新均包含 `project_id: this.options.project_id`。 |
| `npm test -- --runInBand tests/v8/v8_review_policy.test.ts` | passed：1 suite / 8 tests。 |
| `npm test -- --runInBand tests/v8/v8_review_policy.test.ts tests/v8/v8_daemon_tick_loop.test.ts` | passed：2 suites / 19 tests。 |
| `npm test -- --runInBand tests/v8` | passed：13 suites / 61 tests。 |
| `npx prisma validate` | passed：schema valid。 |
| `npm run build` | passed：`tsc` exit 0。 |
| `git diff --check` | passed。 |
| source boundary scan (`src/daemon/v8_tick_loop.ts`, `src/review/v8_review_policy.ts`) | passed：未命中 `src/db/dal` / `better-sqlite3` / `sqlite3` / `data/nexus.db` / `prisma/data/nexus.db` / `$queryRaw` / `$executeRaw`。 |
| completed direct-write source scan | passed：未命中 daemon 对 `Task.status='completed'` 的 Prisma direct-write pattern；completion 通过 `transitionTask()`。 |
| pollution status scan | passed：无 DB/dist/node_modules/secrets/proof JSON/.env 污染进入 status。 |

完整验证日志：

- `/tmp/nexus-v8-r5-t4-review-pass-closure-dispatch2-verify.log` — 181 lines，sha256 `6d7a5a2a4c6506e0eed9413112308f88ce174555f02d7bc1e0609cfd8cb2ba26`。
- `/tmp/nexus-v8-r5-t4-review-pass-closure-dispatch2-summary.md` — sidecar summary，记录 `exit_status=0` / line count / sha256。
- dispatch2 复验时间：2026-05-09T14:17:xxZ -> 2026-05-09T14:23:49Z。

## 已实现内容

1. review step 在生成新 review task 前优先闭环已有 PASS review bridge，避免 PASS 后继续重复派审。
2. PASS 判定要求 review task 为 `completion_pending` 且存在显式 PASS verdict；未给 verdict 仅记录 `review-waiting-verdict:*`，不会误闭环。
3. 负向 verdict 解析优先级高于正向 token；FAIL/changes_requested 仅标记 bridge `changes_requested`，返工派发仍留给后续卡。
4. review task 与 original task 的所有状态变化均通过 R2 `transitionTask()` / FSM，保留 structured proof 和 `task_transition_audit` 能力。
5. 所有 review/task 查询与更新按 `project_id` 分区，contract 已覆盖 cross-project PASS row 不受影响。

## 剩余风险

- FAIL / changes requested 的返工 redispatch、loop breaker 与 PM final decision 未在本卡实现；当前仅保守标记 `reviews.status='changes_requested'`。
- verdict parser 当前覆盖常见 structured keys 与文本 PASS/FAIL token；若后续 reviewer proof schema 固化，可收紧为 schema-first 校验。
- 当前工作区存在前序未提交 WIP/proof 文件；本 proof 已隔离说明，Reviewer 主审本卡 diff/proof 时应避免把历史/未触碰文件问题作为阻断。

## 下一阶段输入

- 后续 R5 FAIL/rework 卡可复用 `parseReviewVerdictFromTask()` 与 active review bridge scan，但需新增返工派发 contract。
- PM final decision / report 阶段可读取 original task `proof_data.proof.step='review_pass_closeout'`、review task `proof_data.proof.target='review_task'`、review bridge `rework_json.verdict='pass'` 作为完成证明。
- 若要暴露 WebUI/Runtime API 展示 review closure，应只读这些 structured proof 字段，用户可见正文继续脱敏 runtime IDs。
