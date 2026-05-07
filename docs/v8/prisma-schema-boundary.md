# V8-R1 Prisma Schema Boundary

## 结论

V8 主线只以 Prisma schema / Prisma Client 为数据层契约。Runtime API、Repository、Daemon、Review、Report、Cron Registry 后续阶段都必须围绕 `prisma/schema.prisma` 生成的 Prisma Client 工作，不再继续扩展 `src/db/dal.ts` 的 legacy DAL。

## 本阶段范围

- 定义 V8 核心实体：`Project`、`Agent`、`FSMController`、`ProjectBlueprint`、`TaskGroup`、`Task`、`TaskDependency`、`Run`、`Artifact`、`Review`、`Report`、`ProjectCronjob`。
- 明确统一任务分组字段：`Task.task_group_id`。外部 API 如果收到用户可读 `group_id`，必须在 Repository 层解析为 `TaskGroup.id` 后写入 `task_group_id`，不得再出现多个互相漂移的分组字段。
- 保留 V7.x 兼容字段的最小边界，例如 `Artifact.payload` 和 nullable `project_id`，只用于让旧调用方在迁移期可编译/可读；V8 新写入应优先使用 project-scoped 字段与 `payload_data` / `metadata_json`。

## Legacy 数据边界

- legacy DAL 指 `src/db/dal.ts`、`data/nexus.db`、旧 `better-sqlite3` 直接 SQL 路径，以及 `tests/legacy/**` 中保留的 V7.x 行为参考。
- legacy DAL 不得参与 V8 新主线，不得作为 Runtime API、Repository、Review、Report、Cron Registry 的新增实现入口。
- legacy DAL 只读适配 / archive 边界详见 `docs/v8/legacy-dal-boundary.md`；其中明确 `src/db/dal.ts` 只可作为 V7.x 参考，不再参与 V8 新主流程。
- `prisma/data/nexus.db` 与 `data/nexus.db` 都不能作为 R1 测试 fixture 复制来源；测试必须从 checked-in schema 或 Prisma push/migration 在临时目录创建空库。
- 若后续需要回迁旧数据，必须以单独 migration/backfill 任务处理，不在 V8-R1 schema 定义阶段直接操作生产 DB 或 ignored SQLite 文件。

## 下一阶段输入

1. R1 后续 Repository：基于当前 schema 生成 Prisma Client，封装 project-scoped Repository 方法。
2. R2+ Runtime API：禁止模块直接 SQL，统一走 API/Repository。
3. R4+ Dispatcher/Daemon：按 `task_group_id`、`Run.dispatch_id`、`Run.worker_run_id`、`Report`、`ProjectCronjob` 等字段补齐状态闭环。
