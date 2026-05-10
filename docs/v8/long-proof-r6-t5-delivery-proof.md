# Long Proof — V8-R6-T5 delivery proof 回写

任务：`nexus-v8-r6-t5-delivery-proof`

范围：仅补齐 V8 Runtime API/service/repository 层的 `report_proof` / delivery proof 结构化回写能力，用于后续 Telegram delivery worker 在完成真实发送后把发送证明写回 runtime proof；不进入真实 Telegram 投递、PM final decision、WebUI、生产/ignored SQLite 迁移或 R7 后续阶段。

## 前置阅读

已按调度要求阅读/复核：

- `docs/v8/README.md` — V8 clean rebuild baseline；R2+ 主线必须基于 Repository / Runtime API / FSM Controller。
- `docs/v8/legacy-dal-boundary.md` — legacy DAL 只读/archive；V8 主流程不得回退到 `src/db/dal.ts`、`better-sqlite3` 或 ignored DB。
- `docs/v8/prisma-schema-boundary.md` — Prisma schema / Client 是 V8 主线数据层契约。
- `docs/v8/long-proof-r5-review-pass-closure.md`、`docs/v8/long-proof-r4-worker-openai-dispatch.md` — 前序 proof/artifact 写入边界。
- `docs/v8/long-proof-r6-t1-report-lifecycle.md` — report lifecycle：`pending -> sending -> sent`，非法 `pending -> sent`。
- `docs/v8/long-proof-r6-t2-visible-message-formatter.md` — 群组可见 summary 与 runtime proof/payload 隔离。
- `docs/v8/long-proof-r6-t3-dedupe-key.md` — `project_id + dedupe_key` 幂等报告队列。
- `docs/v8/long-proof-r6-t4-redaction.md` — summary 脱敏仅作用于可见文本，raw payload/proof 保留在系统内。

## 修改文件

本卡新增/修改：

- `src/repositories/v8.ts`
  - 新增 `ArtifactCreateInput` / `ArtifactRepository`。
  - `create(projectId, input)` 先按 `project_id + run_id` 校验 Run，再按 `project_id + task_id` 与 `run.task_id` 校验 Task，最后写入 `Artifact.project_id/task_id/run_id/artifact_type/payload/payload_data/proof/path/metadata_json`。
  - 新增 `getByPath(projectId, artifactType, path)`，便于 delivery proof 以 `project_id:run_id:report_id` 形式检索/证明。
- `src/services/v8_runtime_api_service.ts`
  - 接入 `ArtifactRepository`。
  - 新增 `createArtifact()` / `getArtifactByPath()`，保持 V8 API 业务写入走 service/repository 边界。
- `src/api/schemas.ts`
  - 新增 `runtimeArtifactCreateSchema`，要求 `project_id/run_id/artifact_type/payload`，允许 `task_id/proof/path/metadata_json/payload_data`。
- `src/api/routes.ts`
  - 新增 `POST /api/v1/runtime/artifacts` thin route，仅 validation、service 调用、SSE state event；不触碰 legacy DAL / raw SQL。
- `tests/v8/v8_repositories.test.ts`
  - 新增 repository contract：`ArtifactRepository` 可以写入 `report_proof`，并证明 cross-project read/write 被阻断。
- `tests/v8/v8_runtime_api_route_boundary.test.ts`
  - 新增 Runtime API route contract：通过 `/runtime/artifacts` 写入 `report_proof`；跨项目 run/task 写入返回 404；route thin-source contract 要求 `ArtifactRepository`。
- `docs/v8/long-proof-r6-t5-delivery-proof.md`
  - 本 proof 文档。

## TDD / 实现记录

| 阶段 | 命令/证据 | 结果 |
|---|---|---|
| Inspect | `git status --short --untracked-files=all`; grep `report_proof` / `runtime/artifacts` | 当前树只有 R2 transition audit 与 R4 worker proof artifact 写入，缺少通用 V8 Runtime delivery proof 回写接口。 |
| GREEN | `npm test -- --runInBand tests/v8/v8_repositories.test.ts tests/v8/v8_runtime_api_route_boundary.test.ts` | passed：2 suites / 8 tests。新增 repository/API contract 通过。 |
| Full verification | `/tmp/nexus-v8-r6-t5-delivery-proof-verify.log` | exit 0；见下方验证。 |

## 验证命令与结果

完整验证日志：

- `/tmp/nexus-v8-r6-t5-delivery-proof-dispatch2-final.log` — 127 lines，sha256 `91e6f8a9c50ca899827b4eed62277e468e021a55c686f23ae4647cc684a2a7d5`。
- `/tmp/nexus-v8-r6-t5-delivery-proof-dispatch2-final-summary.md` — sidecar summary，记录 `exit_status=0` / line count / sha256。
- HEAD：`5cf75df765d7e95ff19c2f541498a3cfba815bb9`。

| 命令 | 结果 |
|---|---|
| `npx prisma validate` | passed：schema valid。 |
| `npm test -- --runInBand tests/v8/v8_repositories.test.ts tests/v8/v8_runtime_api_route_boundary.test.ts` | passed：2 suites / 8 tests。 |
| `npm test -- --runInBand tests/v8/v8_visible_message_formatter.test.ts tests/v8/v8_repositories.test.ts tests/v8/v8_runtime_api_route_boundary.test.ts` | passed：R6 focused slice。 |
| `npm test -- --runInBand tests/v8` | passed：14 suites / 71 tests。 |
| `npm run build` | passed：`tsc` exit 0。 |
| `git diff --check` | passed：no whitespace error。 |
| source boundary scan (`src/repositories/v8.ts`, `src/services/v8_runtime_api_service.ts`) | passed：`source_boundary_hits=[]`。 |
| runtime route thin scan | passed：`runtime_section_forbidden_hits=[]`，新增 `/runtime/artifacts` 在 V8 runtime section 内走 `service.createArtifact`。 |
| pollution status scan | passed：`pollution_status_hits=[]`。 |
| tracked pollution scan | passed：`tracked_pollution_hits=[]`。 |

## 已实现内容

1. delivery proof 回写入口：后续 delivery worker 可通过 `POST /api/v1/runtime/artifacts` 写入 `artifact_type='report_proof'`，payload/proof/metadata_json 保留完整结构化投递证明。
2. 项目隔离：artifact 写入前必须证明 `run_id` 属于同一 `project_id`，如传 `task_id` 还必须证明 task 属于同项目且与 run 绑定。
3. API-only 主线：新增 route 只做 schema validation + service 调用；V8 runtime section 不直接 SQL、不触碰 legacy DAL。
4. 与 R6 前序兼容：report lifecycle、visible message formatter、dedupe_key、redaction 均未改变；真实 delivery 仍需先把 report 从 `pending -> sending -> sent`，再写 `report_proof` artifact。

## 剩余风险

1. 本卡仅提供 proof 回写能力，不实现真实 Telegram delivery worker；真实发送后的 report 状态推进/重试策略仍是后续卡范围。
2. 当前 artifact 层没有对 `artifact_type='report_proof'` 做专用 JSON Schema 约束；已保留 `payload/proof/metadata_json`，R7 可固化 schema。
3. 工作区存在前序 R4/R5/R6 untracked proof/source WIP；本卡修改范围已明确，Reviewer 主审应聚焦上述 R6-T5 diff/proof，历史/未触碰文件问题仅列为非阻断观察。

## R6 proof 与 R7 输入

- R6 proof：`Report.summary` 是群组可见文本，`Report.payload_json` 与 `Artifact(report_proof).payload/proof/metadata_json` 是系统内完整 proof；summary 脱敏与 dedupe 规则保持不变。
- R7 输入建议：
  1. Telegram delivery worker 读取 `Report(status='pending')`，按 R6-T1 生命周期推进 `pending -> sending -> sent`。
  2. 真实发送成功后调用 `POST /api/v1/runtime/artifacts` 写入 `report_proof`，建议 `path = project_id:run_id:report_id`，`metadata_json` 包含 `report_id/run_id/dispatch_id/delivery_attempt`。
  3. 真实发送失败时不要写 fake proof；应推进 report 到 `error`，保留 `delivery_json` 错误信息，等待 retry。
