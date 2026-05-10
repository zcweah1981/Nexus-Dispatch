# Long Proof — V8-R8-T4 ArtifactGallery proof 摘要

任务：`nexus-v8-r8-t4-artifact-gallery`
范围：仅做 WebUI `ArtifactGallery` proof 摘要展示边界；不改 Runtime 状态流转、不改 daemon/review/report/cron 行为、不触碰生产 DB / ignored SQLite / dist / node_modules / secrets / proof JSON / `.env`。

## 前置阅读

- `docs/v8/README.md` — V8 clean rebuild baseline；R2+ 主线基于 Repository / Runtime API / FSM Controller。
- `docs/v8/legacy-status-mapping.md` — legacy 状态只作迁移说明，R8 WebUI 不引入 legacy 状态语义。
- `docs/v8/legacy-dal-boundary.md` — WebUI/R8 不得回退 legacy DAL/direct SQLite。
- `docs/v8/prisma-schema-boundary.md` — V8 Prisma schema / Client 为主线数据契约；WebUI 只消费 API/SSE 展示数据。
- `docs/v8/long-proof-r0-clean-rebuild-baseline.md` — R0 污染边界与 clean rebuild 基线。
- `docs/v8/long-proof-r8-t1-v8-status-display.md`、`docs/v8/long-proof-r8-t2-dag-phase-display.md`、`docs/v8/long-proof-r8-t3-settings-panel.md` — R8 WebUI 只读展示边界输入。

## 修改文件

本卡新增/修改（task-scoped）：

- `src/webui/src/components/ArtifactGallery.tsx`
  - 新增 `V8_ARTIFACT_GALLERY_PROOF_SUMMARY_CONTRACT` 标记。
  - 将 ArtifactGallery 可见卡片从 raw payload preview 改为 `getProofSummary()` 摘要展示。
  - 只读取 `proof_summary` / `summary` / `result` / `command` / `status` / `path` 等安全摘要候选字段；无可用摘要时显示 `Proof 已存系统`。
  - 移除可见 card header 中的 raw task/run identifier fallback 与短 hash 展示。
  - 增加 `cleanVisibleText()`，对常见 runtime id 标签、Bearer/Authorization、`sk-`/`ghp_`/`xoxb-`、Telegram `-100...` 等敏感片段做可见层隐藏。
  - 保留 SSE 实时追加与去重行为，但仅将 proof 摘要展示给人类；完整 raw proof 仍应留在 Runtime DB/artifacts 审计侧。
- `tests/v8/v8_webui_artifact_gallery_proof_summary.test.ts`
  - 新增 fail-first 源级合同：ArtifactGallery 必须声明 proof-summary-only 边界、必须使用 `getProofSummary()` / 摘要字段、不得包含 `JSON.stringify(art.payload` / `art.payload.substring` / `truncateHash` / `{art.task_id || art.run_id}` 等 raw proof/identifier 可见路径。
- `docs/v8/long-proof-r8-t4-artifact-gallery.md`
  - 本 proof 文档。

## TDD 记录

| 阶段 | 命令 | 结果 |
|---|---|---|
| RED | `npm test -- --runInBand tests/v8/v8_webui_artifact_gallery_proof_summary.test.ts` | failed：缺 `V8_ARTIFACT_GALLERY_PROOF_SUMMARY_CONTRACT`、`getProofSummary`、`getVisibleArtifactTitle`、`Proof 已存系统`，且仍存在 `truncateHash` / `{art.task_id || art.run_id}` / raw payload preview。 |
| GREEN | `npm test -- --runInBand tests/v8/v8_webui_artifact_gallery_proof_summary.test.ts` | passed：1 suite / 3 tests。 |

## 验证命令与结果

验证日志：`/tmp/nexus-v8-r8-t4-artifact-gallery-verify.log`

- lines：`140`
- sha256：`84010aad3b124a698233169a9241d39664afb177f94700aaa7b4e306b9575a16`
- summary：`/tmp/nexus-v8-r8-t4-artifact-gallery-summary.md`

| 命令 | 结果 |
|---|---|
| `npm test -- --runInBand tests/v8/v8_webui_artifact_gallery_proof_summary.test.ts` | passed：1 suite / 3 tests。 |
| `npm test -- --runInBand tests/v8/v8_webui_artifact_gallery_proof_summary.test.ts tests/v8/v8_webui_status_display.test.ts tests/v8/v8_webui_dag_phase_group_display.test.ts tests/v8/v8_webui_settings_panel_registry.test.ts` | passed：4 suites / 14 tests。 |
| `npm test -- --runInBand tests/v8` | passed：19 suites / 89 tests。 |
| `npx prisma validate` | passed：schema valid。 |
| `npm run build` | passed：root TypeScript build。 |
| `npm --prefix src/webui run build` | passed：Vite build，181 modules transformed。 |
| `git diff --check` | passed：无 whitespace error。 |
| artifact gallery source scan | passed：`ARTIFACT_GALLERY_PROOF_SUMMARY_SCAN_OK`。 |
| pollution status scan | passed：`pollution_status_hits=[]`。 |
| tracked pollution scan | passed：`tracked_pollution_hits=[]`。 |

环境噪声：验证日志首行 `/root/.openclaw/completions/openclaw.bash: No such file or directory` 为 shell startup warning；所有验证命令 exit 0。

## 已实现内容

1. ArtifactGallery 只显示 proof 摘要，不再把 raw proof JSON / payload object/string 直接渲染到卡片。
2. 可见卡片标题改为安全 title 或 artifact type label，不再展示 raw task/run identifier 或 run hash。
3. proof 摘要字段优先级明确：`proof_summary -> summary -> result -> command -> status -> path -> Proof 已存系统`。
4. 可见层增加敏感片段清理，避免常见 token、authorization、Telegram chat/channel id、runtime id 标签进入 UI。
5. 保持 R8 WebUI 只读范围：未改变 Runtime API、FSM、daemon、DB schema 或真实 delivery 行为。

## 剩余风险 / 非阻断观察

1. 当前工作区存在前序 R4/R5/R6/R7/R8-T1/T2/T3 累计 dirty/untracked WIP；本卡主审范围是 `ArtifactGallery.tsx`、新增 artifact gallery contract test 与本 proof。历史/未触碰文件问题应列为非阻断观察。
2. `ArtifactGallery` 仍依赖 SSE event 的 artifact payload 提供摘要字段；若后端只发送 raw payload 且没有摘要，UI 会显示兜底 `Proof 已存系统`，后续可在 R9/API 卡补齐 `proof_summary` 规范。
3. 本卡未实现后端 artifact list/fetch、权限过滤或 raw proof 下载；这些均不在 proof 摘要展示卡范围。
4. `npm --prefix src/webui run build` 会生成 ignored `src/webui/dist`；最终 pollution scan 未命中，未纳入交付物。

## 下一阶段输入

1. 后续 Runtime/API 卡：为 artifact SSE/API payload 明确定义 `proof_summary` / `title` 字段，并在服务端完成敏感信息摘要化。
2. 后续 WebUI 卡：如需查看 raw proof，必须设计权限门控与显式审计操作，不得默认显示在 ArtifactGallery 卡片。
3. 后续 E2E 卡：可增加浏览器级 smoke，注入 artifact_created SSE fixture，验证页面仅出现摘要与 `Proof 已存系统`，不出现 raw JSON / runtime id / secret。
