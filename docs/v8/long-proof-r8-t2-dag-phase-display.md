# Long Proof — V8-R8-T2 DAG/phase/group/next responsible 展示

任务：`nexus-v8-r8-t2-dag-phase-display`
范围：仅做 WebUI DAGView 展示合同与最小前端展示实现；不改 Runtime 状态流转、不进入后续阶段、不触碰生产 DB / ignored SQLite / dist / node_modules / secrets / proof JSON / `.env`。

## 前置阅读

- `docs/v8/README.md` — V8 clean rebuild baseline；R2+ 主线必须基于 Repository / Runtime API / FSM Controller。
- `docs/v8/legacy-status-mapping.md` — legacy 状态不得进入 V8 新主流程展示。
- `docs/v8/legacy-dal-boundary.md` — WebUI/R8 不得回退 legacy DAL/direct SQLite。
- `docs/v8/prisma-schema-boundary.md` — V8 schema / Prisma Client 为主线数据契约。
- `docs/v8/long-proof-r2-fsm-state-matrix.md` — V8 task 状态枚举。
- `docs/v8/long-proof-r2-transition-task-service.md` — 状态变化统一走 Runtime API / service / FSM Controller。
- `docs/v8/long-proof-r3-thaw-current-phase.md` — phase/group thaw 写入 TaskGroup/Task/TaskDependency，任务保持 `created`。
- `docs/v8/long-proof-r3-group-summary-proof-gate.md` 与 `docs/v8/long-proof-r3-phase-advance-api.md` — 后续 phase gate / group summary proof 边界。
- `docs/v8/long-proof-r8-t1-v8-status-display.md` — R8-T1 已完成 V8 task status 展示对齐，本卡在此基础上补 DAG/phase/group/next responsible。

## 修改文件

- `src/webui/src/components/DAGView.tsx`
  - 新增 `V8_DAG_DISPLAY_CONTRACT` 展示边界标记。
  - 在节点数据中补 `phaseId`、`groupId`、`nextResponsible`、`dependencies`。
  - 在节点卡片中展示 `Phase:`、`Group:`、`Next:`、`Deps:`。
  - 新增 `buildDependencyEdges()`，从 API 返回的 `outgoing_deps/dependencies` 构建 ReactFlow DAG 边：`source=depends_on_id`、`target=task.id`。
  - 新增 `deriveNextResponsible()`：completed/cancelled/dead_letter 无下一责任人；review/completion pending 指向 Reviewer；blocked 指向 PM；created/dispatched/running/retry 指向 Worker/lane。
  - 初始 fetch 改为 `/api/v1/tasks?limit=100&include_graph=true`，只通过 API 获取展示元数据；无 direct DB。
- `tests/v8/v8_webui_dag_phase_group_display.test.ts`
  - 新增源级合同测试，锁定 DAG/phase/group/next responsible 展示、依赖边生成、API-only 边界与 direct DB denylist。

## TDD 记录

| 阶段 | 命令 | 结果 |
|---|---|---|
| RED | `npm test -- --runInBand tests/v8/v8_webui_dag_phase_group_display.test.ts` | 预期失败：缺 `V8_DAG_DISPLAY_CONTRACT`、`buildDependencyEdges`、`deriveNextResponsible`、`phaseId/groupId/nextResponsible/dependencies`、`include_graph=true`。 |
| GREEN | `npm test -- --runInBand tests/v8/v8_webui_dag_phase_group_display.test.ts tests/v8/v8_webui_status_display.test.ts` | passed：2 suites / 7 tests。 |

## 验证命令与结果

验证日志：`/tmp/nexus-v8-r8-t2-dag-phase-display-verify.log`

- lines：`131`
- sha256：`4c1e09ba65e9566a1751810461f6b259fbc70a349a56f11ef63d43a784ce5f6f`
- summary：`/tmp/nexus-v8-r8-t2-dag-phase-display-summary.md`
- HEAD：`5cf75df fix(v8-r5): route standard completion through FSM`

| 命令 | 结果 |
|---|---|
| `npm test -- --runInBand tests/v8/v8_webui_dag_phase_group_display.test.ts tests/v8/v8_webui_status_display.test.ts` | passed：2 suites / 7 tests。 |
| `npm test -- --runInBand tests/v8` | passed：17 suites / 82 tests。 |
| `npx prisma validate` | passed：schema valid。 |
| `npm run build` | passed：root TypeScript build。 |
| `npm --prefix src/webui run build` | passed：Vite build，181 modules transformed。 |
| `git diff --check` | passed：无 whitespace error。 |
| task scoped source scan | passed：`WEBUI_DAG_SCAN_OK`。 |
| V8 status legacy scan | passed：`WEBUI_STATUS_LEGACY_SCAN_OK`。 |
| pollution status scan | passed：`NO_POLLUTION_STATUS`。 |
| tracked pollution scan | passed：`NO_TRACKED_POLLUTION`。 |

环境噪声：验证日志首行 `/root/.openclaw/completions/openclaw.bash: No such file or directory` 为 shell startup warning；所有验证命令 exit 0。

## 已实现内容

1. DAGView 节点卡片展示 phase、group、next responsible 与依赖数量。
2. DAGView 从 API payload 的 `outgoing_deps/dependencies` 构建 ReactFlow DAG edges，展示任务依赖方向。
3. next responsible 展示遵循 V8 状态语义：Worker / Reviewer / PM / No next responsible。
4. 保持 R8-T1 状态展示合同：legacy task status 不进入 DAGView 源码展示路径。
5. 保持只读展示边界：本卡不写状态、不改 Runtime API/FSM Controller、不直接读 DB。

## 剩余风险 / 非阻断观察

1. 当前工作区存在前序 R4/R5/R6/R7/R8-T1 累计 dirty/untracked WIP；本卡新增/修改仅限 `src/webui/src/components/DAGView.tsx`、`tests/v8/v8_webui_dag_phase_group_display.test.ts` 与本 proof 文档。
2. `/api/v1/tasks?include_graph=true` 的后端完整 graph metadata 语义仍依赖后续 API 对齐；本卡只做 WebUI 可消费字段与 fail-safe 展示。
3. `npm --prefix src/webui run build` 会生成 ignored `src/webui/dist`，最终 pollution scan 未命中，未纳入交付物。

## 下一阶段输入

1. R8 后续 API 对齐卡：让 WebUI 优先消费 V8 Runtime API / project-scoped endpoint，并显式返回 `taskGroup.group_id/phase_id`、`outgoing_deps.depends_on_id`、reviewer/lane 元数据。
2. 若要更精确的 next responsible，可由 Runtime API 输出标准字段；WebUI 当前只根据 task status + reviewer/lane fail-safe 推导。
3. 后续任何状态变化仍必须走 V8 API/service/FSM Controller，WebUI 不直接写状态、不直接读 DB。
