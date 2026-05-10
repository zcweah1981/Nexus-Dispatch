# Long Proof — V8-R6-T3 dedupe key 防重复发送

任务：`nexus-v8-r6-t3-dedupe-key`

范围：仅实现 V8 report/completion_reports 队列的 project-scoped `dedupe_key` 幂等创建，防止重复 report 进入待发送/发送流程；不进入真实 Telegram delivery、PM final decision、WebUI、生产/ignored SQLite 迁移或后续 R6 子任务。

## 前置阅读

已阅读并按边界执行：

- `docs/v8/README.md` — V8 clean rebuild baseline 与 R1+ 主线边界。
- `docs/v8/legacy-dal-boundary.md` — legacy DAL 只读/archive；V8 report 主流程不得回退 `src/db/dal.ts` / direct SQLite。
- `docs/v8/long-proof-r6-t1-report-lifecycle.md` — R6 report lifecycle：`pending -> sending -> sent`，非法跳跃返回 409。
- `docs/v8/long-proof-r6-t2-visible-message-formatter.md` — 可见消息只发送 sanitized `summary`，raw payload 留在 `payload_json`。

## 修改文件

本卡新增/修改：

- `prisma/schema.prisma`
  - `Report` 增加可选 `dedupe_key`。
  - 增加 `@@unique([project_id, dedupe_key])`，同一 project 内相同 dedupe key 只能存在一条 report；不同 project 可复用同一 key。
- `src/repositories/v8.ts`
  - `ReportCreateInput` 增加 `dedupe_key`。
  - `ReportRepository.create()` 在同项目同 dedupe key 已存在时直接返回既有 report，不创建第二条待发送 report。
  - 捕获 Prisma `P2002` 唯一冲突后再次按 `project_id + dedupe_key` 读取既有 report，覆盖并发重复创建。
  - `ReportRepository.list()` 支持按 `dedupe_key` 查询，便于 proof/测试验证。
- `src/api/schemas.ts`
  - Runtime report create schema 允许 `dedupe_key` 与 `visible_message`，保持 API 层可显式提交 dedupe key。
- `tests/v8/v8_repositories.test.ts`
  - 增加 fail-first contract：同 project 同 dedupe key 第二次 create 返回首条 report，payload/summary 不被覆盖；跨 project 可复用同一 key；同 project 仅 1 条。
- `tests/v8/v8_runtime_api_route_boundary.test.ts`
  - 增加 Runtime API contract：重复 `POST /api/v1/runtime/reports` 使用相同 dedupe key 返回同一 report id，DB 只有 1 条。
- `docs/v8/long-proof-r6-t3-dedupe-key.md`
  - 本 proof 文件。

注意：工作区进入本卡前已有 R4/R5/R6-T1/R6-T2 累计 dirty diff/untracked proof；本卡主审范围应聚焦上述 R6-T3 文件/片段。

## TDD 记录

| 阶段 | 命令 | 结果 |
|---|---|---|
| RED | `npm test -- --runInBand tests/v8/v8_repositories.test.ts --testNamePattern "ReportRepository writes"` | failed：TypeScript 报 `dedupe_key` 不存在于 `ReportCreateInput` / list filter，证明 dedupe contract 尚未实现。 |
| GREEN-1 | 同上 | passed：同 project 重复 dedupe key 返回同一 report，跨 project 可复用。 |
| GREEN-2 | `npm test -- --runInBand tests/v8/v8_runtime_api_route_boundary.test.ts --testNamePattern "projects/tasks/runs/reports"` | passed：Runtime API 重复 report 返回同一 id，DB count=1。 |
| Regression | `npm test -- --runInBand tests/v8/v8_repositories.test.ts tests/v8/v8_runtime_api_route_boundary.test.ts tests/v8/v8_visible_message_formatter.test.ts` | passed：3 suites / 11 tests。 |
| V8 suite | `npm test -- --runInBand tests/v8` | passed：14 suites / 68 tests。 |

## 验证命令与结果

完整验证日志：`/tmp/nexus-v8-r6-t3-dedupe-key-verify.log`

- 行数/SHA：`122 /tmp/nexus-v8-r6-t3-dedupe-key-verify.log`；`2011b7e20d1cd0ceb84015257fead3de3d0bfd32af01c324845c22ed6652d4cd`。
- Summary：`/tmp/nexus-v8-r6-t3-dedupe-key-summary.md`。

| 命令 | 结果 |
|---|---|
| `npx prisma validate` | passed：schema valid。 |
| `npm test -- --runInBand tests/v8/v8_repositories.test.ts --testNamePattern "ReportRepository writes"` | passed：1 focused test。 |
| `npm test -- --runInBand tests/v8/v8_runtime_api_route_boundary.test.ts --testNamePattern "projects/tasks/runs/reports"` | passed：1 focused API test。 |
| `npm test -- --runInBand tests/v8/v8_repositories.test.ts tests/v8/v8_runtime_api_route_boundary.test.ts tests/v8/v8_visible_message_formatter.test.ts` | passed：3 suites / 11 tests。 |
| `npm test -- --runInBand tests/v8` | passed：14 suites / 68 tests。 |
| `npm run build` | passed：`tsc` exit 0。 |
| `git diff --check` | passed：no whitespace error。 |
| production TS source boundary scan | passed：`src/repositories/v8.ts`、`src/services/v8_runtime_api_service.ts`、`src/api/schemas.ts` 未命中 legacy DAL / direct SQLite / ignored DB / raw Prisma SQL。 |
| pollution status scan | passed：`pollution_status_hits=[]`。 |
| tracked pollution scan | passed：`tracked_pollution_hits=[]`。 |

说明：首次 broad source scan 把 `prisma/schema.prisma` 中历史注释里的 `src/db/dal`、`data/nexus.db` 识别为命中；已用生产 TS 文件 scoped scan 复核通过，非本卡新增运行时依赖。

环境噪声：shell 启动时输出 `/root/.openclaw/completions/openclaw.bash: No such file or directory`，验证命令 exit 0。

## 已实现内容

1. report 创建支持 `dedupe_key`，同一 `project_id + dedupe_key` 重复提交不会创建第二条 report。
2. 重复提交返回既有 report，保持首条 report 的 `summary/payload_json/status`，避免 duplicate report 进入 pending/sending/sent 发送链路。
3. 跨 project 隔离：不同 project 可复用相同 dedupe key，不互相 suppress。
4. API 层允许调用方传入 `dedupe_key`，并通过 V8 Runtime API / Repository / Prisma 边界落库。
5. 并发安全：DB unique constraint + P2002 fallback 兜底，防止竞态下双写。

## 剩余风险

1. 本卡只实现 report queue 层 dedupe；真实 Telegram delivery worker 尚未实现，后续 sender 必须按 R6-T1 先 `pending -> sending` 再 `sent`，并只发送一次既有 report。
2. `dedupe_key` 的业务生成规则需由上游调用方/后续 delivery card 明确；建议使用稳定业务维度，例如 `${project_id}:${message_type}:${task_id}:${run_id}` 或 review/report 专用 key。
3. Prisma schema 注释仍保留历史 `failed` 文案，而 FSM/API 当前使用 `error`；此为 R6-T1 已记录风险，本卡未扩大范围。
4. 工作区存在进入本卡前的 R4/R5/R6-T1/R6-T2 累计 dirty diff/untracked proof，非本卡新增阻塞。

## 下一阶段输入

- 后续 report delivery/Telegram sender 必须使用 `dedupe_key` 生成稳定发送锁，重复 report creation 只能拿到既有 report id。
- 发送阶段继续遵守 R6-T1 lifecycle：`pending -> sending -> sent`；不得直接 `pending -> sent`。
- 群组正文继续使用 R6-T2 sanitized `summary`，完整 trace 只保留在 `payload_json` / artifact / DB proof。
