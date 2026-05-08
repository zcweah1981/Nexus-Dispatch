# Long Proof — V8-R2-T4 API Routes Controller Boundary

任务：`nexus-v8-r2-t4-api-routes-controller-boundary`
范围：仅执行 R2 Runtime API + FSM Controller route/service 边界；未进入 R3-R9 Daemon / Review / Report / Cron / WebUI 行为实现，未触碰生产 DB 或 ignored SQLite。

## 前置阅读

- `docs/v8/README.md`
- `docs/v8/long-proof-r0-clean-rebuild-baseline.md`
- `docs/v8/long-proof-r1-prisma-schema.md`
- `docs/v8/long-proof-r1-migration-test-db.md`
- `docs/v8/long-proof-r1-repositories.md`
- `docs/v8/long-proof-r1-legacy-dal-boundary.md`
- `docs/v8/prisma-schema-boundary.md`
- `docs/v8/legacy-dal-boundary.md`
- `docs/v8/long-proof-r2-fsm-state-matrix.md`
- `docs/v8/long-proof-r2-transition-task-service.md`
- `docs/v8/long-proof-r2-forbid-direct-completed.md`

## 修改文件

- `src/services/v8_runtime_api_service.ts` — 新增 V8 Runtime API service，封装 `ProjectRepository` / `TaskRepository` / `RunRepository` / `ReportRepository`，统一把 repository/domain errors 映射为 HTTP-friendly `V8RuntimeApiError`；不直接 SQL、不打开 SQLite。
- `src/api/routes.ts` — 新增 `/api/v1/runtime/projects|tasks|runs|reports` 主线 route：route 只做 Ajv validation、HTTP 参数拆分、调用 `V8RuntimeApiService` 或 `transitionTask` FSM service、发出必要 state event；在注释中明确 legacy SQL endpoints 保留在旧区块，不冒充 V8 主线。
- `src/api/schemas.ts` — 新增 runtime project/task/run/report create/status JSON schema；所有 run/report/task write body 必须携带 `project_id`。
- `tests/v8/v8_runtime_api_route_boundary.test.ts` — 新增 fail-first route boundary 合同：legacy DAL trap 不得被 V8 runtime routes 触碰；projects/tasks/runs/reports 核心 routes 走 service/repository 并按 `project_id` 隔离；source contract 证明 V8 route section 无 direct SQL/legacy DAL/Prisma write。
- 既有 R2-T2/T3 相关文件仍在工作区：`src/services/v8_transition_task_service.ts`、`tests/v8/v8_transition_task_service.test.ts`、`src/fsm/v8_state_matrix.ts`、`tests/v8/v8_fsm_state_matrix.test.ts`、`docs/v8/long-proof-r2-transition-task-service.md`、`docs/v8/long-proof-r2-forbid-direct-completed.md`。

## TDD 记录

| 阶段 | 命令 | 结果 |
|---|---|---|
| RED | `npm test -- --runInBand tests/v8/v8_runtime_api_route_boundary.test.ts` | 预期失败：`POST /api/v1/runtime/projects` 返回 404，且 `src/services/v8_runtime_api_service.ts` 不存在。 |
| GREEN | `npm test -- --runInBand tests/v8/v8_runtime_api_route_boundary.test.ts` | passed：1 suite / 2 tests。 |

## 验证命令与结果

| 命令 | 结果 |
|---|---:|
| `npm test -- --runInBand tests/v8/v8_runtime_api_route_boundary.test.ts` | passed：1 suite / 2 tests |
| `npm run build` | passed |
| `npm test -- --runInBand tests/v8` | passed：8 suites / 27 tests |
| `npx prisma validate` | passed |
| `npm test -- --runInBand` | passed：29 suites / 207 tests |
| `git diff --check` | passed / no output |
| `grep -R "UPDATE[[:space:]].*nexus_tasks\|UPDATE[[:space:]].*task.*status\|better-sqlite3\|sqlite3\|data/nexus.db\|prisma/data/nexus.db\|\.db\.prepare\|\$queryRaw\|\$executeRaw" src/services/v8_runtime_api_service.ts \|\| true` | no output；新增 service 无裸 SQL/direct DB/legacy DB 依赖 |
| `git status --short --untracked-files=all \| grep -E '(^\|/)(dist\|node_modules)(/\|$)\|\.db(-wal\|-shm)?$\|\.sqlite(3)?$\|secret\|\.env\|proof.*\.json\|test_proof.*\.json' \|\| true` | no output；未产生 DB/dist/node_modules/secrets/proof JSON/env 污染 |
| `git ls-files data prisma/data dist src/webui/dist '*.db' '*.sqlite' '*.sqlite3' 'proof*.json' '*proof*.json' '.env' '*.env' \|\| true` | no output；未跟踪污染文件 |

## 已实现内容

1. V8 Runtime 主线新增核心 routes：
   - `POST /api/v1/runtime/projects`
   - `GET /api/v1/runtime/projects/:id`
   - `POST /api/v1/runtime/tasks`
   - `GET /api/v1/runtime/tasks/:id?project_id=...`
   - `POST /api/v1/runtime/runs`
   - `PATCH /api/v1/runtime/runs/:id/status`
   - `POST /api/v1/runtime/reports`
   - `PATCH /api/v1/runtime/reports/:id/status`
   - 保留既有 `POST /api/v1/runtime/tasks/transition` 调用 `transitionTask` FSM service。
2. Route boundary 收敛：V8 runtime route section 不直接拼 SQL、不调用 legacy DAL、不直接对 Prisma model 做 create/update/find；业务读写统一进入 service，再由 service 调 V8 repositories。
3. 状态变化边界：task lifecycle 迁移继续通过 `transitionTask` + `assertV8TransitionAllowed`，不新增裸 `UPDATE task.status`。
4. Project isolation：task/run/report create/update/get 均要求或使用 `project_id`；跨项目 task/run/report 请求返回 404，不泄露或误写另一个 project。
5. Legacy 边界说明保留：旧 `/tasks/claim`、`/tasks/:id/release`、`/tasks/:id/submit_proof`、T3.1/T3.3 旧 routes 仍留在 legacy/历史区块，本任务未冒充其为 V8 主线，也未扩大迁移范围。

## 剩余风险

1. `src/api/routes.ts` 中历史 `/api/v1/tasks/*`、`/api/v1/runs/*`、`submit_proof_v2` 等 legacy/迁移期 routes 仍存在直接 Prisma/DAL 状态写入；本任务按 AC 将 V8 Runtime 主线隔离到 `/api/v1/runtime/*`，未迁移/删除 legacy routes。
2. `V8RuntimeApiService` 当前只覆盖 projects/tasks/runs/reports 最小核心边界；Artifact/Review/Cron/WebUI/Daemon 接入应在 R3+ 或独立 R2 后续任务处理。
3. Run status schema 暂兼容 `failed` 与 V8 `error` 字符串，因历史 schema 注释/测试仍存在混合；后续可单独收敛 run status enum。
4. `git diff --name-only` 只显示已跟踪修改；本任务新增 service/test/proof 文件仍为 untracked，需 reviewer 审核后由 PM 决定提交策略。未执行 git push。

## 下一阶段输入

1. R2 后续若要彻底封禁旧状态入口，应对 legacy `/api/v1/tasks/:id/status`、`submit_proof_v2`、T3.1 routes 做兼容下线/迁移任务，不要在本任务内混改。
2. R3 Dispatcher/Daemon 应调用 `/api/v1/runtime/tasks/transition` 与 `/api/v1/runtime/runs/*`，禁止直接 SQL 或 legacy DAL。
3. Review/Report/Acceptance 主线接入时继续使用 project-scoped repositories/service，并延续本次 source-boundary denylist tests。
