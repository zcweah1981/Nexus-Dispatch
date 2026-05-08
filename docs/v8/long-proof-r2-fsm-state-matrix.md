# Long Proof — V8-R2 FSM State Matrix

任务：`nexus-v8-r2-t1-fsm-state-matrix`
范围：仅执行 R2 Runtime API + FSM Controller 的状态枚举 / transition matrix 输入；未进入 R3-R9 Daemon / Review / Report / Cron / WebUI 行为实现，未触碰生产 DB 或 ignored SQLite。

## 前置阅读

- `docs/v8/README.md`
- `docs/v8/long-proof-r0-clean-rebuild-baseline.md`
- `docs/v8/long-proof-r1-prisma-schema.md`
- `docs/v8/long-proof-r1-migration-test-db.md`
- `docs/v8/long-proof-r1-repositories.md`
- `docs/v8/long-proof-r1-legacy-dal-boundary.md`
- `docs/v8/prisma-schema-boundary.md`
- `docs/v8/legacy-dal-boundary.md`

## 修改文件

- `src/fsm/v8_state_matrix.ts` — 新增 V8 task/run/review/report 状态枚举、迁移矩阵与 fail-closed helper：`isV8State`、`canTransitionV8`、`getAllowedV8NextStates`、`assertV8TransitionAllowed`。
- `tests/v8/v8_fsm_state_matrix.test.ts` — 新增 V8 FSM contract 单测，覆盖状态枚举、合法/非法迁移、legacy 状态不进入主流程、未知 entity/state fail-closed。
- `docs/v8/legacy-status-mapping.md` — 新增 legacy-only mapping 文档；`validating`、`review_spawned`、`failed` 只在本文件和测试迁移证据中出现，不从主线 FSM module 导出。
- `docs/v8/README.md` — 补充 R2 FSM module 与 legacy mapping 边界入口。
- `docs/v8/long-proof-r2-fsm-state-matrix.md` — 本 proof 文件。

## TDD 记录

| 阶段 | 命令 | 结果 |
|---|---|---|
| RED | 临时移出预置实现后运行 `npm test -- --runInBand tests/v8/v8_fsm_state_matrix.test.ts` | 预期失败：`Cannot find module '../../src/fsm/v8_state_matrix'` |
| GREEN | `npm test -- --runInBand tests/v8/v8_fsm_state_matrix.test.ts` | 1 suite / 4 tests passed |

## 验证命令与结果

| 命令 | 结果 |
|---|---:|
| `npx prisma validate` | passed |
| `npm run build` | passed |
| `npm test -- --runInBand tests/v8` | passed：6 suites / 20 tests |
| `npm test -- --runInBand` | passed：27 suites / 200 tests |
| `git diff --check` | passed / no output |
| `grep -R "validating\|review_spawned\|failed" src/fsm \|\| true` | no output，主线 FSM module 未包含 legacy 禁用状态 |
| `grep -R "better-sqlite3\|sqlite3\|UPDATE .*status\|update .*status" src/fsm tests/v8/v8_fsm_state_matrix.test.ts docs/v8/legacy-status-mapping.md \|\| true` | no output，未新增直接 DB / 裸 SQL 状态更新 |
| `git status --short --untracked-files=all \| grep -E '(^\|/)(dist\|node_modules)(/\|$)\|\.db(-wal\|-shm)?$\|\.sqlite(3)?$\|secret\|\.env\|proof.*\.json\|test_proof.*\.json' \|\| true` | no output，未产生 DB/dist/node_modules/secrets/proof JSON 污染 |
| `git ls-files data prisma/data dist src/webui/dist '*.db' '*.sqlite' '*.sqlite3' 'proof*.json' '*proof*.json' '.env' '*.env' \|\| true` | no output，未跟踪污染文件 |

## 已实现内容

1. 定义 V8 task 状态：`created`、`dispatched`、`running`、`completion_pending`、`review_pending`、`completed`、`retry_ready`、`blocked`、`dead_letter`、`cancelled`。
2. 定义 V8 run 状态：`created`、`running`、`success`、`cancelled`、`error`。
3. 定义 V8 review 状态：`created`、`dispatched`、`running`、`passed`、`changes_requested`、`blocked`、`cancelled`。
4. 定义 V8 report 状态：`pending`、`sending`、`sent`、`suppressed`、`error`。
5. 为四类 entity 提供显式 transition matrix；terminal 状态默认无后继，未知 entity/state 默认拒绝。
6. 明确 legacy 状态映射只存在于文档：`validating -> task.completion_pending`、`review_spawned -> task.review_pending`、`failed -> run.error/report.error/task.retry_ready|dead_letter`。

## 剩余风险

1. 本任务只提供 FSM 状态与矩阵输入，尚未把 Runtime API status update endpoint 接入 `assertV8TransitionAllowed`；该工作应由后续 R2 API/FSM Controller 任务完成。
2. Prisma schema 中部分历史注释仍提到旧 run/report status 字符串；本任务按 AC 仅新增主线 FSM module，不做 schema/comment 语义大改，避免扩大范围。
3. 现有 legacy 路径仍作为 archive/reference 留存；后续 API/Service/FSM Controller 接入时仍需 denylist test 防止回退到 `src/db/dal.ts` 或直接 SQL。

## 下一阶段输入

1. R2 后续 Runtime API：所有状态更新入口统一调用 V8 FSM helper，并按 `project_id` 分区读写。
2. FSM Controller：按 `project_id` 读取/覆盖矩阵配置时必须保持 fail-closed 默认矩阵，不允许 legacy 状态进入新主流程。
3. Service 层：禁止裸 SQL `UPDATE task.status`；状态变化必须收敛到 API/service/FSM Controller。
