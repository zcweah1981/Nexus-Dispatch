# Long Proof — V8-R7-T1 project_cronjobs schema/API

任务：`nexus-v8-r7-t1-cronjobs-schema-api`

范围：仅实现/验证 V8 `project_cronjobs` registry 的 project-scoped schema/API/service/repository 能力，用于后续 Cron 启停必须通过 registry 按 `project_id` 校验；不进入真实 Hermes cronjob 启停、不实现 Telegram session 自动启停、不进入 WebUI/生产 DB/ignored SQLite 迁移或 R7 后续 worker 调度。

## 前置阅读

已按调度要求阅读/复核：

- `docs/v8/README.md` — V8 clean rebuild baseline；R2+ 主线必须基于 Repository / Runtime API / FSM Controller。
- `docs/v8/legacy-dal-boundary.md` — V8 Cron Registry 不得回退 `src/db/dal.ts`、`better-sqlite3` 或 ignored SQLite。
- `docs/v8/prisma-schema-boundary.md` — Prisma schema / Client 是 V8 主线数据层契约，R1 已定义 `ProjectCronjob` / `project_cronjobs`。
- `docs/v8/long-proof-r6-t1-report-lifecycle.md` 至 `docs/v8/long-proof-r6-t5-delivery-proof.md` — R7 输入是 report/proof 队列已具备结构化回写能力；本卡只补 cron registry API，不做真实 delivery/cron backend。

## 修改文件

本卡主审范围（task-scoped）：

- `prisma/schema.prisma`
  - 复用/验证既有 `ProjectCronjob` model：`project_id`、`cronjob_id`、`name`、`schedule`、`status`、`owner_agent_id`、`config_json`、`last_run_at`，并有 `@@unique([project_id, cronjob_id])` / `@@index([project_id, status])` / `@@map("project_cronjobs")`。
  - 本轮未触碰生产 DB，也未创建 migration/ignored SQLite。
- `src/repositories/v8.ts`
  - 新增/补齐 `ProjectCronjobCreateInput`、`ProjectCronjobStatusUpdateInput`、`ProjectCronjobRepository`。
  - `bind(projectId, input)` 显式校验 project 存在，按 `project_id + cronjob_id` upsert，状态仅允许 `active|paused|disabled`。
  - `get/list/updateStatus` 全部按 `project_id` 分区；`updateStatus` 对非法状态 fail-fast。
- `src/services/v8_runtime_api_service.ts`
  - 接入 `ProjectCronjobRepository`。
  - 新增 `bindCronjob()` / `listCronjobs()` / `updateCronjobStatus()`；先 `getProject(projectId)`，再走 repository；非法 status 映射 400，缺失/跨项目映射 404。
- `src/api/schemas.ts`
  - 新增 `runtimeCronjobBindSchema` / `runtimeCronjobStatusUpdateSchema`。
- `src/api/routes.ts`
  - 新增 thin Runtime API routes：
    - `POST /api/v1/runtime/projects/cronjobs`
    - `GET /api/v1/runtime/projects/:projectId/cronjobs`
    - `PATCH /api/v1/runtime/projects/:projectId/cronjobs/:cronjobId/status`
  - route 仅做 schema validation、service 调用、state event；不直接 SQL，不触碰 legacy DAL。
- `tests/v8/v8_repositories.test.ts`
  - 新增 `ProjectCronjobRepository` contract：同一 `cronjob_id` 可跨项目独立绑定；list/get/status update project-scoped；unknown project/invalid status fail。
- `tests/v8/v8_runtime_api_route_boundary.test.ts`
  - 新增 Runtime API contract：bind/list/pause project cronjob；跨项目用另一项目 path 操作返回 404；unknown project 返回 404；source thin contract 要求 `ProjectCronjobRepository`。
- `docs/v8/long-proof-r7-t1-cronjobs-schema-api.md`
  - 本 proof 文档。

## TDD / 实现记录

| 阶段 | 命令/证据 | 结果 |
|---|---|---|
| Inspect | `git status --short --untracked-files=all`; grep `ProjectCronjob/project_cronjobs/cronjob` | 发现 schema 已有 `ProjectCronjob` model，但 Runtime API/service 未暴露 project_cronjobs 操作。工作区已有 R4/R5/R6 累计 dirty/untracked proof，本卡仅聚焦 cronjob diff。 |
| RED | `npm test -- --runInBand tests/v8/v8_repositories.test.ts tests/v8/v8_runtime_api_route_boundary.test.ts --testNamePattern "ProjectCronjobRepository\|projects/tasks/runs/reports Runtime routes"` | failed：API contract 对 `POST /api/v1/runtime/projects/cronjobs` 期望 201，实际 404；证明缺少 Runtime API route。Repository contract 在补实现后进入 GREEN。 |
| GREEN | 同 focused 命令 | passed：2 suites / 2 tests（7 skipped）。 |
| Full verification | `/tmp/nexus-v8-r7-t1-cronjobs-schema-api-verify.log` | exit 0；见下方验证。 |

## 验证命令与结果

完整验证日志：

- `/tmp/nexus-v8-r7-t1-cronjobs-schema-api-verify.log` — 87 lines，sha256 `d1e33268ebed8cd28fbbead625cd0d4242b84015be0f6d5bd5d1aeacdf84f34f`。
- `/tmp/nexus-v8-r7-t1-cronjobs-schema-api-summary.md` — sidecar summary，记录 `exit_status=0` / line count / sha256。
- HEAD：`5cf75df765d7e95ff19c2f541498a3cfba815bb9`。

| 命令 | 结果 |
|---|---|
| `npx prisma validate` | passed：schema valid。 |
| `npm test -- --runInBand tests/v8/v8_repositories.test.ts tests/v8/v8_runtime_api_route_boundary.test.ts --testNamePattern "ProjectCronjobRepository\|projects/tasks/runs/reports Runtime routes"` | passed：2 suites / 2 tests。 |
| `npm test -- --runInBand tests/v8` | passed：14 suites / 72 tests。 |
| `npm run build` | passed：`tsc` exit 0。 |
| `git diff --check` | passed：no whitespace error。 |
| source boundary scan (`src/repositories/v8.ts`, `src/services/v8_runtime_api_service.ts`, `src/api/routes.ts`, `src/api/schemas.ts`) | passed：`source_boundary_hits=[]`。 |
| runtime route thin cronjob scan | passed：`runtime_cronjob_route_forbidden_hits=[]`，`contains_service_calls=True`。 |
| pollution status scan | passed：`pollution_status_hits=[]`。 |
| tracked pollution scan | passed：`tracked_pollution_hits=[]`。 |

## 已实现内容

1. `project_cronjobs` Runtime API：支持绑定/列出/暂停或恢复（registry status update）项目 cronjob。
2. 项目隔离：所有 repository/service/API 操作显式携带并校验 `project_id`；同一 `cronjob_id` 可在不同项目分别绑定；跨项目 status update 返回 not found。
3. Cron 红线对齐：本卡只更新 registry 状态，不自动启停后台 cronjob；后续真实 cron backend 必须先查 registry 并按 `project_id` 校验。
4. API-only 主线：新增 route 走 V8 service/repository，无 direct SQL/legacy DAL/ignored DB。

## 剩余风险

1. 本卡没有接真实 Hermes cronjob scheduler adapter；`active/paused/disabled` 只是 registry 状态，不能宣称已启停后台任务。
2. `schedule` 当前仅按非空字符串校验，未做 cron expression 语义校验；建议后续 R7 scheduler adapter 卡统一校验。
3. 工作区仍存在进入本卡前的 R4/R5/R6 累计 dirty/untracked proof/source WIP；本卡 proof 已给出 task-scoped 修改范围，Reviewer 主审应聚焦 cronjob schema/API diff/proof，历史/未触碰文件仅列为非阻断观察。

## 下一阶段输入

- R7 后续 cron scheduler/worker 只可读取 `ProjectCronjobRepository.list(project_id, { status: 'active' })` 或对应 Runtime API 结果来决定可运行 job。
- 真实启停/执行 cronjob 前必须校验 `project_id + cronjob_id` registry ownership，不得依赖 Telegram session 当前上下文或全局 cronjob id。
- 若需要记录运行结果，可复用 R6 `Report` queue 与 `Artifact(report_proof)` runtime proof 回写路径。
