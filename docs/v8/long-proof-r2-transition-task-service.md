# Long Proof — V8-R2 transitionTask Runtime Service

任务：`nexus-v8-r2-t2-transition-task-service`
范围：仅执行 R2 Runtime API + FSM Controller 下的 `transitionTask(project_id, task_id, event, proof)` 服务/API 边界；未进入 R3-R9 Daemon / Review / Report / Cron / WebUI 行为实现，未触碰生产 DB 或 ignored SQLite。

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

## 修改文件

- `src/services/v8_transition_task_service.ts` — 新增 `transitionTask(ctx, { project_id, task_id, event, proof })` 服务；输入必填校验、事件到目标状态映射、调用 `assertV8TransitionAllowed('task', from, to)`、按 `project_id` 读取与事务内二次校验 task、写入 `Task.proof_data` 结构化 audit；当存在同任务 run 或 `proof.run_id` 指向同项目同任务 run 时写入 `artifact_type='task_transition_audit'`。
- `src/api/schemas.ts` — 新增 `taskTransitionSchema`，要求 `project_id/task_id/event/proof`。
- `src/api/routes.ts` — 新增 `POST /api/v1/runtime/tasks/transition` 薄路由：只做 schema validation、调用 service、映射 `400/404/409` 错误并发出 state_change。
- `tests/v8/v8_transition_task_service.test.ts` — 新增 V8-R2 contract tests：服务 happy path、structured audit artifact、跨项目 task 404、非法 FSM 409、跨项目 run proof 400、Runtime API body/schema 与 repeated illegal transition。
- `docs/v8/long-proof-r2-transition-task-service.md` — 本 proof 文件。

## TDD 记录

| 阶段 | 命令 | 结果 |
|---|---|---|
| RED | `npm test -- --runInBand tests/v8/v8_transition_task_service.test.ts` | 预期失败：新增跨项目 `proof.run_id` 合同收到 resolved，证明旧实现未校验 run 必须属于同 project/task；后续追加 source contract 防止事务内 task write 缺少 `project_id` where scope |
| GREEN | `npm test -- --runInBand tests/v8/v8_transition_task_service.test.ts` | passed：1 suite / 4 tests；已改为 `updateMany({ where: { id, project_id } })` 并回读 scoped task |

## 验证命令与结果

| 命令 | 结果 |
|---|---:|
| `npx prisma validate` | passed |
| `npm run build` | passed |
| `npm test -- --runInBand tests/v8/v8_transition_task_service.test.ts` | passed：1 suite / 4 tests |
| `npm test -- --runInBand tests/v8/v8_transition_task_service.test.ts tests/v8` | passed：7 suites / 24 tests |
| `npm test -- --runInBand` | passed：28 suites / 204 tests |
| `git diff --check` | passed / no output |
| `grep -R "src/db/dal\|better-sqlite3\|sqlite3\|UPDATE .*status\|update .*status\|data/nexus.db\|prisma/data/nexus.db" src/services/v8_transition_task_service.ts tests/v8/v8_transition_task_service.test.ts \|\| true` | no output；新 service/test 未引入 legacy DAL、direct SQLite 或裸 SQL status update |
| `git status --short --untracked-files=all \| grep -E '(^\|/)(dist\|node_modules)(/\|$)\|\.db(-wal\|-shm)?$\|\.sqlite(3)?$\|secret\|\.env\|proof.*\.json\|test_proof.*\.json' \|\| true` | no output；未产生 DB/dist/node_modules/secrets/proof JSON/env 污染 |
| `git ls-files data prisma/data dist src/webui/dist '*.db' '*.sqlite' '*.sqlite3' 'proof*.json' '*proof*.json' '.env' '*.env' \|\| true` | no output；未跟踪污染文件 |

## 已实现内容

1. `transitionTask` 输入强制包含 `project_id`、`task_id`、`event`、`proof`；`proof` 必须是 object。
2. 所有 task 读取按 `TaskRepository.get(project_id, task_id)` 分区；事务内再次用 `{ id, project_id }` 查询，并用 `tx.task.updateMany({ where: { id, project_id } })` 做 project-scoped 写入，防止跨项目迁移。
3. 状态迁移统一调用 `assertV8TransitionAllowed`，非法迁移返回 `409 ILLEGAL_TRANSITION`。
4. 跨项目或不存在 task 不泄露目标 task，返回 `404 NOT_FOUND`。
5. `Task.proof_data` 写入结构化 audit：`audit_id/project_id/task_id/event/from_status/to_status/proof/created_at`。
6. 若 `proof.run_id` 显式提供，必须属于同一 `project_id + task_id`，否则返回 `400 BAD_REQUEST`；通过后写入 `task_transition_audit` artifact。
7. 若未提供 `proof.run_id` 但同 task 已存在 run，则使用最新 run 写入 audit artifact；无 run 时不伪造 placeholder run，只保留 task proof audit。
8. Runtime API 新入口为 `POST /api/v1/runtime/tasks/transition`，路由保持 thin boundary，没有新增 legacy DAL/direct SQL 状态更新路径。

## 剩余风险

1. 旧 `/api/v1/tasks/:id/status` endpoint 仍存在历史 direct update 逻辑；本任务按 R2-T2 范围未改 legacy endpoint，只新增 V8 Runtime transition boundary。后续如需完全封禁旧状态入口，应单独派迁移/兼容任务。
2. 当前 event 到目标状态映射是最小 V8 Runtime 合同，尚未接入可配置 `FSMController` model；后续 R2 FSM Controller 配置任务可在保持 fail-closed 默认矩阵下扩展。
3. ArtifactRepository 尚未在 R1 暴露，本任务在 service 事务内通过 Prisma Client 写入 `Artifact`；未使用裸 SQL，也未打开 SQLite 文件。

## 下一阶段输入

1. R2 后续可将更多 runtime task lifecycle 入口迁到 `transitionTask`，逐步淘汰旧 direct status endpoint。
2. FSM Controller 配置读取应保持 `project_id` 隔离，并默认回退到 `src/fsm/v8_state_matrix.ts` 的 fail-closed matrix。
3. R3+ Dispatcher/Daemon 调用状态迁移时必须传入结构化 proof，并优先提供同任务 `run_id` 以生成 `task_transition_audit` artifact。
