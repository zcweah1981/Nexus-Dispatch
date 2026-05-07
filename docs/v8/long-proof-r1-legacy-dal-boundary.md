# Long Proof — V8-R1 Legacy DAL 主线退场边界

任务：`nexus-v8-r1-t5-legacy-dal-boundary`  
范围：仅执行 R1 Schema + Prisma 单一数据层的 legacy 退场边界说明与 contract；未进入 R2-R9 Runtime API / Daemon / Review / Report / Cron / WebUI 实现。

## 先读材料

- `docs/v8/README.md` — V8 clean rebuild baseline 与 R1 主线入口。
- `docs/v8/long-proof-r0-clean-rebuild-baseline.md` — R0 proof，确认旧线冻结、默认 Jest 不跑 legacy/dist、测试 DB 从受控 schema 初始化。
- `docs/v8/legacy-test-classification.md` — keep / legacy / rewrite 分类，确认 `tests/legacy/**` 是迁移参考。
- `docs/v8/prisma-schema-boundary.md` — R1 Prisma schema 单一数据层边界。

## 修改文件

本任务新增/修改：

- `docs/v8/legacy-dal-boundary.md` — 新增 legacy DAL 只读适配 / archive 边界，明确 `src/db/dal.ts`、`data/nexus.db`、`tests/legacy/**` 不再参与 V8 新主流程。
- `docs/v8/README.md` — 新增 R1 单一数据层主线入口，指向 V8 Repository 与 legacy DAL 边界文档。
- `docs/v8/prisma-schema-boundary.md` — 补充链接到 legacy DAL 退场边界。
- `tests/v8/v8_legacy_dal_boundary.test.ts` — 新增 contract test，证明文档边界存在，且 `src/repositories/v8.ts` 不依赖 legacy DAL / SQLite 直接路径。
- `docs/v8/long-proof-r1-legacy-dal-boundary.md` — 本 proof。

工作区已有的 R1 前置改动（非本任务新建但本次验证覆盖）：

- `package.json`
- `prisma/schema.prisma`
- `scripts/init-test-db.js`
- `src/repositories/v8.ts`
- `tests/v8/v8_prisma_schema.test.ts`
- `tests/v8/v8_repositories.test.ts`
- `tests/v8/v8_test_db_init.test.ts`
- `docs/v8/long-proof-r1-*.md`
- `docs/v8/prisma-schema-boundary.md`（本任务补充了一行边界链接）

## TDD 证据

| 阶段 | 命令 | 结果 |
|---|---|---|
| RED | `npm test -- --runInBand tests/v8/v8_legacy_dal_boundary.test.ts` | 预期失败：`docs/v8/legacy-dal-boundary.md` 不存在，1 failed / 1 passed |
| GREEN-1 | 同上 | 文档存在但缺精确边界短语，预期失败：`不得参与 V8 新主流程` |
| GREEN-2 | 同上 | passed：2 tests passed |

## 验证命令与结果

| 命令 | 结果 |
|---|---|
| `npx prisma validate` | passed：`The schema at prisma/schema.prisma is valid` |
| `npm test -- --runInBand tests/v8` | passed：5 suites / 15 tests |
| `npm run build` | passed：`tsc` exit 0 |
| `git diff --check` | passed：无 whitespace error |
| `npm test -- --runInBand` | passed：26 suites / 194 tests |
| `git status --short --untracked-files=all` | 无 DB / dist / node_modules / secrets / proof JSON 污染；仅显示源码、docs、scripts、tests 的 R1 工作区变更 |
| `git status --short --untracked-files=all \| grep -E '(^\|/)(dist\|node_modules)(/\|$)\|\.db(-wal\|-shm)?$\|\.sqlite(3)?$\|secret\|\.env\|proof.*\.json\|test_proof.*\.json' \|\| true` | passed：无输出 |

## 已实现内容

1. 明确 `legacy DAL 只读适配 / archive 边界`：legacy DAL 只能读作 V7.x 参考，不得参与 V8 新主流程。
2. 明确 V8 Repository 是唯一主线数据访问入口：R2+ Runtime API / FSM Controller 必须基于 Prisma Repository 继续。
3. 用 contract test 固化边界：
   - 文档必须包含 legacy DAL archive、V8 Repository 单一主线、R2 输入说明。
   - `src/repositories/v8.ts` 不得出现 `src/db/dal`、`better-sqlite3`、`sqlite3`、`data/nexus.db`、`prisma/data/nexus.db` 等 legacy/直接 DB 依赖。
4. 保持本阶段范围：未删除 `src/db/dal.ts`，未迁移生产 DB，未实现 R2-R9。

## 剩余风险

1. `src/db/dal.ts` 仍存在于仓库中作为 V7.x archive/reference；如果后续 R2 代码无 denylist test，仍可能被误 import。
2. 当前工作区含前置 R1 未提交改动；本 proof 已区分本任务新增边界与已有 R1 schema/repository/test-db 工作。
3. legacy 数据回迁尚未设计；如需回迁必须单独 migration/backfill 任务处理。

## R2 Runtime API + FSM Controller 输入

- 注入并使用 V8 Repository；handler 内禁止直接 SQL / legacy DAL import。
- FSM Controller CRUD 走 `FSMController` Prisma model，并保持 `project_id` isolation。
- R2 tests 使用 `npm run db:init:test -- <tmp-db>` 创建临时 DB，不复制 ignored SQLite。
- R2 acceptance 必须增加 API/FSM project-scoped contracts、legacy import denylist、DB 污染扫描。
