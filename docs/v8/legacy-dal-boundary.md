# V8-R1 Legacy DAL 退场边界

## 结论

V8 Repository 是唯一主线数据访问入口。R1 之后的新 Runtime API、FSM Controller、Dispatcher、Review、Report、Cron Registry 与 WebUI 只允许依赖 `src/repositories/v8.ts` 中的 Prisma Repository 或其后续拆分模块；不得回退到 legacy DAL 作为新增主流程实现。

## legacy DAL 只读适配 / archive 边界

legacy DAL 指以下范围：

- `src/db/dal.ts` 与其 `better-sqlite3` 直接 SQL 实现。
- `data/nexus.db` 及旧 V1 raw SQL schema。
- `tests/legacy/**` 中保留的 V7.x 行为参考、schema drift 证据与旧 daemon/API contract。
- 历史 proof/script/fixture 中依赖 ignored SQLite 文件的迁移参考。

边界规则：

1. **只读参考**：legacy DAL 可以作为 V7.x 行为、字段命名、迁移差异的阅读材料；不得作为 V8 新代码的 import 目标，不得参与 V8 新主流程。
2. **archive 留存**：旧测试只保留在 `tests/legacy/**`，默认 Jest 不运行；后续需要迁移时必须在对应 R 阶段写新的 `tests/v8/**` contract。
3. **禁止主流程依赖**：不得在 V8 Runtime API、FSM Controller、Dispatcher、Review、Report、Cron Registry、WebUI 中调用 `src/db/dal.ts`、`better-sqlite3` 或直接打开 `data/nexus.db` / `prisma/data/nexus.db`。
4. **禁止 ignored DB fixture**：R1+ 测试必须从 checked-in Prisma schema/migration 初始化临时 DB；不得复制生产/本地 ignored SQLite 文件。
5. **迁移单列任务**：如果要回迁旧数据，只能通过后续独立 migration/backfill 任务处理，并先给出 schema contract 与只读快照 proof。

## V8 Repository 单一主线

当前 R1 主线文件：

- `prisma/schema.prisma`：V8 SSoT schema。
- `scripts/init-test-db.js` / `npm run db:init:test -- <tmp-db>`：从 Prisma schema 初始化临时测试 DB。
- `src/repositories/v8.ts`：R1 Prisma Repository 边界，包含 `ProjectRepository`、`TaskRepository`、`RunRepository`、`ReportRepository`。
- `tests/v8/**`：R1 contract tests，覆盖 schema、test DB 初始化、project-scoped repository 与 legacy 退场边界。

Repository 约束：

- 新写入必须显式携带 `project_id`。
- 读取、列表、状态更新必须按 `project_id` 分区，禁止跨项目命中。
- `Task.task_group_id` 是唯一 V8 任务分组 FK；外部可读 `group_id` 只能在 API/Repository 层解析成 `TaskGroup.id`。
- Report/Run/Artifact/Review/Cronjob 必须保留 dispatch/report/review traceability 字段，但 trace ID 不进入用户可见正文。

## R2 Runtime API + FSM Controller 输入

R2 只能基于 V8 Repository 继续，不接 legacy DAL：

1. **Runtime API 数据层**：Express/Fastify/HTTP handler 注入 V8 Repository；handler 内禁止直接 SQL，禁止 import `src/db/dal.ts`。
2. **FSM Controller**：FSM 配置读写走 Prisma schema 的 `FSMController` model，并在 Repository/API 层保持 `project_id` 隔离。
3. **状态流转输入**：R2 可依赖 R1 的 `Project`、`Agent`、`TaskGroup`、`Task`、`TaskDependency`、`Run`、`Report`、`Review`、`Artifact`、`ProjectCronjob` models。
4. **测试输入**：新增 R2 tests 必须使用 `npm run db:init:test -- <tmp-db>` 创建临时 DB，并复用或扩展 `tests/v8/**` contract；不得启用 `tests/legacy/**` 作为默认通过条件。
5. **验收输入**：R2 proof 需要同时证明 API project-scoped 行为、FSM Controller project isolation、direct SQL/import denylist 与 DB 污染扫描。

## 不做事项

- 不删除 `src/db/dal.ts`：它仍是 V7.x archive/reference，避免破坏旧线查证。
- 不运行生产 DB migration，不触碰 `data/nexus.db` / `prisma/data/nexus.db`。
- 不实现 R2-R9 Runtime API、daemon、review/report、cron 或 WebUI 主流程。
