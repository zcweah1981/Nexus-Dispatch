# Long Proof — V8-R8-T5 SSE 订阅 report/task/group 事件

任务：`nexus-v8-r8-t5-sse-events`
范围：仅补齐 R8 WebUI/API SSE report/task/group 事件订阅与广播合同；不改 Runtime 状态机语义、不改 daemon/review/report/cron 行为、不触碰生产 DB / ignored SQLite / dist / node_modules / secrets / proof JSON / `.env`。

## 前置阅读

- `docs/v8/README.md` — V8 clean rebuild baseline；R2+ 主线基于 Repository / Runtime API / FSM Controller。
- `docs/v8/legacy-status-mapping.md` — legacy 状态只作迁移说明，R8 WebUI 不引入 legacy 状态语义。
- `docs/v8/legacy-dal-boundary.md` — WebUI/R8 不得回退 legacy DAL/direct SQLite。
- `docs/v8/prisma-schema-boundary.md` — V8 Prisma schema / Client 为主线数据契约；WebUI 只消费 API/SSE 展示数据。
- `docs/v8/long-proof-r0-clean-rebuild-baseline.md` — R0 污染边界与 clean rebuild 基线。
- `docs/v8/long-proof-r8-t1-v8-status-display.md`、`docs/v8/long-proof-r8-t2-dag-phase-display.md`、`docs/v8/long-proof-r8-t3-settings-panel.md`、`docs/v8/long-proof-r8-t4-artifact-gallery.md` — R8 WebUI 只读展示边界输入。

## 修改文件

本卡新增/修改（task-scoped）：

- `src/webui/src/hooks/useSSE.ts`
  - 新增 `V8_SSE_REPORT_TASK_GROUP_EVENTS_CONTRACT` 标记。
  - 扩展 `SSEEventType`：`task_transitioned`、`group_status_updated`、`group_summary_created`、`report_created`、`report_status_updated`。
  - 继续只使用一个 `/api/v1/events/stream` EventSource 与 `state_change` named event，不直接读 DB。
- `src/webui/src/components/DAGView.tsx`
  - 新增 `V8_SSE_TASK_GROUP_EVENT_HANDLERS` 标记。
  - `task_status_updated` 与 `task_transitioned` 共用 V8 task status 更新逻辑。
  - `tasks_batch_injected` / `group_status_updated` 触发只读 `refreshGraphFromApi()`，通过 `/api/v1/tasks?limit=100&include_graph=true` 刷新 DAG/phase/group metadata。
- `src/webui/src/components/ArtifactGallery.tsx`
  - 新增 `V8_SSE_REPORT_GROUP_EVENT_HANDLERS` 标记。
  - 将 `report_created` / `report_status_updated` 映射为 `report_proof` 摘要卡片。
  - 将 `group_summary_created` 映射为 `group_summary` 摘要卡片。
  - 复用 R8-T4 `getProofSummary()` 可见摘要与 `Proof 已存系统` 兜底，不展示 raw payload JSON。
- `src/api/routes.ts`
  - Runtime thaw/advance phase 创建 group 时 emit `group_status_updated`。
  - Runtime report create/update 后 emit project-scoped `report_created` / `report_status_updated`；`message_type='group_summary'` 时 emit `group_summary_created`。
  - 仍保持 routes thin：HTTP validation + 调用 `V8RuntimeApiService` / `transitionTask`，不直接 SQL。
- `tests/v8/v8_webui_sse_report_task_group_events.test.ts`
  - 新增 fail-first 源级合同，锁定 SSE hook、DAGView、ArtifactGallery、Runtime routes 的 report/task/group 事件契约与 DB denylist。
- `docs/v8/long-proof-r8-t5-sse-events.md`
  - 本 proof 文档。

## TDD 记录

| 阶段 | 命令 | 结果 |
|---|---|---|
| RED | `npm test -- --runInBand tests/v8/v8_webui_sse_report_task_group_events.test.ts` | failed：缺 `V8_SSE_REPORT_TASK_GROUP_EVENTS_CONTRACT`、`V8_SSE_TASK_GROUP_EVENT_HANDLERS`、`V8_SSE_REPORT_GROUP_EVENT_HANDLERS`，且 routes 未 emit report/group SSE events。 |
| GREEN | `npm test -- --runInBand tests/v8/v8_webui_sse_report_task_group_events.test.ts` | passed：1 suite / 4 tests。 |

## 验证命令与结果

| 命令 | 结果 |
|---|---|
| `npm test -- --runInBand tests/v8/v8_webui_sse_report_task_group_events.test.ts` | passed：1 suite / 4 tests。 |
| `npm test -- --runInBand tests/v8/v8_webui_sse_report_task_group_events.test.ts tests/v8/v8_webui_artifact_gallery_proof_summary.test.ts tests/v8/v8_webui_dag_phase_group_display.test.ts tests/v8/v8_webui_status_display.test.ts tests/v8/v8_webui_settings_panel_registry.test.ts` | passed：5 suites / 18 tests。 |
| `npm test -- --runInBand tests/v8` | passed：20 suites / 93 tests。 |
| `npx prisma validate` | passed：schema valid。 |
| `npm run build` | passed：root TypeScript build。 |
| `npm --prefix src/webui run build` | passed：Vite build，181 modules transformed。 |
| `git diff --check` | passed：无 whitespace error。 |
| source/pollution scan | passed：`SSE_SOURCE_SCAN_OK`、`pollution_status_hits=[]`、`tracked_pollution_hits=[]`。 |

验证日志：`/tmp/nexus-v8-r8-t5-sse-events-verify.log`

- lines：`132`
- sha256：`8c92350f14b0e543957890295eb60f5c47fa7f4e4b94691dfb4d209e10082732`
- summary：`/tmp/nexus-v8-r8-t5-sse-events-summary.md`

环境噪声：长 V8/Jest 日志首行 `/root/.openclaw/completions/openclaw.bash: No such file or directory` 为 shell startup warning；所有验证命令 exit 0。

## 已实现内容

1. WebUI SSE hook 明确支持 report/task/group 事件类型，仍通过单一 API SSE stream 消费事件。
2. DAGView 可响应 task transition 与 group status 事件：任务状态本地更新；group/batch 变化通过只读 API refresh，避免前端推断 DB 状态。
3. ArtifactGallery 可响应 report 与 group summary 事件，并以 R8-T4 摘要展示边界显示 proof card。
4. Runtime routes 在报告创建/状态变化、phase thaw/advance group 创建时发出 project-scoped SSE event，供 WebUI 订阅。
5. 未改变 FSM transition、daemon closeout、review/report lifecycle、cron scheduler 或 DB schema。

## 剩余风险 / 非阻断观察

1. 当前工作区存在前序 R4/R5/R6/R7/R8-T1/T2/T3/T4 累计 dirty/untracked WIP；本卡主审范围为上方列出的 SSE 相关文件与本 proof。历史/未触碰文件问题应列为非阻断观察。
2. `group_status_updated` 当前覆盖 thaw/advance 创建 active group；daemon archive group 发生在 `V8TickLoop.closeoutCompletedGroups()` 内部调用 service，未在本卡额外注入实时 route event。若需要 daemon-side group archive SSE，应作为后续 daemon event bus 卡处理，避免扩大 R8 WebUI 订阅范围。
3. `report_status_updated` 的 `updated_at` 使用 route emit 时间；如果后续需要 DB 精确更新时间，应在 Repository/Prisma schema 层提供标准字段。
4. 本卡为源级合同 + build 验证，未启动浏览器 E2E；后续可用 EventSource fixture 做 UI smoke。
5. `npm --prefix src/webui run build` 会生成 ignored `src/webui/dist`；最终 pollution scan 应证明未纳入交付物。

## R9 输入

1. R9 可定义标准 SSE event payload schema：`project_id` 必填，report/group/task id 字段命名统一，visible summary 与 raw proof 明确分离。
2. R9 可补浏览器级 smoke：模拟 `task_transitioned`、`group_status_updated`、`report_created`、`group_summary_created`，断言 DAG/ArtifactGallery 实时更新且不显示 raw ids/secrets。
3. R9 可补 backend event bus：daemon/service 内部状态变化统一通过可测试 event publisher，而不是 routes-only emit。
4. R9 若需要多项目 WebUI，应将当前 WebUI project selector 注入 SSE/API query/filter，避免跨项目事件干扰。
