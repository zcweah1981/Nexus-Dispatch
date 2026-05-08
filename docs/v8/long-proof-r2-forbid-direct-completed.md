# Long Proof — V8-R2-T3 Forbid Direct Completed Transition

任务：`nexus-v8-r2-t3-forbid-direct-completed`
范围：仅执行 R2 Runtime API + FSM Controller 的 direct completed transition gate；未进入 R3-R9 Daemon / Review / Report / Cron / WebUI 行为实现，未触碰生产 DB 或 ignored SQLite。

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

## 修改文件

- `src/fsm/v8_state_matrix.ts` — 移除 `completion_pending -> completed` 直达边；`completed` 只能由 `review_pending -> completed` 进入，强制 completion_pending + review gate。
- `tests/v8/v8_fsm_state_matrix.test.ts` — 补 FSM contract：`completion_pending -> completed` 为非法，allowed next states 不再包含 `completed`。
- `tests/v8/v8_transition_task_service.test.ts` — 补 Runtime service/API contract：`created/dispatched/running` 不能通过 `auto_complete` 或 `review_pass` 直达 `completed`；`running -> completion_pending -> review_pending -> completed` 为唯一正向完成链路。
- `docs/v8/long-proof-r2-forbid-direct-completed.md` — 本 proof 文件。

## TDD 记录

| 阶段 | 命令 | 结果 |
|---|---|---|
| RED | `npm test -- --runInBand tests/v8/v8_transition_task_service.test.ts tests/v8/v8_fsm_state_matrix.test.ts` | 预期失败：`completion_pending -> completed` 仍被允许；Runtime `auto_complete` 从 `completion_pending` resolved instead of rejected；FSM allowed next states 仍包含 `completed`。 |
| GREEN | `npm test -- --runInBand tests/v8/v8_transition_task_service.test.ts tests/v8/v8_fsm_state_matrix.test.ts` | passed：2 suites / 9 tests。 |

## 验证命令与结果

| 命令 | 结果 |
|---|---:|
| `npx prisma validate` | passed |
| `npm run build` | passed |
| `npm test -- --runInBand tests/v8/v8_transition_task_service.test.ts tests/v8/v8_fsm_state_matrix.test.ts` | passed：2 suites / 9 tests |
| `npm test -- --runInBand tests/v8` | passed：7 suites / 25 tests |
| `git diff --check` | passed / no output |
| `grep -R "UPDATE[[:space:]].*task.*status\|better-sqlite3\|sqlite3\|data/nexus.db\|prisma/data/nexus.db" src/services src/fsm tests/v8/v8_transition_task_service.test.ts tests/v8/v8_fsm_state_matrix.test.ts \|\| true` | no output；本次触达范围未新增裸 SQL/direct DB/legacy DAL 依赖。 |
| `git status --short --untracked-files=all \| grep -E '(^\|/)(dist\|node_modules)(/\|$)\|\.db(-wal\|-shm)?$\|\.sqlite(3)?$\|secret\|\.env\|proof.*\.json\|test_proof.*\.json' \|\| true` | no output；未产生 DB/dist/node_modules/secrets/proof JSON/env 污染。 |
| `git ls-files data prisma/data dist src/webui/dist '*.db' '*.sqlite' '*.sqlite3' 'proof*.json' '*proof*.json' '.env' '*.env' \|\| true` | no output；未跟踪污染文件。 |

## 已实现内容

1. 禁止 worker/API 从 `created`、`dispatched`、`running` 直接改成 `completed`：`transitionTask(... event='auto_complete'|'review_pass')` 对这些状态返回 `409 ILLEGAL_TRANSITION`。
2. 禁止 `completion_pending -> completed` 直达完成：必须先经 `request_review` 进入 `review_pending`。
3. 保留合法正向链路：`running -> completion_pending`（提交 completion proof/report）→ `review_pending`（proof/review gate）→ `completed`（review pass）。
4. 所有状态变化仍收敛在 `transitionTask` service + `assertV8TransitionAllowed`；没有新增裸 SQL 或直接 `UPDATE task.status`。
5. 既有 `transitionTask` project_id 分区、proof audit、run_id 同项目同任务校验继续由原 R2 service contract 覆盖。

## 剩余风险

1. 旧 `/api/v1/tasks/:id/status` legacy endpoint 仍在历史代码中存在，可按旧 schema 直接更新状态；本任务按 R2-T3 范围只收紧 V8 FSM/Runtime service，未迁移/删除 legacy endpoint。
2. 当前 gate 仍是静态 FSM matrix；后续若接入可配置 `FSMController`，必须保持默认 fail-closed，并禁止 controller 配置重新开放 direct completed。
3. R3+ Daemon/Worker 尚未全部改为调用 `transitionTask`；后续接入时必须传结构化 proof，并不能绕过 Runtime API/service。

## 下一阶段输入

1. R2 后续 Runtime API/FSM Controller 配置任务：将 controller override 与默认 matrix 合并时，增加 direct completed denylist contract。
2. R3 Dispatcher/Daemon 接入：worker 完成只能触发 `submit_completion`，reviewer pass 才能触发 `review_pass`。
3. legacy 状态 endpoint 迁移任务：对旧 `/api/v1/tasks/:id/status` 做兼容封禁或下线计划，避免历史入口绕过 V8 gate。
