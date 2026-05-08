# Long Proof — V8-R3-T3 Thaw Current Phase/Group

任务：`nexus-v8-r3-t3-thaw-current-phase`
范围：实现显式 thaw 当前 phase/group 的 V8 service + Runtime API；只从 frozen blueprint 生成当前 phase 对应的 `TaskGroup` 与 `Task`/`TaskDependency`，不进入后续 phase gate / daemon dispatch / review / report / cron / WebUI 行为，未触碰生产 DB 或 ignored SQLite。

## 前置阅读

- `docs/v8/README.md`
- `docs/v8/long-proof-r0-clean-rebuild-baseline.md`
- `docs/v8/legacy-dal-boundary.md`
- `docs/v8/prisma-schema-boundary.md`
- `docs/v8/long-proof-r2-api-contract-tests.md`
- `docs/v8/long-proof-r3-blueprint-json-schema.md`
- `docs/v8/long-proof-r3-freeze-blueprint.md`

## 修改文件

- `src/engine/v8_blueprint_thaw.ts` — 新增 `thawV8CurrentPhase()`，读取同项目 frozen blueprint，按 `phase_id` 或 `group_id` 只 thaw 当前 phase，创建 `TaskGroup`、`Task`、同项目 `TaskDependency`，并保持 tasks 初始 `created`。
- `src/services/v8_runtime_api_service.ts` — Runtime service 增加 `thawCurrentPhase()`，把 thaw 错误映射为标准 `V8RuntimeApiError`。
- `src/api/schemas.ts` — 新增 `runtimeBlueprintThawCurrentPhaseSchema`，要求 `project_id + blueprint_id + phase_id/group_id`。
- `src/api/routes.ts` — 新增 thin route `POST /api/v1/runtime/blueprints/thaw-current-phase`，只做 validation/HTTP 映射和 event emit，业务进入 service。
- `prisma/schema.prisma` — 将 `TaskGroup.group_id` 从历史全局 unique 修正为 `@@unique([project_id, group_id])`，满足 thaw 的 project-scoped group 隔离。
- `src/db/prisma_dal.ts` — 同步历史 PrismaDAL 中 `TaskGroup` 查询为 `findFirst`/`id` 写入，避免 schema 改为项目级唯一后 build 失败；V8 调用可传入 `projectId` 精确隔离，历史无 project_id group 保留兼容 fallback；未引入新 direct SQL。
- `tests/v8/v8_blueprint_thaw_current_phase.test.ts` — 新增 R3-T3 focused contracts：service thaw、idempotency/project isolation、跨项目同名 `group_id`、Runtime API thin route/source boundary。
- `docs/v8/long-proof-r3-thaw-current-phase.md` — 本 proof 文件。

## 实现内容

1. `thawV8CurrentPhase()` 只读取 `project_blueprints` 中同 `project_id`、同 `blueprint_id`、`status='frozen'` 的 blueprint；跨项目或未冻结 blueprint 返回 `404/NOT_FOUND`。
2. thaw 输入必须显式提供 `phase_id` 或 `group_id`；不会自动推进下一阶段，也不会 thaw 后续 phase。
3. 创建当前 phase 对应 `task_groups`：`project_id` scoped，`group_id/name/description/priority/ext_meta` 来自 blueprint。
4. 创建当前 phase tasks：写入 `project_id`、`task_group_id`、`payload/payload_schema/ext_meta/acceptance_criteria/reviewer/acceptance_mode/max_retries`；状态保持 `created`，后续 dispatch/status 必须走 R2 Runtime API/FSM Controller。
5. 创建同项目 DAG 依赖：`depends_on` 写入 `task_dependencies(project_id, task_id, depends_on_id)`；目标 task 不在当前项目可用范围内会 fail-closed。
6. 幂等：重复 thaw 不重复创建 TaskGroup/Task/TaskDependency，返回 `skipped_task_ids`；API 首次创建返回 `201`，幂等重复可返回 `200`。
7. 多项目隔离：`TaskGroup.group_id` 不再全局唯一，改为 `@@unique([project_id, group_id])`；不同项目可 thaw 各自 frozen blueprint 中同名 `group_id`，同项目仍保持唯一。
8. API route 保持 thin：`POST /api/v1/runtime/blueprints/thaw-current-phase` 只调用 `service.thawCurrentPhase()`，不在 route 中直接创建 task/group/dependency 或调用 direct SQL/legacy DAL。

## 验证命令与结果

| 命令 | 结果 |
|---|---|
| `npm test -- --runInBand tests/v8/v8_blueprint_thaw_current_phase.test.ts` | passed：1 suite / 4 tests |
| `npm test -- --runInBand tests/v8` | passed：11 suites / 40 tests |
| `npx prisma validate` | passed：schema valid |
| `npm run build` | passed：`tsc` exit 0 |
| `npm test -- --runInBand` | passed：32 suites / 220 tests |
| `git diff --check` | passed：no output |
| `grep -R "better-sqlite3\|sqlite3\|data/nexus.db\|prisma/data/nexus.db\|\$queryRaw\|\$executeRaw" src/engine/v8_blueprint_thaw.ts src/services/v8_runtime_api_service.ts src/api/routes.ts tests/v8/v8_blueprint_thaw_current_phase.test.ts \|\| true` | 仅命中测试内 source-boundary denylist 字符串；生产 thaw/service/route 无 direct SQLite / ignored DB 路径 / raw query。 |
| `git status --short --untracked-files=all \| grep -E '(^\|/)(dist\|node_modules)(/\|$)\|\.db(-wal\|-shm)?$\|\.sqlite(3)?$\|secret\|\.env\|proof.*\.json\|test_proof.*\.json' \|\| true` | no output；无 DB/dist/node_modules/secrets/proof JSON/env 污染。 |
| `git ls-files data prisma/data dist src/webui/dist '*.db' '*.sqlite' '*.sqlite3' 'proof*.json' '*proof*.json' '.env' '*.env' \|\| true` | no output；无 tracked 污染文件。 |

## 剩余风险

1. 本卡只实现显式 thaw 当前 phase/group；未实现自动 phase gate、daemon tick auto-thaw、review/report/cron/WebUI 接入。
2. 本卡已将 V8 schema 的 `TaskGroup.group_id` 修正为项目级唯一；现有 ignored/runtime SQLite 需由后续安全迁移/初始化流程应用 schema，本文未触碰生产 DB。
3. Review policy resolver 仍属于后续 dispatch/review 阶段；本卡仅复制 blueprint 中显式 `reviewer` snapshot，不做 reviewer 策略推导。
4. 已创建 tasks 处于 `created`，下一阶段必须继续通过 Runtime API/FSM transition dispatch/start/complete，不得绕过 R2 状态链路。

## 下一阶段输入

- 可复用 API：`POST /api/v1/runtime/blueprints/thaw-current-phase`，body：`{ "project_id", "blueprint_id", "phase_id" }` 或 `{ "project_id", "blueprint_id", "group_id" }`。
- 可复用 focused gate：`npm test -- --runInBand tests/v8/v8_blueprint_thaw_current_phase.test.ts`。
- 后续 phase gate/daemon 只应调用该 service/API，且 dispatch/status 流转继续走 `/api/v1/runtime/tasks/transition`。
