# Long Proof — V8-R8-T1 WebUI status display aligned to V8 FSM

任务：`nexus-v8-r8-t1-v8-status-display`
范围：仅修正 WebUI DAGView 的任务状态展示映射与回归合同；不进入后续 R8/R9 功能，不改 Runtime 状态流转，不触碰生产 DB / ignored SQLite / dist / node_modules / secrets / proof JSON / `.env`。

## 前置阅读

- `docs/v8/README.md` — V8 clean rebuild baseline；R2+ 主线必须基于 Repository / Runtime API / FSM Controller。
- `docs/v8/legacy-status-mapping.md` — legacy 状态只用于迁移说明：`validating -> completion_pending`、`review_spawned -> review_pending`、`failed -> run/report error 或 task retry/dead_letter`。
- `docs/v8/legacy-dal-boundary.md` — WebUI/R8 不得回退 `src/db/dal.ts`、`better-sqlite3` 或 ignored DB；读写必须经 API/Repository 边界。
- `docs/v8/prisma-schema-boundary.md` — V8 schema / Prisma Client 为主线数据层契约。
- `docs/v8/long-proof-r0-clean-rebuild-baseline.md` — R0 冻结旧线；WebUI 重构此前未进入。
- `docs/v8/long-proof-r2-fsm-state-matrix.md` — V8 task 状态枚举：`created/dispatched/running/completion_pending/review_pending/completed/retry_ready/blocked/dead_letter/cancelled`。
- `docs/v8/long-proof-r2-transition-task-service.md` — 状态变化统一走 Runtime API / service / FSM Controller；WebUI 只消费状态，不写状态。
- `docs/v8/long-proof-r7-t5-ops-runbook.md` — R8 输入：前端/可视化后续任务应保持只读展示与 V8 边界。

## 修改文件

- `src/webui/src/components/DAGView.tsx`
  - 新增 `V8TaskStatus` 与 `V8_TASK_STATUS_LABELS`，显式覆盖 V8 task FSM 全量状态。
  - 移除 legacy task status 展示路径：`accepted`、`validating`、`review_spawned`、`'failed'` 不再作为 DAGView 任务状态显示/事件分支。
  - `blocked/dead_letter/cancelled` 统一进入红色 problem 视觉桶；`completion_pending/review_pending/retry_ready` 进入蓝色 active/gated/retry 桶。
  - `run_created` 仅补 worker 信息，不再覆盖 task status；任务状态只从 V8 task status 字段归一化后展示。
- `tests/v8/v8_webui_status_display.test.ts`
  - 新增源级合同测试，锁定 WebUI 显式列出 V8 task 状态、禁止 legacy 状态字符串、并标注 V8 状态机边界。

## TDD 记录

| 阶段 | 命令 | 结果 |
|---|---|---|
| RED | `npm test -- --runInBand tests/v8/v8_webui_status_display.test.ts` | 预期失败：缺 `review_pending/retry_ready/blocked/dead_letter/cancelled` 显式展示，存在 `accepted/validating/review_spawned/failed` legacy 展示，缺 `V8_TASK_STATUS_LABELS`/`V8 状态机` 标记。 |
| GREEN | `npm test -- --runInBand tests/v8/v8_webui_status_display.test.ts` | passed：1 suite / 3 tests。 |

## 验证命令与结果

验证日志：`/tmp/nexus-v8-r8-t1-status-display-verify.log`

- lines：`132`
- sha256：`7aaf24f1034bf5eed22a6531039ab385f2946a9f67ef4f84989aa1ad0e8a0e42`
- summary：`/tmp/nexus-v8-r8-t1-status-display-summary.md`
- HEAD：`5cf75df fix(v8-r5): route standard completion through FSM`

| 命令 | 结果 |
|---|---|
| `npm test -- --runInBand tests/v8/v8_webui_status_display.test.ts` | passed：1 suite / 3 tests。 |
| `npm test -- --runInBand tests/v8` | passed：16 suites / 78 tests。 |
| `npx prisma validate` | passed：schema valid。 |
| `npm run build` | passed：root TypeScript build。 |
| `npm --prefix src/webui run build` | passed：Vite build，181 modules transformed。 |
| `git diff --check` | passed：无 whitespace error。 |
| task scoped source scan | passed：`WEBUI_V8_STATUS_SCAN_OK`；DAGView 无 `accepted/validating/review_spawned/'failed'/"failed"`，含全量 V8 状态与 `V8_TASK_STATUS_LABELS`。 |
| source boundary scan | passed：任务触碰文件无 `src/db/dal`、`better-sqlite3`、`sqlite3`、`data/nexus.db`、`prisma/data/nexus.db`、`$queryRaw`、`$executeRaw`、裸 SQL status update。 |
| pollution status scan | passed：`NO_POLLUTION_STATUS`，未新增/修改 DB、SQLite、dist、node_modules、secrets、proof JSON、`.env` 污染。 |
| tracked pollution scan | passed：`NO_TRACKED_POLLUTION`。 |

环境噪声：验证日志首行 `/root/.openclaw/completions/openclaw.bash: No such file or directory` 为 shell startup warning；所有验证命令 exit 0。

## 已实现内容

1. WebUI DAGView 状态展示对齐 V8 task FSM：
   - `created` → 灰色 idle。
   - `dispatched/running/completion_pending/review_pending/retry_ready` → 蓝色 active/gated/retry。
   - `completed` → 绿色 completed。
   - `blocked/dead_letter/cancelled` → 红色 problem。
2. WebUI 不再显示/消费 legacy task status：`accepted`、`validating`、`review_spawned`、legacy task `failed`。
3. 对未知/非 V8 task status fail-safe 归一为 `created`，避免 legacy 字符串在 UI title/状态标签中泄露。
4. SSE `run_created` 不再把任务强制显示成 running，只补 `workerId`；真实任务状态仍由 V8 `task_status_updated`/初始 API 数据驱动。
5. 新增 V8 WebUI 状态显示合同测试，防止后续回退 legacy 映射。

## 剩余风险 / 非阻断观察

1. 当前工作区存在前序 R4/R5/R6/R7 累计 dirty/untracked WIP（如 `prisma/schema.prisma`、`src/api/routes.ts`、R6/R7 proof/runbook 等）；本卡只触碰 `src/webui/src/components/DAGView.tsx` 与 `tests/v8/v8_webui_status_display.test.ts`，历史/未触碰文件问题应列为非阻断观察。
2. `npm --prefix src/webui run build` 会生成 `src/webui/dist`，该目录被 git ignore，最终 pollution status scan 未命中；未纳入本卡交付物。
3. 本卡只做 WebUI 状态显示对齐，不改 API 数据源；若旧 `/api/v1/tasks` 仍返回 legacy 状态，WebUI 会 fail-safe 显示为 `CREATED`，真正迁移/归一应由 Runtime API/service/FSM Controller 后续卡处理。

## 下一阶段输入

1. R8 后续 WebUI API 对齐：优先从 V8 Runtime API / project-scoped endpoint 读取任务列表，避免 legacy `/api/v1/tasks` 数据源返回旧状态。
2. 若需要更细 UI 语义，可在 V8 状态标签旁增加中文说明，但必须保持 source contract 禁止 legacy 状态字符串。
3. 后续任何状态变化仍必须走 V8 API/service/FSM Controller，WebUI 不直接写状态、不直接读 DB。
