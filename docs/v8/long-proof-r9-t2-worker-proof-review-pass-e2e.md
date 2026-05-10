# Long Proof — V8-R9-T2 worker proof -> review PASS -> completed E2E

任务：`nexus-v8-r9-t2-worker-proof-review-pass-e2e`
范围：仅补齐 R9-T2 daemon E2E 合同，证明 DEV worker proof 进入 `pm_audit` review，REVIEW worker 返回显式 PASS 后，review task 与 original task 均经 V8 FSM/service 路径 completed；不改生产 DB / ignored SQLite / dist / node_modules / secrets / proof JSON / `.env`。

## 前置阅读

- `docs/v8/README.md` — V8 clean rebuild 主线约束。
- `docs/v8/legacy-test-classification.md` — legacy 测试边界。
- `docs/v8/legacy-dal-boundary.md` — V8 不回退 legacy DAL / direct SQLite。
- `docs/v8/prisma-schema-boundary.md` — Prisma schema / Client 为 V8 主线契约。
- `docs/v8/long-proof-r4-worker-openai-dispatch.md`、`docs/v8/long-proof-r4-result-ingestion-once.md` — worker dispatch/result proof 输入。
- `docs/v8/long-proof-r5-review-pass-closure.md`、`docs/v8/long-proof-r5-dynamic-review-task.md` — pm_audit review PASS closeout 输入。
- `docs/v8/long-proof-r8-t5-sse-events.md` — R9 前置阶段 proof 汇总输入。

## 修改文件

本卡 task-scoped 修改：

- `tests/v8/v8_daemon_tick_loop.test.ts`
  - 新增 `R9-T2 drives worker proof through pm_audit review PASS to completed via daemon ticks` E2E 合同。
  - 在 temp Prisma DB 中 seed project / agents / group / original pm_audit task / cross-project sentinel。
  - 通过 mock workerClient 驱动两轮 daemon tick：
    1. Long DEV dispatch -> worker proof -> `submit_completion` -> review task created，original 进入 `review_pending`。
    2. Shun REVIEW dispatch -> worker proof `{ verdict: 'PASS' }` -> review closeout，original 与 review task 均 `completed`。
  - 断言 worker_result_ingest artifacts 对 original/review task 均存在，且 cross-project sentinel 未被触碰。
- `src/daemon/v8_tick_loop.ts`
  - ingest REVIEW / `reviewer_verdict` worker result 时，把 `workerResult.proof.verdict` 规范化写入 task transition proof 的 `verdict` / `review_verdict` 字段。
  - 保持状态变化通过 `transitionTask()` / V8 FSM；不直接写 completed。
- `docs/v8/long-proof-r9-t2-worker-proof-review-pass-e2e.md`
  - 本 proof 文档。

## TDD 记录

| 阶段 | 命令 | 结果 |
|---|---|---|
| RED | `npm test -- --runInBand tests/v8/v8_daemon_tick_loop.test.ts -t 'R9-T2 drives worker proof'` | failed：第二轮 review closeout 将 Shun worker proof 误判为 FAIL，输出 `review-fail-retry:*`，原因是 ingest transition 覆盖了 review task 原始 PASS proof，`parseReviewVerdictFromTask()` 找不到显式 PASS。 |
| GREEN | `npm test -- --runInBand tests/v8/v8_daemon_tick_loop.test.ts -t 'R9-T2 drives worker proof'` | passed：1 test。 |

## 验证命令与结果

| 命令 | 结果 |
|---|---|
| `npm test -- --runInBand tests/v8/v8_daemon_tick_loop.test.ts -t 'R9-T2 drives worker proof'` | passed：1 suite / 1 test。 |
| `npm test -- --runInBand tests/v8/v8_daemon_tick_loop.test.ts tests/v8/v8_review_policy.test.ts` | passed：2 suites / 23 tests。 |
| `npm test -- --runInBand tests/v8` | passed：21 suites / 96 tests。 |
| `npx prisma validate` | passed：schema valid。 |
| `npm run build` | passed：root TypeScript build。 |
| `git diff --check` | passed：无 whitespace error。 |
| source/pollution scan | passed：`SOURCE_BOUNDARY_OK`，`pollution_status_hits=[]`，`tracked_pollution_hits=[]`。 |

验证日志：`/tmp/nexus-v8-r9-t2-worker-proof-review-pass-e2e-verify.log`

- lines：`160`
- sha256：`5bf4415998d014ca1942d1e05aaa4920fda3b5f25f34959f4ddb3f20376b9518`
- summary：`/tmp/nexus-v8-r9-t2-worker-proof-review-pass-e2e-summary.md`

环境噪声：日志首行 `/root/.openclaw/completions/openclaw.bash: No such file or directory` 为 shell startup warning；所有验证命令 exit 0。

## 已实现内容

1. E2E 合同覆盖完整链路：dispatch worker -> worker proof -> pm_audit review task -> reviewer PASS worker proof -> review closeout -> completed。
2. REVIEW verdict worker result 不再丢失显式 PASS 语义；ingest 后 proof 中保留/规范化 `verdict` 与 `review_verdict`。
3. 状态变化仍通过 V8 `transitionTask()` / FSM Controller；未引入 direct completed write。
4. project_id 分区验证覆盖同项目 original/review artifact 与 cross-project sentinel。

## 剩余风险 / 非阻断观察

1. 当前工作区已有大量前序 R4/R5/R6/R7/R8 累计 dirty/untracked WIP；本卡主审范围是 `src/daemon/v8_tick_loop.ts`、`tests/v8/v8_daemon_tick_loop.test.ts` 与本 proof。历史/未触碰文件问题按治理要求只列为非阻断观察。
2. 本卡使用 mock workerClient 驱动 E2E；真实 Telegram delivery / WebUI / cron backend 不在 R9-T2 范围。
3. reviewer verdict 目前通过 proof 字段解析 PASS/FAIL；后续如扩展结构化 reviewer schema，可继续将 `review_verdict` 标准化为独立契约。

## 下一阶段输入

1. 可追加真实 OpenAI-compatible worker endpoint smoke（仍使用 temp DB / fake endpoint），证明外部 worker 返回结构化 proof 与当前 ingest 规范一致。
2. 可把 review verdict proof schema 固化到 API/worker response contract，避免自由文本 verdict 歧义。
3. 可补 event bus 层 E2E，验证 completed closeout 后 report/SSE/WebUI 展示链路。
