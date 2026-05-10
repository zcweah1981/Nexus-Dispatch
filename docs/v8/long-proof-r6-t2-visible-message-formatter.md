# Long Proof — V8-R6-T2 visible message formatter

任务：`nexus-v8-r6-t2-visible-message-formatter`

范围：仅实现 V8 report/completion_reports 队列中的用户可见消息格式化；不进入真实 Telegram delivery、PM final decision、WebUI、生产/ignored SQLite 迁移或后续 R6 子任务。

## 前置阅读

已阅读并按边界执行：

- `docs/v8/README.md` — V8 clean rebuild baseline 与 R1+ 主线边界。
- `docs/v8/long-proof-r0-clean-rebuild-baseline.md` — R0 测试/仓库/契约边界与 DB 污染限制。
- `docs/v8/legacy-dal-boundary.md` — legacy DAL 只读/archive；V8 report 主流程不得回退 `src/db/dal.ts` / direct SQLite。
- `docs/v8/prisma-schema-boundary.md` — Prisma schema / Client 是 V8 主线数据层契约。
- `docs/v8/long-proof-r2-transition-task-service.md` — 状态变化需走 service/FSM boundary。
- `docs/v8/long-proof-r6-t1-report-lifecycle.md` — R6 输入为 report lifecycle；本卡只接用户可见 formatter。

## 修改文件

本卡新增/修改：

- `src/reports/v8_visible_message_formatter.ts`
  - 新增 `formatV8VisibleMessage()`。
  - 支持 `agent_dispatch` / `agent_result` / review 类消息的短中文模板。
  - 最终输出隐藏 runtime identifiers、URL、raw dict/JSON braces，并把 `验收:auto` 统一改为 `验收：PM 审核后确认`。
- `src/repositories/v8.ts`
  - `ReportCreateInput` 增加可选 `visible_message`。
  - `ReportRepository.create()` 在写入 `summary` 时调用 visible formatter；raw `payload_json` 仍保留在 DB proof 字段，不进入可见 summary。
  - 注意：该文件进入本卡前已有 R6-T1 lifecycle dirty diff；主审本卡时请聚焦 formatter import/summary formatting/visible_message input 三处。
- `tests/v8/v8_visible_message_formatter.test.ts`
  - 新增 fail-first contract：dispatch/result/review 可见文本必须人类可读，不泄漏 `task_id/run_id/dispatch_id/trace_id/worker_run_id/payload_json` 等，不显示 `验收:auto`。
  - 新增 Runtime API service contract：`createReport()` 存储 formatted visible summary，raw payload 仅保留在 `payload_json`。
- `docs/v8/long-proof-r6-t2-visible-message-formatter.md`
  - 本 proof 文件。

## TDD 记录

| 阶段 | 命令 | 结果 |
|---|---|---|
| RED | `npm test -- --runInBand tests/v8/v8_visible_message_formatter.test.ts` | failed：`Cannot find module '../../src/reports/v8_visible_message_formatter'`，证明 formatter 尚不存在。 |
| GREEN-1 | 同上 | initially 3 formatter tests pass after implementation；review fixture 中 `验收:auto` 被 sanitizer 正确替换，测试期望修正为不含 auto 文案。 |
| GREEN-2 | 同上 | passed：1 suite / 4 tests；含 Runtime report creation contract。 |
| Regression | `npm test -- --runInBand tests/v8/v8_repositories.test.ts tests/v8/v8_runtime_api_route_boundary.test.ts` | passed：2 suites / 7 tests。 |
| V8 suite | `npm test -- --runInBand tests/v8` | passed：14 suites / 68 tests。 |

## 验证命令与结果

| 命令 | 结果 |
|---|---|
| `npm test -- --runInBand tests/v8/v8_visible_message_formatter.test.ts` | passed：4 tests。 |
| `npm test -- --runInBand tests/v8/v8_repositories.test.ts tests/v8/v8_runtime_api_route_boundary.test.ts` | passed：7 tests。 |
| `npx prisma validate` | passed：schema valid。 |
| `npm run build` | passed：`tsc` exit 0。 |
| `git diff --check` | passed：no output。 |
| `npm test -- --runInBand tests/v8` | passed：14 suites / 68 tests。 |
| pollution status scan | no DB / SQLite / dist / node_modules / secrets / proof JSON / `.env` pollution detected in status. |
| tracked pollution scan | no tracked DB / SQLite / dist / proof JSON / `.env` entries detected by scoped scan. |
| source boundary scan（本卡新增文件） | no `src/db/dal` / `better-sqlite3` / `sqlite3` / ignored DB / raw query usage. |

## 剩余风险

1. 本卡只把 visible formatter 接入 `ReportRepository.create()` 的 `summary` 字段；尚未实现真实 Telegram sender/delivery adapter。
2. formatter 为保守短模板，更多 message_type（例如未来 PM final decision 专用类型）需要后续卡补充专门模板。
3. 当前工作区进入本卡前已有 R4/R5/R6-T1 dirty diff/untracked proof 文档；本卡未清理或接管历史 dirty 状态。

## 下一阶段输入

- 后续 Telegram delivery 必须只发送 `Report.summary` 或 formatter 输出，不得直接发送 `payload_json`。
- 若新增 delivery proof，应把完整 trace/runtime identifiers 写入 `payload_json` / artifact / DB proof，不进入群组正文。
- 后续 PM final decision 可复用 `formatV8VisibleMessage()` 增加专用 `pm_acceptance` 模板。
