# Long Proof — V8-R8-T3 SettingsPanel 接 agents/review policies/cron registry

任务：`nexus-v8-r8-t3-settings-panel`
范围：仅做 WebUI SettingsPanel 对接 V8 agents / review_policies / project_cronjobs registry API 与最小只读展示；不改任务状态流转、不启停真实 cronjob、不触碰生产 DB / ignored SQLite / dist / node_modules / secrets / proof JSON / `.env`。

## 前置阅读

- `docs/v8/README.md` — V8 clean rebuild baseline；R2+ 主线基于 Repository / Runtime API / FSM Controller。
- `docs/v8/legacy-test-classification.md` — legacy 测试与旧线冻结边界。
- `docs/v8/legacy-dal-boundary.md` — WebUI/R8 不得回退 legacy DAL/direct SQLite。
- `docs/v8/prisma-schema-boundary.md` — V8 Prisma schema / Client 为主线数据契约。
- `docs/v8/long-proof-r5-review-policy-table.md` — review_policies / evaluator 输入。
- `docs/v8/long-proof-r7-t1-cronjobs-schema-api.md` — project_cronjobs registry API 输入；registry 状态不代表真实 cron 启停。
- `docs/v8/long-proof-r8-t1-v8-status-display.md` 与 `docs/v8/long-proof-r8-t2-dag-phase-display.md` — R8 WebUI 只读展示边界。

## 修改文件

本卡新增/修改（task-scoped）：

- `src/webui/src/components/SettingsPanel.tsx`
  - 新增 `V8_SETTINGS_REGISTRY_CONTRACT` 标记。
  - 从旧 `/api/v1/agents` + `/api/v1/controllers`/controller config 模式切换为 V8 Runtime API：
    - `/api/v1/runtime/projects/${PROJECT_ID}/agents`
    - `/api/v1/runtime/projects/${PROJECT_ID}/review-policies`
    - `/api/v1/runtime/projects/${PROJECT_ID}/cronjobs`
  - 只读展示 Agent Registry、Review Policy Registry、Project Cron Registry。
  - 显示审核等级 `group_only` / `pm_audit_immediate`，并明确 cron registry 只展示 registry status，不启停 scheduler。
- `src/repositories/v8.ts`
  - 新增 `AgentRepository.listAgents(project_id, filters)`，按 `project_id` 分区并允许全局 agent（`project_id=null`）展示。
- `src/services/v8_runtime_api_service.ts`
  - 注入 `AgentRepository` 与 `ReviewPolicyRepository`。
  - 新增 `listAgents()` / `listReviewPolicies()`，均先校验 `project_id`。
- `src/api/routes.ts`
  - 新增 thin read routes：
    - `GET /api/v1/runtime/projects/:projectId/agents`
    - `GET /api/v1/runtime/projects/:projectId/review-policies`
  - routes 只做 query 参数读取、service 调用、HTTP 映射；无 direct SQL/legacy DAL。
- `tests/v8/v8_webui_settings_panel_registry.test.ts`
  - 新增 fail-first 源级合同：SettingsPanel 必须接 V8 agents/review policies/cron registry API；不得继续依赖 controller config；不得含 direct DB 或 cron start/stop/pause/resume 调用；Runtime routes 必须是 thin service routes。
- `docs/v8/long-proof-r8-t3-settings-panel.md`
  - 本 proof 文档。

## TDD 记录

| 阶段 | 命令 | 结果 |
|---|---|---|
| RED | `npm test -- --runInBand tests/v8/v8_webui_settings_panel_registry.test.ts` | failed：缺 `V8_SETTINGS_REGISTRY_CONTRACT`、V8 runtime registry endpoints、reviewPolicies/cronjobs、group_only/pm_audit_immediate；仍含 `/api/v1/controllers`、`acceptance_mode`、`reviewer_routing`；routes 缺 agents/review-policies thin endpoints。 |
| GREEN | `npm test -- --runInBand tests/v8/v8_webui_settings_panel_registry.test.ts` | passed：1 suite / 4 tests。 |

## 验证命令与结果

验证日志：`/tmp/nexus-v8-r8-t3-settings-panel-verify.log`

- lines：`154`
- sha256：`612eba9e8e60dc17de81344add940005273feded466274bc9154f992cc27451d`
- summary：`/tmp/nexus-v8-r8-t3-settings-panel-summary.md`
- HEAD：`5cf75df fix(v8-r5): route standard completion through FSM`

| 命令 | 结果 |
|---|---|
| `npm test -- --runInBand tests/v8/v8_webui_settings_panel_registry.test.ts` | passed：1 suite / 4 tests。 |
| `npm test -- --runInBand tests/v8/v8_webui_settings_panel_registry.test.ts tests/v8/v8_webui_status_display.test.ts tests/v8/v8_webui_dag_phase_group_display.test.ts` | passed：3 suites / 11 tests。 |
| `npm test -- --runInBand tests/v8` | passed：18 suites / 86 tests。 |
| `npx prisma validate` | passed：schema valid。 |
| `npm run build` | passed：root TypeScript build。 |
| `npm --prefix src/webui run build` | passed：Vite build，181 modules transformed。 |
| `git diff --check` | passed：无 whitespace error。 |
| task scoped source scan | passed：`WEBUI_SETTINGS_REGISTRY_SCAN_OK`。 |
| runtime route thin scan | passed：`RUNTIME_SETTINGS_ROUTES_THIN_OK`。 |
| pollution status scan | passed：`pollution_status_hits=[]`。 |
| tracked pollution scan | passed：`tracked_pollution_hits=[]`。 |

环境噪声：验证日志首行 `/root/.openclaw/completions/openclaw.bash: No such file or directory` 为 shell startup warning；所有验证命令 exit 0。

## 已实现内容

1. SettingsPanel 改为读取 V8 Runtime API registry 数据，不再以 legacy controller config 作为 review routing UI 数据源。
2. 新增 project-scoped agents read endpoint，支持 SettingsPanel 在当前项目范围内展示项目 agent + global agent。
3. 新增 project-scoped review policies read endpoint，SettingsPanel 可展示 policy scope、reviewer、priority、enabled 与 `group_only`/`pm_audit_immediate` 等级。
4. SettingsPanel 展示 project_cronjobs registry status / enabled_policy / owner / schedule，但不调用任何 cron start/stop/pause/resume 行为。
5. 保持 WebUI 只读/API-only 边界：不直接读写 SQLite，不触碰任务状态，不绕过 Runtime service。

## 剩余风险 / 非阻断观察

1. 当前工作区存在前序 R4/R5/R6/R7/R8-T1/T2 累计 dirty/untracked WIP；本卡主审范围是上方列出的 SettingsPanel、V8 read routes/service/repository 与新增测试/proof。历史/未触碰文件问题应列为非阻断观察。
2. `PROJECT_ID` 当前为 WebUI 常量 `nexus-dispatch`；后续若引入项目选择器，应把该值从 session/project selector 注入，而不是在本卡扩大范围。
3. 本卡只做 registry 只读展示；ReviewPolicy 的 upsert UI、Cronjob bind/status update UI、真实 scheduler 启停均不在本卡范围。
4. `npm --prefix src/webui run build` 会生成 ignored `src/webui/dist`；最终 pollution scan 未命中，未纳入交付物。

## 下一阶段输入

1. R8 后续项目选择卡：把 SettingsPanel 的 `PROJECT_ID` 接当前项目/session selector。
2. R8/R9 后续配置编辑卡：如需编辑 review_policies 或 project_cronjobs，应新增明确的 Runtime API write contract 与 TDD，不得复用 legacy controller config。
3. Cron backend 卡：真实启停必须先查 `project_cronjobs` registry 并按 `project_id` 校验，本卡仅提供 WebUI 只读入口。
