# Long Proof — V8-R2-T5 API Contract Tests 与 R2 总 Proof

任务：`nexus-v8-r2-t5-api-contract-tests`
范围：仅补充并汇总 R2 Runtime API + FSM Controller contract tests/proof；未进入 R3-R9 Blueprint Freezer / Phase Gate / Daemon / Review / Report / Cron / WebUI 行为实现，未触碰生产 DB 或 ignored SQLite。

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
- `docs/v8/long-proof-r2-api-routes-controller-boundary.md`

## 修改文件

- `tests/v8/v8_transition_task_service.test.ts` — 增补 Runtime API legacy state rejected contract：当 task.status 为 V7.x legacy `validating` 时，`POST /api/v1/runtime/tasks/transition` 返回 `409 ILLEGAL_TRANSITION`，且不写 `Task.proof_data` / `task_transition_audit` artifact。
- `docs/v8/long-proof-r2-api-contract-tests.md` — 本 R2-T5 proof 与 R2 总 proof。

> 注：本 proof 也覆盖工作区内 R2 既有未提交文件：`src/fsm/v8_state_matrix.ts`、`src/services/v8_transition_task_service.ts`、`src/services/v8_runtime_api_service.ts`、`src/api/routes.ts`、`src/api/schemas.ts`、`tests/v8/v8_fsm_state_matrix.test.ts`、`tests/v8/v8_runtime_api_route_boundary.test.ts`、R2-T2/T3/T4 proof 文档。

## Contract 覆盖矩阵

| 验收项 | 覆盖测试 |
|---|---|
| 合法迁移 | `v8_fsm_state_matrix.test.ts`：`created -> dispatched -> running -> completion_pending -> review_pending -> completed`；`v8_transition_task_service.test.ts`：service/API happy path 与 review gate 完成链路。 |
| 非法迁移 | `v8_fsm_state_matrix.test.ts`：跳跃/回退/unknown fail-closed；`v8_transition_task_service.test.ts`：`auto_complete/review_pass` 从 created/dispatched/running 或 completion_pending 直达 completed 均 409。 |
| project isolation | `v8_transition_task_service.test.ts`：跨项目 task 404、跨项目 run proof 400；`v8_runtime_api_route_boundary.test.ts`：task/run/report 跨项目创建/读取/更新 404。 |
| proof required | `v8_transition_task_service.test.ts`：API 缺少 `proof` 返回 422；service normalize 要求 proof 为 object。 |
| legacy state rejected | `v8_fsm_state_matrix.test.ts`：`validating/review_spawned/failed` 不进入 V8 状态枚举；本次新增 `v8_transition_task_service.test.ts`：API 遇到 `validating` 返回 409 且无状态/审计副作用。 |
| API/service/FSM Controller 收敛 | `v8_runtime_api_route_boundary.test.ts` source contract：Runtime route section 不触碰 legacy DAL/direct SQL/Prisma direct writes；`v8_transition_task_service.test.ts` source contract：task write 使用 `updateMany({ where: { id, project_id } })`。 |

## TDD 记录

| 阶段 | 命令 | 结果 |
|---|---|---|
| RED/补充 | `npm test -- --runInBand tests/v8/v8_transition_task_service.test.ts` | 新增 legacy state rejected contract 后 focused suite 通过；当前实现已由 `assertV8TransitionAllowed` fail-closed 满足该合同，因此没有产生生产代码变更。 |
| GREEN/回归 | `npm test -- --runInBand tests/v8/v8_transition_task_service.test.ts` | passed：1 suite / 6 tests。 |

## R2 总实现内容

1. FSM 主线：`src/fsm/v8_state_matrix.ts` 定义 V8 task/run/review/report 状态与 fail-closed transition matrix；legacy 状态只保留在 mapping 文档/测试迁移证据中。
2. Runtime transition service：`transitionTask(project_id, task_id, event, proof)` 强制输入 `project_id/task_id/event/proof`，按 project-scoped repository 读取，事务内二次校验 `{ id, project_id }`，用 project-scoped `updateMany` 写状态与 `Task.proof_data` audit。
3. Direct completed gate：禁止 worker/API 从 `created/dispatched/running/completion_pending` 直达 `completed`；唯一正向链路是 `running -> completion_pending -> review_pending -> completed`。
4. Structured proof/audit：当 proof 携带同项目同任务 `run_id` 或存在同任务 run 时，写入 `task_transition_audit` artifact；跨项目/跨任务 run proof 返回 400，且不更新 task。
5. Runtime API routes：新增 `/api/v1/runtime/projects|tasks|runs|reports|tasks/transition` 主线 routes；route 只做 HTTP validation/mapping，业务进入 `V8RuntimeApiService` 或 `transitionTask`，不新增裸 SQL/direct SQLite/legacy DAL 状态写入。
6. Project isolation：所有 task/run/report 核心 API 读写都要求或携带 `project_id`；跨项目访问返回 404。
7. Contract tests：R2 tests 覆盖合法迁移、非法迁移、project isolation、proof required、legacy state rejected、route/source boundary、direct completed 禁止。

## 验证命令与结果

| 命令 | 结果 |
|---|---|
| `npx prisma validate` | passed：schema valid |
| `npm run build` | passed：`tsc` exit 0 |
| `npm test -- --runInBand tests/v8/v8_transition_task_service.test.ts` | passed：1 suite / 6 tests |
| `npm test -- --runInBand tests/v8` | passed：8 suites / 28 tests |
| `npm test -- --runInBand` | passed：29 suites / 208 tests；无本次 diff 引入失败 |
| `git diff --check` | passed：no output |
| `grep -R "src/db/dal\\|better-sqlite3\\|sqlite3\\|UPDATE .*status\\|update .*status\\|data/nexus.db\\|prisma/data/nexus.db\\|\\.db\\.prepare\\|\\$queryRaw\\|\\$executeRaw" src/services/v8_transition_task_service.ts src/services/v8_runtime_api_service.ts tests/v8/v8_transition_task_service.test.ts tests/v8/v8_runtime_api_route_boundary.test.ts \|\| true` | 仅命中测试内 denylist/source-contract 正则文本；新增 service 无 direct SQLite / raw status UPDATE / ignored DB 路径 |
| `git status --short --untracked-files=all \| grep -E '(^\|/)(dist\|node_modules)(/\|$)\|\\.db(-wal\|-shm)?$\|\\.sqlite(3)?$\|secret\|\\.env\|proof.*\\.json\|test_proof.*\\.json' \|\| true` | no output；未产生 DB/dist/node_modules/secrets/proof JSON/env 污染 |
| `git ls-files data prisma/data dist src/webui/dist '*.db' '*.sqlite' '*.sqlite3' 'proof*.json' '*proof*.json' '.env' '*.env' \|\| true` | no output；未跟踪污染文件 |

## 剩余风险

1. Legacy `/api/v1/tasks/*`、`submit_proof_v2`、部分迁移期 routes 仍存在历史直接状态写入；R2 仅隔离 `/api/v1/runtime/*` 主线，未在本任务混改旧入口。
2. FSM Controller 仍是静态 matrix/service 边界，尚未接入可配置 `FSMController` model；后续若允许配置覆盖，必须保持默认 fail-closed，并禁止重新打开 direct completed。
3. R3+ Dispatcher/Daemon 尚未全面调用 V8 Runtime API；后续接入时必须使用 `/api/v1/runtime/tasks/transition` 与 project-scoped run/report APIs。
4. 当前 R2 工作区含未提交源码/测试/proof 文件；本任务未执行 git push，需 reviewer/PM 按调度策略审 diff 后提交。

## R3 Blueprint Freezer + Phase Gate 输入

- Blueprint Freezer 必须冻结并引用 R2 Runtime API contract：所有运行态状态变化只能走 `/api/v1/runtime/tasks/transition` 或同等 service/FSM boundary。
- Phase Gate 必须把 R2 contract tests 纳入 gate：`tests/v8/v8_fsm_state_matrix.test.ts`、`tests/v8/v8_transition_task_service.test.ts`、`tests/v8/v8_runtime_api_route_boundary.test.ts`。
- R3 Dispatcher/Daemon 只能使用 project-scoped Runtime APIs，不得读写 SQLite、不得调用 legacy DAL、不得使用旧 `/api/v1/tasks/:id/status` 作为主线。
- Review/Report 接入必须传结构化 proof；完成必须经过 `completion_pending -> review_pending -> completed`，不能以 worker report 直接 completed。
- Phase Gate 污染扫描继续禁止 ignored SQLite、生产 DB、dist/node_modules/secrets/proof JSON/env 进入 repo/status。
