# Long Proof — V8-R5-T5 Review FAIL / CHANGES_REQUESTED Retry & Dead Letter

任务：`nexus-v8-r5-t5-review-fail-retry-deadletter`

范围：仅处理 reviewer task 提交显式 `FAIL` / `CHANGES_REQUESTED` 后，原 `pm_audit` 任务按重试预算进入 `retry_ready` 或 `dead_letter` 的合同化返工闭环。未进入 PM final decision、WebUI、真实 Telegram 投递、生产/ignored SQLite 迁移或后续阶段。

## 前置阅读

已按调度要求阅读/复核：

- `docs/v8/README.md` — V8 clean rebuild baseline；R2+ 主线必须基于 Repository / Runtime API / FSM Controller。
- `docs/v8/long-proof-r0-clean-rebuild-baseline.md`。
- `docs/v8/legacy-test-classification.md`。
- `docs/v8/legacy-dal-boundary.md`。
- `docs/v8/prisma-schema-boundary.md`。
- R2 proof：`docs/v8/long-proof-r2-transition-task-service.md`。
- R3 proof：`docs/v8/long-proof-r3-thaw-current-phase.md`。
- R4 proof：`docs/v8/long-proof-r4-timeout-recovery.md`。
- R5 前序 proof：
  - `docs/v8/long-proof-r5-review-policy-table.md`
  - `docs/v8/long-proof-r5-dynamic-review-task.md`
  - `docs/v8/long-proof-r5-self-review-inactive-guard.md`
  - `docs/v8/long-proof-r5-review-pass-closure.md`

## 修改文件

本卡新增/修改：

- `src/daemon/v8_tick_loop.ts`
  - `parseReviewVerdict()` 支持 `changes_requested` / `changes-requested` / `changes requested` 作为 FAIL verdict，避免 snake_case verdict 被误判为无 verdict。
  - 新增 `closeFailedReview()`：当 review bridge 指向的 reviewer task 已 `completion_pending` 且 verdict 为 FAIL/CHANGES_REQUESTED：
    - review task 本身通过 `transitionTask(request_review)` + `transitionTask(review_pass)` 闭合为 `completed`，表示“审查任务已完成”，不表示原任务通过。
    - 原任务按 `retry_count < max_retries` 先 project-scoped 更新 `retry_count`，再通过 `transitionTask(event='retry')` 进入 `retry_ready`。
    - 原任务当 `retry_count >= max_retries` 通过 `transitionTask(event='dead_letter')` 进入 `dead_letter`。
    - review bridge project-scoped 更新为 `status='changes_requested'`，`rework_json` 写入 `verdict/outcome/retry_count/max_retries/closed_by`。
  - 所有状态变化继续走 R2 `transitionTask()` / FSM；未直接写 `completed`。
- `src/fsm/v8_state_matrix.ts`
  - 明确允许 `review_pending -> dead_letter`，用于 reviewer FAIL 且原任务重试预算耗尽的终局。
- `tests/v8/v8_review_policy.test.ts`
  - 新增 fail-first contracts：
    - `CHANGES_REQUESTED` 后原任务进入 `retry_ready`、`retry_count + 1`、review task completed、review bridge `changes_requested`，二次 tick 幂等不重复处理。
    - `FAIL` 且原任务 retry budget exhausted 后进入 `dead_letter`，跨项目同形 review row 不受影响。
- `tests/v8/v8_fsm_state_matrix.test.ts`
  - 增加 `review_pending -> dead_letter` FSM contract。
- `docs/v8/long-proof-r5-review-fail-retry-deadletter.md`
  - 本 proof 文档。

工作区中还存在进入本卡前已存在的 R4/R5 untracked proof 文档；本卡主审范围应聚焦上述 R5-T5 diff。

## TDD 记录

| 阶段 | 命令 | 结果 |
| --- | --- | --- |
| RED | `npm test -- --runInBand tests/v8/v8_review_policy.test.ts --testNamePattern "reviewer FAIL"` | 失败：`CHANGES_REQUESTED` 未识别；FAIL 仅将 bridge 标为 `changes_requested` 且 review task 被 auto-completed，原任务未进入 `retry_ready/dead_letter`。 |
| GREEN | `npm test -- --runInBand tests/v8/v8_review_policy.test.ts --testNamePattern "reviewer FAIL"` | passed：2 tests。 |
| FSM GREEN | `npm test -- --runInBand tests/v8/v8_fsm_state_matrix.test.ts` | passed：4 tests。 |

## 验证命令与结果

| 命令 | 结果 |
| --- | --- |
| `npm test -- --runInBand tests/v8/v8_review_policy.test.ts --testNamePattern "reviewer FAIL"` | passed：2 tests。 |
| `npm test -- --runInBand tests/v8/v8_review_policy.test.ts` | passed：1 suite / 10 tests。 |
| `npm test -- --runInBand tests/v8/v8_fsm_state_matrix.test.ts` | passed：1 suite / 4 tests。 |
| `npm test -- --runInBand tests/v8` | passed：13 suites / 63 tests。 |
| `npx prisma validate` | passed：schema valid。 |
| `npm run build` | passed：`tsc` exit 0。 |
| `git diff --check` | passed。 |
| source boundary scan on changed files | passed：未命中 `src/db/dal` / `better-sqlite3` / `sqlite3` / ignored DB / Prisma raw SQL。 |
| daemon direct completed write scan | passed：未命中 daemon 直接写 `Task.status='completed'`。 |
| pollution status/tracked scan | passed：无 DB、dist、node_modules、secrets、proof JSON、`.env` 污染；tracked scan 无输出。 |
| `npm test -- --runInBand` | passed：34 suites / 243 tests。 |

完整验证日志：

- `/tmp/nexus-v8-r5-t5-review-fail-retry-deadletter-verify-current.log` — 137 lines，sha256 `ccce8530c83e32a51057ac9b44f76fe879d4b4759c8ed82f7edf0e9f63c110b4`。
- `/tmp/nexus-v8-r5-t5-review-fail-retry-deadletter-summary-current.md` — sidecar summary，`exit_status=0`。
- `/tmp/nexus-v8-r5-t5-full-jest-current.log` — 81 lines，sha256 `c6f3bae789823d69607404d6547ed8a324c00d08af58707c047a3906afa4183e`。
- `/tmp/nexus-v8-r5-t5-full-jest-summary-current.md` — sidecar summary，`exit_status=0`。

环境噪声：shell 启动时输出 `/root/.openclaw/completions/openclaw.bash: No such file or directory`，但验证命令均 exit 0。

## 已实现内容

1. Reviewer FAIL / CHANGES_REQUESTED 已合同化返工：原任务进入 `retry_ready`，下一 tick 可由既有 claim path 重新派发。
2. 原任务 retry budget exhausted 时进入 `dead_letter`，不再被 claim/dispatch。
3. Review task 自身被关闭为 `completed`，避免同一个 reviewer verdict 在后续 tick 重复生效。
4. Review bridge 记录 `changes_requested` 与结构化 rework/outcome proof，便于 PM/Reviewer 后续审计。
5. 项目隔离已覆盖：跨项目 review row 不受当前 project tick 影响。

## 剩余风险

- 本卡不实现可见 Telegram 返工消息模板；返工细节目前进入 DB proof / review bridge。
- 本卡不实现 PM final decision 或人工 override；后续阶段可消费 `reviews.rework_json.outcome`。
- 返工重新派发复用既有 `retry_ready -> dispatched -> running` claim/dispatch 逻辑，未在本卡重复改 worker delivery。

## 下一阶段输入

- 后续 report/Telegram/WebUI 阶段可读取 `reviews.status='changes_requested'` 与 `reviews.rework_json.outcome/retry_count/max_retries` 展示返工/死信原因。
- 后续 PM final decision 可在 `dead_letter` 上追加人工恢复/取消策略，但不得绕过 `transitionTask()`。
