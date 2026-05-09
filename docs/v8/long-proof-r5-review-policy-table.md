# Long Proof — V8-R5-T1 Review Policy Table & Evaluator

任务：`nexus-v8-r5-t1-review-policy-table`

范围：仅实现 R5 review policy 表与 evaluator，支持 `agent/lane/project` override，并将 daemon review task 创建时的 reviewer 选择接入 evaluator。未进入后续 review verdict 终局、PM final decision、WebUI、真实 Telegram 投递、生产/ignored SQLite 迁移。

## 前置阅读

已按调度要求阅读/复核：

- `docs/v8/README.md`
- `docs/v8/legacy-test-classification.md`
- `docs/v8/legacy-dal-boundary.md`
- `docs/v8/prisma-schema-boundary.md`
- `docs/v8/long-proof-r0-clean-rebuild-baseline.md`
- R1 proof：Prisma schema / legacy DAL boundary / repositories
- R2 proof：transition service / API contract tests / FSM matrix
- R3 proof：blueprint freezer / thaw current phase
- R4 proof：daemon tick loop / stale takeover lease / worker dispatch / result ingestion / timeout recovery

## 修改文件

本卡新增/修改：

- `prisma/schema.prisma`
  - 新增 `ReviewPolicy` model，映射 `review_policies` 表。
  - 字段：`project_id`, `policy_id`, `agent_id`, `lane`, `reviewer_agent_id`, `priority`, `enabled`, `policy_json`。
  - 约束/索引：`@@unique([project_id, policy_id])`，`@@index([project_id, enabled, agent_id, lane])`，`@@index([project_id, enabled, priority])`。
  - `Project` 增加 `reviewPolicies` relation。
- `src/review/v8_review_policy.ts`
  - 新增 `ReviewPolicyRepository`：`upsert/get/list` 全部以 `project_id` 分区。
  - 新增 `evaluateReviewPolicy()`：解析优先级为 `agent_override -> lane_override -> project_default -> fallback`，且只读取当前 `project_id` 下 enabled policies。
- `src/daemon/v8_tick_loop.ts`
  - `spawnReviewTasks()` 在 `pm_audit` 任务进入 review 时调用 evaluator。
  - 若存在最近成功 run，则使用 run.agent.agent_id 作为 agent override 输入；同时传入 `lane_required` 作为 lane override 输入。
  - 创建 review task / review bridge 时写入 `review_policy` / `policy_source` snapshot，便于 reviewer/PM 追踪。
- `tests/v8/v8_review_policy.test.ts`
  - 新增 schema contract、repository project isolation contract、evaluator override contract、daemon evaluator 集成 contract。

工作区中进入本卡前已有的前序 R4 WIP/证明文件仍保留，未纳入本卡实现范围：

- `src/daemon/v8_tick_loop.ts` / `tests/v8/v8_daemon_tick_loop.test.ts` 已有 R4 timeout recovery 修改，本卡仅在同一文件中追加 review policy 接入。
- `docs/v8/long-proof-r4-worker-openai-dispatch.md`
- `docs/v8/long-proof-r4-result-ingestion-once.md`
- `docs/v8/long-proof-r4-timeout-recovery.md`

## TDD 记录

| 阶段 | 命令 | 结果 |
| --- | --- | --- |
| RED | `npm test -- --runInBand tests/v8/v8_review_policy.test.ts` | failed：`Cannot find module '../../src/review/v8_review_policy'`，证明 review policy evaluator 尚不存在。 |
| GREEN-1 | `npx prisma generate` | passed：Prisma Client 根据新增 schema 生成。 |
| GREEN-2 | `npm test -- --runInBand tests/v8/v8_review_policy.test.ts` | passed：4 tests。 |
| Focused regression | `npm test -- --runInBand tests/v8/v8_prisma_schema.test.ts tests/v8/v8_review_policy.test.ts tests/v8/v8_daemon_tick_loop.test.ts` | passed：3 suites / 18 tests。 |

## 验证命令与结果

| 命令 | 结果 |
| --- | --- |
| `npm test -- --runInBand tests/v8/v8_review_policy.test.ts` | passed：1 suite / 4 tests。 |
| `npm test -- --runInBand tests/v8/v8_prisma_schema.test.ts tests/v8/v8_review_policy.test.ts tests/v8/v8_daemon_tick_loop.test.ts` | passed：3 suites / 18 tests。 |
| `npm test -- --runInBand tests/v8` | passed：13 suites / 56 tests。 |
| `npx prisma validate` | passed：schema valid。 |
| `npm run build` | passed：`tsc` exit 0。 |
| `npm test -- --runInBand` | passed：34 suites / 236 tests。测试中 `SessionManager API unreachable` console.error 属既有断网降级测试输出，Jest exit 0。 |
| `git diff --check` | passed。 |
| pollution status scan | passed：无 DB/dist/node_modules/secrets/proof JSON/.env 污染进入 `git status`；仅 tracked `.env.example` 在 tracked scan 中出现，属安全模板。 |

完整验证日志：

- `/tmp/nexus-v8-r5-t1-review-policy-dispatch9-verify.log` — 174 lines，sha256 `ccd2421408b19fb31f108e12324a8b4ffc030be4da3ff2a72f1987bff3e17f27`。
- `/tmp/nexus-v8-r5-t1-review-policy-dispatch9-summary.md` — sidecar summary，记录 exit_status=0 / line count / sha256。
- dispatch9 复验时间：2026-05-09 08:55:03Z -> 09:02:11Z。

## 剩余风险

- 当前 evaluator 只负责 reviewer 路由选择与 snapshot；不负责 reviewer verdict 解析、PM final decision、review fail retry 终局处理，这些属于 R5 后续卡。
- `agent_override` 的 daemon 输入依赖最近成功 `Run.agent.agent_id`；若任务没有成功 run（例如手工置为 `completion_pending`），则退化到 lane/project/fallback。已在 evaluator 单测覆盖 agent/lane/project 优先级。
- 工作区存在前序 R4 未提交 WIP/证明文件，已在本 proof 中明确隔离；Reviewer 本卡主审应聚焦本次新增 review policy diff。

## 下一阶段输入

- 后续 R5 verdict/PM audit 卡可直接读取 review task `payload.review_policy` 与 review bridge `rework_json.policy_source/policy_id` 作为 reviewer 路由证明。
- 若需要运行时 API 管理 review policies，可在本表/Repository 基础上新增薄 API；本卡未暴露外部写入路由，避免越级扩大范围。
