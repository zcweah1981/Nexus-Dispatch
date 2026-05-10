# Long Proof — V8-R5-T6 Review FAIL Loop Breaker

任务：`nexus-v8-r5-t6-loop-breaker`

范围：仅在 R5 review FAIL / CHANGES_REQUESTED closeout 中增加二次 fail loop breaker：第一次 reviewer fail 仍按 R5-T5 回到 `retry_ready`；若同一原任务已发生过一次返工（`retry_count >= 1`）且尚未耗尽 `max_retries`，第二次 fail 不继续自动返工循环，而是通过 R2 `transitionTask(event='block')` 进入 `blocked`，在 review bridge proof 中标记 `gate='pm_gate'` / `loop_breaker=true`，交由 PM gate。未进入 PM final decision、WebUI、真实 Telegram 投递、生产/ignored SQLite 迁移或 R6 实现。

## 前置阅读

- `docs/v8/README.md` — V8 clean rebuild baseline；R2+ 主线必须基于 Repository / Runtime API / FSM Controller。
- `docs/v8/legacy-dal-boundary.md` — legacy DAL 只读/archive；V8 review/report 等主流程不得回退到 `src/db/dal.ts`、`better-sqlite3` 或 ignored DB。
- `docs/v8/prisma-schema-boundary.md` — Prisma schema / Client 是 V8 主线数据层契约。
- `docs/v8/long-proof-r0-clean-rebuild-baseline.md`。
- R5 前序 proof：
  - `docs/v8/long-proof-r5-review-policy-table.md`
  - `docs/v8/long-proof-r5-dynamic-review-task.md`
  - `docs/v8/long-proof-r5-review-pass-closure.md`
  - `docs/v8/long-proof-r5-review-fail-retry-deadletter.md`

## 修改文件

- `src/daemon/v8_tick_loop.ts`
  - 在 `closeFailedReview()` 中增加 `secondFail = !exhausted && originalTask.retry_count >= 1` 判定。
  - 第二次 fail 的 outcome 改为 `blocked`，原任务仍先 project-scoped 更新 `retry_count`，再通过 `transitionTask(event='block')` 进入 `blocked`。
  - review bridge `rework_json` 写入 `gate='pm_gate'`、`loop_breaker=true`、`retry_count/max_retries/outcome`。
  - tick detail 输出 `review-fail-loop-breaker:<original>:<review>`，便于 runtime proof / reviewer grep。
- `tests/v8/v8_review_policy.test.ts`
  - 新增 fail-first contract：原任务 `retry_count=1,max_retries=3` 时，review task 再次提交 `changes-requested` 后，原任务进入 `blocked` 而不是 `retry_ready`；review task 自身 completed；review bridge `changes_requested` 且写入 PM gate/loop breaker proof；跨项目同形 review row 不受影响。
- `docs/v8/long-proof-r5-t6-loop-breaker.md`
  - 本 proof 文档。

工作区中进入本卡前已有 R4/R5 untracked proof 文档与 R5 累计 diff；本卡主审范围应聚焦上述 T6 loop breaker 增量。

## TDD 记录

| 阶段 | 命令 | 结果 |
|---|---|---|
| RED | `npm test -- --runInBand tests/v8/v8_review_policy.test.ts --testNamePattern "loop breaker"` | failed：新增测试期望 `review-fail-loop-breaker`，旧实现返回 `review-fail-retry`，证明二次 fail 仍会进入自动返工循环。 |
| GREEN | `npm test -- --runInBand tests/v8/v8_review_policy.test.ts --testNamePattern "loop breaker"` | passed：1 test。 |
| Focused FAIL regression | `npm test -- --runInBand tests/v8/v8_review_policy.test.ts --testNamePattern "reviewer FAIL|loop breaker"` | passed：3 tests，覆盖第一次 fail retry、第二次 fail block、耗尽预算 dead_letter。 |

## 验证命令与结果

| 命令 | 结果 |
|---|---|
| `npm test -- --runInBand tests/v8/v8_review_policy.test.ts --testNamePattern "loop breaker"` | passed：1 test。 |
| `npm test -- --runInBand tests/v8/v8_review_policy.test.ts --testNamePattern "reviewer FAIL|loop breaker"` | passed：3 tests。 |
| `npm test -- --runInBand tests/v8/v8_review_policy.test.ts` | passed：1 suite / 11 tests。 |
| `npm test -- --runInBand tests/v8/v8_fsm_state_matrix.test.ts` | passed：1 suite / 4 tests。 |
| `npm test -- --runInBand tests/v8` | passed：13 suites / 64 tests。 |
| `npx prisma validate` | passed。 |
| `npm run build` | passed。 |
| `git diff --check` | passed。 |
| source boundary grep on changed files | passed：未命中 `src/db/dal` / `better-sqlite3` / `sqlite3` / ignored DB / Prisma raw SQL。 |
| forbidden direct completed write grep | passed：未发现 daemon 直接写 `Task.status='completed'`。 |
| pollution status/tracked scan | passed：未发现 DB、dist、node_modules、secrets、proof JSON、`.env` 污染；现有 `.env.example` allowlist 未计入污染。 |

完整验证日志：

- `/tmp/nexus-v8-r5-t6-loop-breaker-verify.log` — 176 lines，sha256 `09c484d5df08c043d7d47c35372383f64bae289c15a71c5620ede0508f0d5a85`。
- `/tmp/nexus-v8-r5-t6-loop-breaker-summary.md` — sidecar summary，`exit_status=0`。

## 已实现内容

1. R5 review FAIL closeout 形成三段式终局：
   - 第一次 fail：`review_pending -> retry_ready`，`retry_count + 1`。
   - 第二次 fail（`retry_count >= 1` 且未耗尽）：`review_pending -> blocked`，标记 `pm_gate` / `loop_breaker`。
   - 已耗尽预算：`review_pending -> dead_letter`。
2. review task 自身仍通过 `transitionTask(request_review)` + `transitionTask(review_pass)` 完成，语义是“审核任务已闭合”，不表示原任务通过。
3. 所有原任务状态变化继续走 R2 `transitionTask()` / FSM Controller；未直接写 terminal status。
4. 所有 task/review 查询与更新按 `project_id` 分区，新增 contract 覆盖跨项目同形 review row 不受影响。

## 剩余风险

- 本卡只把二次 fail 挡入 `blocked` / PM gate，不实现 PM 在 gate 后的 pass/fail/retry 决策 UI/API，也不发送真实 Telegram 通知。
- 当前 loop breaker 以原任务 `retry_count >= 1` 判断“二次 fail”；若后续需要按 review bridge 历史次数、具体 reviewer 或失败项粒度计数，应在 R6/R7 另卡扩展。
- 工作区仍有前序 R4/R5 proof 文档未跟踪，本卡未清理或接管。

## R6 输入

- R6 可消费原任务 `proof_data.proof.gate='pm_gate'`、`proof_data.proof.outcome='blocked'`，以及 `reviews.rework_json.loop_breaker=true` / `gate='pm_gate'` / `retry_count` / `max_retries`。
- R6 PM gate 应定义 blocked 后的显式操作：PM override retry、PM dead_letter、PM accept exception，且仍必须通过 Runtime API/service/FSM Controller。
- Reviewer 主审本卡时可聚焦：`review-fail-loop-breaker:*` detail、`block` transition proof、project-scoped bridge update 与跨项目隔离 contract。
