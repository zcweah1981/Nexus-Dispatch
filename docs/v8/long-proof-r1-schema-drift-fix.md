# Long Proof — V8-R1 Schema Drift Fix

任务：`nexus-v8-r1-t4-schema-drift-fix`
范围：R1 Schema + Prisma 单一数据层收口；不进入 R2-R9 Runtime API / Daemon / Review / Report / Cron / WebUI 重构。

## 前置阅读

已按验收要求先阅读：

- `docs/v8/README.md` — V8-R0 新基线入口与 legacy 冻结策略。
- `docs/v8/long-proof-r0-clean-rebuild-baseline.md` — R0 proof：默认 keep 测试、legacy 隔离、禁止复制 ignored/生产 SQLite、dist/proof 污染治理。
- `docs/v8/legacy-test-classification.md` — `tests/legacy/v75-schema-drift/prisma_dal.test.ts` 作为 V7.5 schema drift 参考，不回收到默认 Jest 基线。
- R1 已有 proof：`long-proof-r1-prisma-schema.md`、`long-proof-r1-migration-test-db.md`、`long-proof-r1-repositories.md`。

## 修改文件

- `prisma/schema.prisma` — 整理为 V8-R1 Prisma schema：显式保留 `Task.task_group_id`，补齐 project-scoped `Project/TaskGroup/Task/Run/Report/Review/ProjectCronjob` 等核心关系与索引。
- `package.json` — 新增 `db:init:test` npm script。
- `scripts/init-test-db.js` — 新增临时测试 DB 初始化脚本；只从 checked-in Prisma schema 执行 `prisma db push`，拒绝 `data/nexus.db` 与 `prisma/data/nexus.db`。
- `src/repositories/v8.ts` — 新增 V8 Prisma Repository 层：`ProjectRepository`、`TaskRepository`、`RunRepository`、`ReportRepository`；所有新写入显式 project scope，读/改先做 project-scoped 校验。
- `tests/v8/v8_prisma_schema.test.ts` — schema source-level contract：核心模型、`task_group_id`、project traceability、legacy boundary。
- `tests/v8/v8_test_db_init.test.ts` — migration/test DB contract：无 DB 复制依赖、临时库含 `task_group_id`、Prisma grouped task 写入成功、禁止生产/ignored DB 路径。
- `tests/v8/v8_repositories.test.ts` — repository contract：project isolation、task group、run/report project_id/status 更新。
- `docs/v8/prisma-schema-boundary.md`、`docs/v8/long-proof-r1-*.md` — R1 边界与 proof。
- `docs/v8/long-proof-r1-schema-drift-fix.md` — 本 proof。

## 修复前后失败点对照

| 失败点（修复前/RED 或 R0 记录） | 一次性修复点 | 修复后验证 |
|---|---|---|
| R0 记录：旧 `tests/prisma_dal.test.ts` 使用 `DATABASE_URL=file:../data/nexus.db` 命中 V1 schema，缺 `task_group_id`。 | V8-R1 不再复制/依赖 ignored DB；`scripts/init-test-db.js` 从 `prisma/schema.prisma` 初始化临时 DB。 | `tests/v8/v8_test_db_init.test.ts` 通过，`PRAGMA table_info(nexus_tasks)` 含 `task_group_id`，并能写入 grouped task。 |
| R1-T2 RED：`Missing script: "db:init:test"`，且 `scripts/init-test-db.js` 不存在。 | `package.json` 增加 `db:init:test`，脚本输出结构化 JSON 并拒绝生产/ignored DB 路径。 | `npm test -- --runInBand tests/v8/v8_test_db_init.test.ts` 包含在验证链路中并通过。 |
| R1-T3 RED：`Cannot find module '../../src/repositories/v8'`。 | 新增 `src/repositories/v8.ts`，统一通过 Prisma Client 写入/读取 project-scoped 数据。 | `npm test -- --runInBand tests/v8/v8_repositories.test.ts` 包含在验证链路中并通过。 |
| schema drift 引发的 `task_group_id` / `project_id` / run/report traceability 不一致风险。 | `prisma/schema.prisma` 明确 V8 核心模型、`Task.task_group_id` 关系与索引；Repository 写入 `project_id` 并阻断跨项目读改。 | focused R1 + keep suite 80 tests passed；full Jest 25 suites / 192 tests passed；build passed。 |

## 测试命令与结果

| 命令 | 结果 |
|---|---|
| `npx prisma validate` | passed；schema valid |
| `npm test -- --runInBand tests/v8/v8_smoke.test.ts tests/v8/v8_prisma_schema.test.ts tests/v8/v8_test_db_init.test.ts tests/v8/v8_repositories.test.ts tests/dynamic_review.test.ts tests/fsm_controllers.test.ts tests/freezer.test.ts tests/api/task-api.test.ts` | 8 suites / 80 tests passed |
| `npm run build` | passed / exit 0 |
| `npm test -- --runInBand` | 25 suites / 192 tests passed |
| `git diff --check` | passed / no output |
| `git status --short --untracked-files=all \| grep -E '(\.db\|dist/\|node_modules/\|secret\|proof.*\.json\|\.env)' \|\| true` | no output |
| `git ls-files data prisma/data dist src/webui/dist '*.db' '*.sqlite' 'proof*.json' '*proof*.json'` | no output |

## 结果

- `task_group_id` schema drift 已在 R1 边界内收口：从测试 DB 初始化、Prisma schema、Repository contract 到 focused/full Jest 均已验证。
- 未引入生产 DB 或 ignored SQLite 依赖；所有 DB 验证均使用临时目录生成的 SQLite。
- legacy drift 测试仍保留在 `tests/legacy/**`，不通过删除默认 keep 测试伪造通过。
- Git 污染检查未发现 DB、dist、node_modules、secrets、proof JSON、env 文件。

## 剩余风险

1. 当前 R1 只完成 Schema + Prisma Repository 单一数据层，不实现 R2-R9 Runtime API、daemon、review/report、cron 或 WebUI 主线。
2. `src/db/prisma_dal.ts` 与 legacy DAL 仍是迁移期兼容路径；后续 Runtime API 应切换到 V8 Repository，而不是继续扩展 legacy DAL。
3. 当前工作区包含尚未提交的 R1 文件；需 PM/reviewer 审核后决定提交/合并策略。

## 下一阶段输入

- R2 可基于 `src/repositories/v8.ts` 与 `prisma/schema.prisma` 实现 Runtime API contract。
- 后续阶段继续保持：禁止复制 `data/nexus.db` / `prisma/data/nexus.db`，测试从 checked-in schema 初始化临时 DB。
- Review/Report/Cron 阶段必须沿用 project-scoped Prisma Repository 边界。
