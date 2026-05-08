# Long Proof — V8-R1 Prisma Schema

任务：`nexus-v8-r1-t1-prisma-schema`
范围：仅执行 R1 Schema + Prisma 单一数据层契约；未进入 R2-R9 Runtime API / Repository 行为重写 / Daemon / Review / Report / Cron 执行 / WebUI。

## 前置阅读

- `docs/v8/README.md`
- `docs/v8/long-proof-r0-clean-rebuild-baseline.md`
- `docs/v8/contracts/runtime-control-plane.contract.json`

## 修改文件

- `prisma/schema.prisma` — 整理为 V8-R1 Prisma schema，覆盖 Project / Agent / FSMController / ProjectBlueprint / TaskGroup / Task / TaskDependency / Run / Artifact / Review / Report / ProjectCronjob；显式保留 `Task.task_group_id` 作为统一分组字段。
- `tests/v8/v8_prisma_schema.test.ts` — 新增 V8 schema source-level contract test，验证核心模型映射、`task_group_id` 合同、project-scoped traceability 与 legacy boundary 文档。
- `docs/v8/prisma-schema-boundary.md` — 新增 V8 Prisma 单一数据层与 legacy DAL 冻结边界说明。
- `docs/v8/long-proof-r1-prisma-schema.md` — 本 proof 文件。

## 测试命令与结果

| 命令 | 结果 |
|---|---:|
| RED 合同验证（对 `HEAD:prisma/schema.prisma` 执行同等模型检查） | 预期失败：`Missing Prisma model Review` |
| `npm test -- --runInBand tests/v8/v8_prisma_schema.test.ts` | 4 passed |
| `npx prisma validate` | passed |
| `npx prisma generate` | passed |
| `npm run build` | passed |
| `npm test -- --runInBand tests/v8/v8_smoke.test.ts tests/v8/v8_prisma_schema.test.ts tests/dynamic_review.test.ts tests/fsm_controllers.test.ts tests/freezer.test.ts tests/api/task-api.test.ts` | 6 suites / 73 tests passed |
| `npm test -- --runInBand` | 23 suites / 185 tests passed |
| `DATABASE_URL=file:/tmp/nexus-v8-r1-schema-<pid>.db npx prisma db push --skip-generate --accept-data-loss && sqlite3 ... ".tables"` | passed；临时库生成 12 张 V8 核心表 |
| `git diff --check` | passed / no output |
| `git status --short --untracked-files=all \| grep -E '(\.db\|dist/\|node_modules/\|secret\|proof.*\.json\|\.env)' \|\| true` | no output |

## 结果

- V8 schema 已覆盖核心实体：`projects/agents/fsm_controllers/blueprints/groups/tasks/runs/artifacts/review/reports/project_cronjobs` 对应的 Prisma models 与 SQLite table mapping。
- `Task.task_group_id` 已作为统一任务分组字段；文档明确 API 的 user-facing `group_id` 必须由 Repository 层解析为 `TaskGroup.id` 后写入。
- legacy 数据边界已写明：`src/db/dal.ts`、`data/nexus.db`、`better-sqlite3` 直接 SQL 路径、`tests/legacy/**` 仅作为冻结参考/迁移输入，不参与 V8 新主线。
- 验证过程只使用 checked-in Prisma schema 与 `/tmp` 临时 DB；未复制或修改生产 DB / ignored SQLite DB。

## 剩余风险

1. 本阶段只定义 schema 合同，未实现 V8 Repository / Runtime API 读写适配；现有 `src/db/prisma_dal.ts` 仍是 V7.x 迁移期代码，后续 R1/R2 应按新 schema 分层重写。
2. 为兼容旧调用方，部分新增 project-scoped 字段暂为 nullable（如 `Run.project_id`、`Artifact.project_id`）；V8 Repository 必须在新写入中显式填充。
3. `Artifact.payload` 保留为 legacy-compatible 字段；V8 新主线应优先使用 `payload_data` 与 `metadata_json`。
4. 当前工作区未 commit、未 push；需 PM/reviewer 审核后决定提交策略。

## 下一阶段输入

1. 基于当前 schema 编写 Prisma Repository 合同与实现，所有读写走 Prisma Client，不扩展 legacy DAL。
2. Runtime API 层负责把外部 `group_id` 解析到内部 `task_group_id`，并强制 project-scoped 查询。
3. R2+ 再进入 daemon/review/report/cron/WebUI 行为改造；不要在 schema 任务中混入行为重写。
