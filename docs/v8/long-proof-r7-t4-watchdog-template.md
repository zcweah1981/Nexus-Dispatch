# Long Proof — V8-R7-T4 watchdog/patrol prompt 模板化

任务：`nexus-v8-r7-t4-watchdog-template`

范围：仅在 V8 `project_cronjobs` registry 边界内，为 watchdog/patrol 类 cronjob 增加只读 prompt 模板渲染能力；不实现真实 Hermes cronjob 启停、不实现 Telegram 投递/自动巡检 worker、不修改生产/ignored SQLite，不进入后续 R7/R8 阶段。watchdog/patrol 输出定位为只读观察输入，严禁自动修复。

## 前置阅读

已按调度要求阅读/复核：

- `docs/v8/README.md` — V8 clean rebuild baseline；R2+ 主线必须基于 Repository / Runtime API / FSM Controller。
- `docs/v8/legacy-dal-boundary.md` — legacy DAL 只读/archive；V8 Cron Registry 不得回退 `src/db/dal.ts`、`better-sqlite3` 或 ignored DB。
- `docs/v8/prisma-schema-boundary.md` — Prisma schema / Client 是 V8 主线数据层契约。
- `docs/v8/legacy-test-classification.md` — legacy tests 只作 archive 参考，默认验证使用 `tests/v8/**`。
- `docs/v8/long-proof-r6-t5-delivery-proof.md` — R7 输入已有结构化 proof/artifact 回写能力；本卡不做真实 delivery。
- `docs/v8/long-proof-r7-t1-cronjobs-schema-api.md` — `project_cronjobs` registry 已具备 project-scoped schema/API/service/repository；Cron 启停仍须通过 registry 校验，本卡只补 prompt 模板渲染。

## 修改文件

本卡新增/修改：

- `src/repositories/v8.ts`
  - 新增 `ProjectCronjobPromptRenderInput`。
  - 新增 `renderPrompt(projectId, cronjobId, input)`：按 `project_id + cronjob_id` 读取 cronjob，读取 `config_json.prompt_template`，渲染允许变量。
  - 新增默认 watchdog/patrol 模板，包含项目、cronjob、模式、计划、maintenance、时间。
  - 强制追加只读 guardrail：仅观察、不得自动修复、不得启停 cronjob、不得修改任务/报告/DB 状态、所有发现按 `project_id` 分区。
  - 未知模板变量 fail-fast，避免 `{{secret_token}}` 等未定义/敏感占位符静默进入 prompt。
- `tests/v8/v8_watchdog_prompt_template.test.ts`
  - 新增 fail-first contract：自定义 `prompt_template` 可按项目隔离渲染，输出包含只读 guardrail，不串入其他项目。
  - 新增默认 patrol 模板 contract，并验证未知变量拒绝。
- `docs/v8/long-proof-r7-t4-watchdog-template.md`
  - 本 proof 文档。

## TDD / 实现记录

| 阶段 | 命令/证据 | 结果 |
|---|---|---|
| Inspect | `git status --short --untracked-files=all`; `grep watchdog/patrol`; 阅读 R6/R7 proof | 当前树无 watchdog/patrol prompt 模板化实现；R7-T1 已有 `ProjectCronjobRepository` 与 `config_json` 边界。 |
| RED | `npm test -- --runInBand tests/v8/v8_watchdog_prompt_template.test.ts` | failed：`Property 'renderPrompt' does not exist on type 'ProjectCronjobRepository'`。 |
| GREEN focused | `npm test -- --runInBand tests/v8/v8_watchdog_prompt_template.test.ts` | passed：1 suite / 2 tests。 |
| Focused regression | `npm test -- --runInBand tests/v8/v8_watchdog_prompt_template.test.ts tests/v8/v8_repositories.test.ts tests/v8/v8_runtime_api_route_boundary.test.ts` | passed：3 suites / 12 tests。 |
| V8 suite | `npm test -- --runInBand tests/v8` | passed：15 suites / 75 tests。 |

## 验证命令与结果

完整验证日志：

- `/tmp/nexus-v8-r7-t4-watchdog-template-final.log` — 60 lines，sha256 `8ea6c17290f841bfe9c3440f9a229c96c66bc4de8a834239945c7ca743d4bbbd`。
- `/tmp/nexus-v8-r7-t4-watchdog-template-final-summary.md` — sidecar summary，记录 `exit_status=0` / line count / sha256。
- HEAD：`5cf75df fix(v8-r5): route standard completion through FSM`。

| 命令 | 结果 |
|---|---|
| `npm test -- --runInBand tests/v8/v8_watchdog_prompt_template.test.ts` | passed：1 suite / 2 tests。 |
| `npm test -- --runInBand tests/v8/v8_watchdog_prompt_template.test.ts tests/v8/v8_repositories.test.ts tests/v8/v8_runtime_api_route_boundary.test.ts` | passed：3 suites / 12 tests。 |
| `npm test -- --runInBand tests/v8` | passed：15 suites / 75 tests。 |
| `npx prisma validate` | passed：schema valid。 |
| `npm run build` | passed：`tsc` exit 0。 |
| `git diff --check` | passed：no whitespace error。 |
| source boundary scan (`src/api/routes.ts`, `src/services/v8_runtime_api_service.ts`, `src/repositories/v8.ts`) | passed：无 `better-sqlite3/sqlite3/data/nexus.db/prisma/data/nexus.db/$queryRaw/$executeRaw` 命中。 |
| pollution status scan | passed：`[]`，未新增/修改 DB、SQLite、dist、node_modules、secrets、proof JSON、`.env`。 |
| tracked pollution scan | passed：`[]`。 |

## 已实现内容

1. watchdog/patrol prompt 模板化：cronjob 可在 `config_json.prompt_template` 配置模板，支持 `project_id/cronjob_id/name/schedule/status/enabled_policy/owner_agent_id/mode/maintenance_mode/now_iso` 占位符。
2. 默认模板兜底：未配置 `prompt_template` 时生成稳定 patrol/watchdog 只读巡检 prompt。
3. 只读边界：所有渲染 prompt 均追加 guardrail，明确“只读巡检、不得自动修复、不得启停 cronjob、不得改任务/报告/DB 状态”。
4. project-scoped 读取：`renderPrompt()` 只按 `project_id + cronjob_id` 读取 registry 行，不跨项目命中。
5. 安全失败：未知模板变量直接报错，避免敏感或未定义占位符泄露/误渲染。

## 剩余风险

1. 本卡只提供 prompt 渲染能力，不负责真实 watchdog/patrol worker 调度、消息投递或 cronjob 启停。
2. prompt 模板目前存放在 `project_cronjobs.config_json.prompt_template`，尚未拆成单独模板表或版本化模板 registry；如后续需要审计模板变更，应单列任务设计。
3. 工作区存在前序 R4/R5/R6/R7 累计 dirty/untracked WIP；本卡主审范围应聚焦 `src/repositories/v8.ts` 中 prompt 渲染增量、`tests/v8/v8_watchdog_prompt_template.test.ts` 与本 proof。历史/未触碰文件问题仅列为非阻断观察。

## 下一阶段输入

- 后续真实 watchdog/patrol worker 若要执行巡检，应先通过 `project_cronjobs` registry 选择 eligible cronjob，再调用 `renderPrompt(project_id, cronjob_id, { mode, now, maintenance })` 获取 prompt。
- worker 只能提交结构化观察/风险/下一步建议，不得在 watchdog/patrol 内执行修复；修复必须另行派 DEV 任务并走 V8 API/service/FSM Controller。
