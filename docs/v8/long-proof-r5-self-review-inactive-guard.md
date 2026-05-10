# Long Proof — V8-R5-T3 Self-review / Inactive Reviewer Guard

任务：`nexus-v8-r5-t3-self-review-inactive-guard`

范围：仅在 R5 daemon 动态 review task 生成前增加 reviewer gate：禁止执行 Agent 自审；禁止 inactive/offline reviewer；缺 policy 且 fallback reviewer 不可解析时进入明确 gate。未进入 reviewer verdict 解析、PM final decision、WebUI、真实 Telegram 投递、生产/ignored SQLite 迁移。

## 前置阅读

已按调度要求阅读/复核：

- `docs/v8/README.md` — V8 clean rebuild baseline、R1 单一数据层主线。
- `docs/v8/long-proof-r5-review-policy-table.md` — R5-T1 policy table/evaluator 与 reviewer 路由输入。
- `docs/v8/long-proof-r5-dynamic-review-task.md` — R5-T2 动态 review task/source snapshot 输入。
- `docs/v8/long-proof-r4-stale-takeover-lease.md` — R4 daemon tick/lease 边界。
- R2 FSM/service 边界：状态推进必须走 `transitionTask` / V8 Runtime API service。

## 修改文件

- `src/daemon/v8_tick_loop.ts`
  - 新增 reviewer gate 类型与 `validateReviewerGate()`：
    - `self_review`：latest success run 的 worker `agent_id` 与 reviewer 相同则拒绝生成 review task。
    - `inactive_reviewer`：reviewer 不存在 online REVIEW agent 注册，或已注册但 offline/disabled/非 REVIEW lane，则拒绝生成 review task。
    - `missing_reviewer_policy`：fallback reviewer 没有可用注册时进入明确 policy gate。
  - 新增 `recordReviewerGate()`：在当前 `project_id` 下写入 `reviews.status='blocked'`、`review_task_id=null`、`rework_json.gate='reviewer_policy_required'`，保留 source task + policy snapshot 作为 bridge proof。
  - `spawnReviewTasks()` 在 `runtime.createTask()` 前执行 gate；gate 命中时保持原任务 `completion_pending`，不创建 REVIEW task，不执行 `request_review` 状态推进。
- `tests/v8/v8_review_policy.test.ts`
  - 新增 fail-first contracts：self-review gate、inactive reviewer gate。
  - 为动态 source snapshot happy path 显式 seed online REVIEW policy/reviewer，避免新 gate 误伤既有行为。
- `docs/v8/long-proof-r5-self-review-inactive-guard.md`
  - 本 proof 文件。

## TDD 记录

| 阶段 | 命令 | 结果 |
| --- | --- | --- |
| RED | `npm test -- --runInBand tests/v8/v8_review_policy.test.ts` | failed：新增 self-review / inactive reviewer 测试期望 `review_task_ids=[]`，旧实现仍创建 review task，证明缺 gate。 |
| GREEN | `npm test -- --runInBand tests/v8/v8_review_policy.test.ts` | passed：1 suite / 7 tests。 |

## 验证命令与结果

| 命令 | 结果 |
| --- | --- |
| `npm test -- --runInBand tests/v8/v8_review_policy.test.ts` | passed：1 suite / 7 tests。 |
| `npm test -- --runInBand tests/v8/v8_review_policy.test.ts tests/v8/v8_daemon_tick_loop.test.ts` | passed：2 suites / 18 tests。 |
| `npx prisma validate` | passed：schema valid。 |
| `npm run build` | passed：`tsc` exit 0。 |
| `git diff --check` | passed：无 whitespace error。 |
| source denylist (`src/daemon/v8_tick_loop.ts`, `src/review/v8_review_policy.ts`, `tests/v8/v8_review_policy.test.ts`) | no output；未新增 direct SQLite / ignored DB / Prisma raw SQL。 |
| pollution status/tracked scan | no output；未产生 DB、dist、node_modules、secrets、proof JSON、`.env` 污染。 |

完整验证日志：

- `/tmp/nexus-v8-r5-t3-self-review-inactive-guard-verify.log` — 50 lines，sha256 `21db85f20f5269b1c198acf9212018711b24a93a28c28e9b14db8648e21e2946`。

## 已实现内容

1. pm_audit 原任务进入 `completion_pending` 后，daemon 在创建 review task 前校验 reviewer 合法性。
2. 若 reviewer 等于 latest success run 的 worker agent，系统记录 `self_review` gate，不创建 review task，原任务保持 `completion_pending` 等待重新配置 policy/reviewer。
3. 若 reviewer 未处于当前项目 online REVIEW agent 注册中，系统记录 `inactive_reviewer` gate，不创建 review task。
4. 若无 policy 且 fallback reviewer 也没有可用注册，系统记录 `missing_reviewer_policy` gate，避免静默使用不可审 reviewer。
5. 所有查询/写入均以当前 `project_id` 分区；review task 创建仍通过 V8 Runtime API service；原任务状态变化仍只通过 R2 FSM service。

## 剩余风险

- 当前 gate 只校验当前项目绑定的 REVIEW agent；global reviewer agent（`project_id=null`）未纳入 reviewer 可用性判断，若后续业务允许全局 reviewer，需要在 reviewer policy 中明确并扩展测试。
- `reviews.status='blocked'` 用于明确 gate proof；后续 R5 verdict/PM final 卡需决定 blocked review 如何被 PM UI/daemon retry 消费。
- 工作区进入本卡前已有 R4/R5-T2 未跟踪 proof 与同文件 WIP；本卡主审应聚焦 self-review/inactive reviewer gate 相关 diff/proof。

## 下一阶段输入

- PM/reviewer policy 管理卡可读取 `reviews.rework_json.gate/reason/reviewer_agent_id/worker_agent_id/reviewer_status`，提示 PM 修正 reviewer policy 或恢复 reviewer agent。
- 后续 verdict/PM audit 阶段必须继续保持：Reviewer 不能自审，inactive reviewer 不能产出有效 verdict。
