# Long Proof — V8-R1 Prisma Repository Layer

任务：`nexus-v8-r1-t3-repositories`
范围：仅执行 R1 Schema + Prisma 单一数据层下的 Repository 最小接口；未进入 R2-R9 Runtime API / Daemon / Review / Report / Cron / WebUI 行为改造。

## 前置阅读

- `docs/v8/README.md`
- `docs/v8/long-proof-r0-clean-rebuild-baseline.md`
- `docs/v8/long-proof-r1-prisma-schema.md`
- `docs/v8/long-proof-r1-migration-test-db.md`
- `docs/v8/contracts/runtime-control-plane.contract.json`

## 修改文件

- `src/repositories/v8.ts` — 新增 V8 Prisma Repository 层：`ProjectRepository`、`TaskRepository`、`RunRepository`、`ReportRepository`。所有新写入显式写入 `project_id`，所有读取/更新使用 project-scoped `findFirst` 预校验，避免跨项目越权。
- `tests/v8/v8_repositories.test.ts` — 新增 V8-R1 Repository 合同测试，覆盖 happy path 与 Project isolation：项目创建、任务分组/状态/proof 更新、run project_id/status 更新、report 创建/发送状态更新，以及跨项目读/写阻断。
- `docs/v8/long-proof-r1-repositories.md` — 本 proof 文件。

## TDD 记录

| 阶段 | 命令 | 结果 |
|---|---|---:|
| RED | `npm test -- --runInBand tests/v8/v8_repositories.test.ts` | 预期失败：`Cannot find module '../../src/repositories/v8'` |
| GREEN | `npm test -- --runInBand tests/v8/v8_repositories.test.ts` | 1 suite / 4 tests passed |

## 验证命令与结果

| 命令 | 结果 |
|---|---:|
| `npx prisma validate` | passed |
| `npx prisma generate` | passed |
| `npm run build` | passed |
| `npm test -- --runInBand tests/v8/v8_repositories.test.ts` | 1 suite / 4 tests passed |
| `npm test -- --runInBand tests/v8/v8_smoke.test.ts tests/v8/v8_prisma_schema.test.ts tests/v8/v8_test_db_init.test.ts tests/v8/v8_repositories.test.ts tests/dynamic_review.test.ts tests/fsm_controllers.test.ts tests/freezer.test.ts tests/api/task-api.test.ts` | 8 suites / 80 tests passed |
| `npm test -- --runInBand` | 25 suites / 192 tests passed |

## 结果

- 已实现 R1 最小 Repository 接口，外部调用方可以通过项目 ID 访问 Project/Task/Run/Report 的 Prisma 单一数据层封装。
- `TaskRepository`：创建时写入 `project_id`；若传入 `task_group_id`，先校验该 group 属于同一 project；读取、列表、状态更新均按 `project_id` 分区。
- `RunRepository`：创建时校验 task 与 agent 在 project 范围内（允许全局 agent），并写入 `project_id`；读取与状态更新按 `project_id` 分区。
- `ReportRepository`：创建时校验关联 task/run 属于同一 project，并写入 `project_id`；读取、列表、状态更新按 `project_id` 分区。
- 验证过程只使用 `npm run db:init:test -- <tmp-db>` 创建的 `/tmp` 临时 DB；未读取、复制或修改 `data/nexus.db` / `prisma/data/nexus.db`。

## 剩余风险

1. Repository 目前是 R1 最小接口，尚未接入 Runtime API routes；R2+ 需要在 API 层把外部 contract 参数映射到本 Repository。
2. Repository 暂未覆盖 ArtifactRepository；本任务验收只要求 Project/Task/Run/Report 四类。
3. 现有工作区包含 R1-T1/R1-T2 的未提交 schema/doc/test 变更，本任务在其基础上新增 T3 文件；未执行 git commit/push。

## 下一阶段输入

1. R2 Runtime API 层应只调用 Repository，不绕过为 legacy DAL 或直接 SQLite。
2. API 接口应继续保持外部 `group_id` -> 内部 `task_group_id` 的解析边界，并把 `project_id` 作为所有请求的 mandatory scope。
3. 后续可按同样模式补 Artifact/Review/Cron Repository，但需单独派任务，避免扩大 R1-T3 范围。
