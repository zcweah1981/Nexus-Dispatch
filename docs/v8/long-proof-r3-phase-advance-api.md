# Long Proof — V8-R3-T5 Phase Advance API 与 R3 总 Proof

任务：`nexus-v8-r3-t5-phase-advance-api`
范围：在 R3 explicit blueprint phase boundary 增加最小 phase advance API；复用 R3-T4 group summary proof gate；输出 R3 总 proof 与 R4 输入。不进入 daemon auto-thaw、dispatch/review/report 投递、cron、WebUI 或生产 DB 迁移。

## 前置阅读

- `docs/v8/README.md`
- `docs/v8/long-proof-r2-api-contract-tests.md`
- `docs/v8/long-proof-r3-blueprint-json-schema.md`
- `docs/v8/long-proof-r3-freeze-blueprint.md`
- `docs/v8/long-proof-r3-thaw-current-phase.md`
- `docs/v8/long-proof-r3-group-summary-proof-gate.md`

## 修改文件

- `src/engine/v8_blueprint_thaw.ts` — 新增 `advanceV8Phase()`：按同项目 frozen blueprint 中的 `from_phase_id/from_group_id` 定位当前 phase，只推进下一个 phase；无下一 phase 时返回 `null`；实际创建仍调用 `thawV8CurrentPhase()`，因此复用 R3-T4 group summary proof gate 与 project-scoped writes。
- `src/services/v8_runtime_api_service.ts` — 新增 `advancePhase()` service 方法，只做 project existence check 与 domain error 映射。
- `src/api/schemas.ts` — 新增 `runtimeBlueprintAdvancePhaseSchema`，要求 `project_id + blueprint_id + (from_phase_id | from_group_id)`，拒绝额外字段。
- `src/api/routes.ts` — 新增 thin route `POST /api/v1/runtime/blueprints/advance-phase`；只调用 `service.advancePhase()`、emit event、做 HTTP 映射；无下一 phase 返回 `204 No Content`。
- `tests/v8/v8_blueprint_thaw_current_phase.test.ts` — 新增 phase advance API contract test，覆盖 gate fail-closed、summary proof 后只推进下一 phase、幂等重复推进、终点 204、route thin/source denylist。
- `docs/v8/long-proof-r3-phase-advance-api.md` — 本 proof 文件。

## API Contract

`POST /api/v1/runtime/blueprints/advance-phase`

Request:

```json
{
  "project_id": "<project-id>",
  "blueprint_id": "<frozen-blueprint-id>",
  "from_phase_id": "r3-p1"
}
```

或：

```json
{
  "project_id": "<project-id>",
  "blueprint_id": "<frozen-blueprint-id>",
  "from_group_id": "v8-thaw-p1"
}
```

Response:

- `201 { result }`：下一 phase 首次 thaw，创建了 TaskGroup/Task。
- `200 { result }`：下一 phase 已 thaw，幂等返回 `created_task_ids: []` 与 `skipped_task_ids`。
- `204 No Content`：当前 phase 已是 blueprint 最后一阶段，无下一 phase。
- `409/GROUP_SUMMARY_PROOF_REQUIRED`：下一 phase 存在，但前序 group 未 archived 或缺少同项目 sent `group_summary` proof。
- `404/NOT_FOUND`：project / frozen blueprint / from phase/group 不存在或跨项目。

## 实现内容

1. phase advance 不直接创建 task/group；它只解析同项目 frozen blueprint，计算 next phase，再委托 `thawV8CurrentPhase()`。
2. 因为复用 `thawV8CurrentPhase()`，所有 DB 查询/写入继续按 `project_id` 分区，且非首 phase 前置 gate 仍要求同项目 archived group + sent group summary proof。
3. route 保持 thin：validation / service call / event emit / HTTP code mapping；未引入 direct SQLite、legacy DAL、raw SQL 或生产 DB 操作。
4. 状态变化仍停留在 R3 phase thaw 层：新 tasks 仅为 `created`，后续 dispatch/run/task lifecycle 必须继续走 R2 Runtime API / FSM Controller。
5. 终点用 `204 No Content` 表示 all done，避免 `200` 空数组语义歧义。

## R3 总 Proof

| R3 子阶段 | Proof | 核心输出 |
|---|---|---|
| R3-T1 Blueprint JSON Schema | `docs/v8/long-proof-r3-blueprint-json-schema.md` | frozen blueprint schema、runtime 字段拒绝、Ajv compatibility、ID/depends_on 校验。 |
| R3-T2 Freeze Blueprint | `docs/v8/long-proof-r3-freeze-blueprint.md` | `freezeV8Blueprint()` 把 parsed blueprint 存为 inert `project_blueprints.status='frozen'`，不创建 runtime rows。 |
| R3-T3 Thaw Current Phase/Group | `docs/v8/long-proof-r3-thaw-current-phase.md` | explicit thaw 当前 phase/group 到 TaskGroup/Task/TaskDependency；tasks 保持 `created`；route thin。 |
| R3-T4 Group Summary Proof Gate | `docs/v8/long-proof-r3-group-summary-proof-gate.md` | 后续 phase thaw 前要求前序 group archived + 同项目 sent `group_summary` proof。 |
| R3-T5 Phase Advance API | 本文件 | thin phase advance API：从当前 phase 推进一个 next phase，复用 T4 gate，终点 204。 |

## 验证命令与结果

| 命令 | 结果 |
|---|---|
| `npm test -- --runInBand tests/v8/v8_blueprint_thaw_current_phase.test.ts --testNamePattern='Runtime phase advance API'` | RED：新增测试先因 route 缺失返回 404；GREEN：1 passed。 |
| `npm test -- --runInBand tests/v8/v8_blueprint_thaw_current_phase.test.ts` | passed：1 suite / 6 tests。 |
| `npm test -- --runInBand tests/v8` | passed：11 suites / 42 tests。 |
| `npx prisma validate` | passed：schema valid。 |
| `npm run build` | passed：`tsc` exit 0。 |
| `npm test -- --runInBand` | passed：32 suites / 222 tests。 |
| `git diff --check` | passed：no output。 |
| source denylist：`grep -R "better-sqlite3\\|sqlite3\\|data/nexus.db\\|prisma/data/nexus.db\\|\\$queryRaw\\|\\$executeRaw" ...` | 仅命中测试中的 denylist regex 字符串；生产文件无 direct SQLite / ignored DB / raw query。 |
| pollution scan：`git status --short --untracked-files=all \| grep -E '(^\|/)(dist\|node_modules)(/\|$)\|\\.db(-wal\|-shm)?$\|\\.sqlite(3)?$\|secret\|\\.env\|proof.*\\.json\|test_proof.*\\.json' \|\| true` | no output。 |
| tracked pollution：`git ls-files data prisma/data dist src/webui/dist '*.db' '*.sqlite' '*.sqlite3' 'proof*.json' '*proof*.json' '.env' '*.env' \|\| true` | no output。 |

## 剩余风险

1. 本卡只提供显式 phase advance API，不实现 daemon 自动调用、不生成/投递 group summary report、不触碰 cron/WebUI。
2. group summary proof 仍以 `reports.payload_json` 中的 `group_id/task_group_id` 字符串绑定为 R3 最小合同；后续可替换为专用 summary artifact 或强结构字段。
3. ignored/runtime SQLite 未迁移；实际部署需后续安全迁移/初始化。

## R4 输入

- R4 daemon/phase gate 若要自动推进，只能调用 `POST /api/v1/runtime/blueprints/advance-phase` 或同等 `V8RuntimeApiService.advancePhase()`，不得绕过 R3 gate 或直接写 Task/TaskGroup。
- R4 report/closeout 必须定义并发送 `message_type='group_summary'`，payload 至少绑定 `project_id`、`group_id` 或 `task_group_id`；只有 sent proof 后才能推进下一 phase。
- R4 dispatch/review/report lifecycle 必须继续使用 R2 `/api/v1/runtime/tasks/transition` 与 project-scoped run/report APIs，不能恢复 legacy `/api/v1/tasks/:id/status` 直改路径。
- 建议 R4 gate tests 复用：`tests/v8/v8_blueprint_thaw_current_phase.test.ts`、`tests/v8/v8_transition_task_service.test.ts`、`tests/v8/v8_runtime_api_route_boundary.test.ts`。
