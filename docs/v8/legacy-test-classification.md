# V8-R0 Legacy Test Classification

> Scope: 本清单只完成 R0 的旧线冻结与测试基线分流，不进入 R1-R9 代码重构。

## 分类原则

- **keep**：当前仍可作为 R0 基线执行；不依赖生产 DB；不从 `dist/` 运行；不要求 V8 未实现能力。
- **legacy**：保留为 V7.x 参考，但从默认 Jest 基线隔离；隔离原因必须可审计，不能删除测试来伪造通过。
- **rewrite**：后续 R1+ 需要按 V8 contract 重新编写的测试主题；当前不在 R0 实现。

## legacy（已隔离）

这些文件已移动到 `tests/legacy/`，并由 `jest.config.js` 的 `testPathIgnorePatterns` 排除默认运行：

| 原位置 | 新位置 | 隔离原因 | R1+ 建议 |
|---|---|---|---|
| `tests/e2e_integration.test.ts` | `tests/legacy/v75-schema-drift/e2e_integration.test.ts` | V7.5 E2E 绑定旧 daemon/API 行为，当前会出现任务状态仍为 `created`、timeout recovery 断言不稳定；属于旧主流程闭环测试，不应成为 V8-R0 基线。 | R9 按 V8 Runtime API + proof/review/report 全链路重写 E2E。 |
| `tests/prisma_dal.test.ts` | `tests/legacy/v75-schema-drift/prisma_dal.test.ts` | 使用 `DATABASE_URL=file:../data/nexus.db` 命中 V1 schema，缺 `task_group_id`；这是已知 DB schema 漂移，不应污染 R0。 | R1 用 V8 migration/Prisma schema 从空库创建测试 DB 后重写 repository tests。 |
| `__tests__/daemon/daemon.test.ts` | `tests/legacy/daemon-api-contract/daemon.test.ts` | 断言旧 `/tasks/claim`、`/tasks/:id/release` 调用序列，与当前 daemon API route/rollback contract 已漂移。 | R4 按 V8 dispatcher claim/lease/worker-result contract 重写。 |

## keep（默认 Jest 基线继续运行）

- `tests/v8/v8_smoke.test.ts` — 新增 R0 smoke skeleton，只验证 contract 文件与临时测试 DB 初始化边界。
- `tests/sse_realtime.test.ts`
- `tests/api/task-api.test.ts`
- `tests/api/agent-api.test.ts`
- `tests/api/blueprint-api.test.ts`
- `tests/dynamic_review.test.ts`
- `tests/api_endpoints.test.ts`
- `tests/api/auth-validation.test.ts`
- `tests/fsm_controllers.test.ts`
- `__tests__/api/webhook.test.ts`
- `tests/gateway.test.ts`
- `tests/submit_proof.test.ts`
- `src/gateway/telegram_webhook.test.ts`
- `tests/freezer.test.ts`
- `tests/pm-core/session.test.ts`
- `tests/sse.test.ts`
- `tests/engine/dag_validator.test.ts`
- `tests/gateway/gateway.test.ts`
- `__tests__/sandbox.test.ts`
- `__tests__/dal.test.ts`
- `tests/pm-core/scaffolding.test.ts`
- `__tests__/adapters/AdapterFactory.test.ts`

## rewrite（后续 V8 阶段输入）

- **R1 Schema/Repository**：重写 Prisma DAL 测试，必须从 migration/schema 初始化临时 DB，不复制 `data/nexus.db` 或 `prisma/data/nexus.db`。
- **R4 Dispatcher**：重写 daemon tests，覆盖 claim/lease/rollback/worker result exactly-once，禁止直接 DB 状态写。
- **R9 E2E**：重写全链路 E2E，覆盖 project -> agent -> blueprint thaw -> dispatch -> worker proof -> review -> completed -> report -> group closeout。

## R0 proof files

- Jest dist 污染 RED proof: `/tmp/nexus-r0-list-before.txt`
- Jest dist ignore proof: `/tmp/nexus-r0-list-final.txt`
- V8 smoke RED proof: `/tmp/nexus-r0-v8-smoke-red.txt`
- V8 smoke GREEN proof: `/tmp/nexus-r0-v8-smoke-green.txt`
- Full test proof: `/tmp/nexus-r0-test-final.txt`
- Build proof: `/tmp/nexus-r0-build-final.txt`
