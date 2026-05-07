# Long Proof — V8-R1 Migration Test DB

任务：`nexus-v8-r1-t2-migration-test-db`  
范围：仅执行 R1 Schema + Prisma 单一数据层下的测试 DB migration 初始化；未进入 R2-R9 Runtime API / Repository 行为重写 / Daemon / Review / Report / Cron / WebUI。

## 前置阅读

- `docs/v8/README.md`
- `docs/v8/long-proof-r0-clean-rebuild-baseline.md`
- `docs/v8/long-proof-r1-prisma-schema.md`
- `docs/v8/contracts/runtime-control-plane.contract.json`

## 修改文件

- `package.json` — 新增 `db:init:test` npm script，作为 clean checkout 可复现测试 DB 初始化入口。
- `scripts/init-test-db.js` — 新增测试 DB 初始化脚本：只对目标临时 SQLite 路径执行 `prisma db push`，拒绝 `data/` 与 `prisma/data/` 下的 runtime/ignored DB 路径，不复制任何现有 SQLite。
- `tests/v8/v8_test_db_init.test.ts` — 新增 V8-R1 migration 初始化合同测试：覆盖 npm script 暴露、无 DB 复制依赖、临时 DB schema 初始化、`task_group_id` 列存在、Prisma grouped task 写入成功、禁止生产/ignored DB 路径。
- `docs/v8/long-proof-r1-migration-test-db.md` — 本 proof 文件。

## TDD 记录

| 阶段 | 命令 | 结果 |
|---|---|---:|
| RED | `npm test -- --runInBand tests/v8/v8_test_db_init.test.ts` | 预期失败：`Missing script: "db:init:test"`，且 `scripts/init-test-db.js` 不存在 |
| GREEN | `npm test -- --runInBand tests/v8/v8_test_db_init.test.ts` | 1 suite / 3 tests passed |

## 验证命令与结果

| 命令 | 结果 |
|---|---:|
| `npm run db:init:test -- /tmp/nexus-v8-r1-t2-manual-<pid>.db` | passed；输出结构化 JSON：`ok=true`、`schema_source=prisma/schema.prisma` |
| `sqlite3 <tmp_db> "PRAGMA table_info(nexus_tasks);"` | passed；确认 `task_group_id` 为 `nexus_tasks` 第 10 列 |
| 临时 DB Prisma grouped task 写入 smoke | passed；`project -> taskGroup -> task(task_group_id=taskGroup.id)` 写入成功，未出现 `The column task_group_id does not exist` |
| `npx prisma validate` | passed |
| `npx prisma generate` | passed |
| `npm run build` | passed |
| `npm test -- --runInBand tests/v8/v8_smoke.test.ts tests/v8/v8_prisma_schema.test.ts tests/v8/v8_test_db_init.test.ts tests/dynamic_review.test.ts tests/fsm_controllers.test.ts tests/freezer.test.ts tests/api/task-api.test.ts` | 7 suites / 76 tests passed |
| `npm test -- --runInBand` | 24 suites / 188 tests passed |
| `git diff --check` | passed / no output |
| `git status --short --untracked-files=all \| grep -E '(\.db\|dist/\|node_modules/\|secret\|proof.*\.json\|\.env)' \|\| true` | no output |
| `git ls-files data prisma/data dist src/webui/dist '*.db' '*.sqlite' 'proof*.json' '*proof*.json'` | no output |

## 结果

- 测试 DB 初始化路径已从“各测试内手写 `prisma db push`”补充为统一 npm script：`npm run db:init:test -- <tmp-db-path>`。
- 初始化脚本只使用 checked-in `prisma/schema.prisma` 与 Prisma migration/push 能力创建临时 DB；不读取、不复制、不修改 `data/nexus.db` 或 `prisma/data/nexus.db`。
- 合同测试已证明 clean checkout 场景可复现：临时 DB 中 `nexus_tasks.task_group_id` 存在，Prisma Client 可写入带 `task_group_id` 的任务。
- 已显式验证不再出现 `The column task_group_id does not exist` 对应缺列问题。
- Git 污染检查未发现 DB、dist、node_modules、secrets、proof JSON、env 文件进入 status 或 tracked pollution 清单。

## 剩余风险

1. 本阶段只提供测试 DB 初始化脚本与合同测试；尚未把所有历史测试 helper 统一迁移到 `npm run db:init:test`，避免扩大 R1-T2 范围。
2. `npx prisma db push` 是测试 DB 初始化路径；生产 DB migration / deploy 策略仍需后续阶段单独定义并审核。
3. 工作区存在同组 R1-T1 的未提交 schema/doc/test 变更，本任务在其基础上验证并补充 T2，不执行 git push。

## 下一阶段输入

1. R1 后续 Repository/DAL 任务可直接调用 `npm run db:init:test -- <tmp-db>` 生成 schema-matched 测试 DB。
2. 后续将重复的测试内 `prisma db push` helper 收敛到统一脚本/共享 helper，但应单独派任务，避免本阶段进入大规模测试重构。
3. R2+ Runtime API 层实现时，应保持外部 `group_id` -> 内部 `task_group_id` 解析，并继续使用临时 DB 初始化脚本做 clean checkout 回归。
