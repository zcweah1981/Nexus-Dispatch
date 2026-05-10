# Long Proof — V8-R9-T3 review FAIL -> retry -> PASS E2E

任务：`nexus-v8-r9-t3-review-fail-retry-pass-e2e`
范围：仅补齐 R9-T3 daemon E2E 合同，证明 reviewer 第一次显式 `CHANGES_REQUESTED/FAIL` 后 original 进入 `retry_ready`，下一 tick 重新派发 Long，第二次 reviewer `PASS` 后 original completed。未进入真实 Telegram delivery、WebUI、cron backend、生产/ignored SQLite 或后续阶段。

## 前置阅读

- `docs/v8/README.md` — V8 clean rebuild 主线约束。
- `docs/v8/legacy-test-classification.md` — R9 E2E rewrite 输入与 legacy 边界。
- `docs/v8/legacy-dal-boundary.md` — V8 Runtime/Daemon 不回退 legacy DAL/direct SQLite。
- `docs/v8/prisma-schema-boundary.md` — Prisma schema / Client 为 V8 主线数据层契约。
- `docs/v8/long-proof-r5-review-fail-retry-deadletter.md` — reviewer FAIL -> retry/deadletter 输入。
- `docs/v8/long-proof-r5-review-pass-closure.md` — reviewer PASS closeout 输入。
- `docs/v8/long-proof-r9-t2-worker-proof-review-pass-e2e.md` — R9 worker proof -> PASS E2E 前序输入。

## 修改文件

本卡 task-scoped 修改：

- `tests/v8/v8_daemon_tick_loop.test.ts`
  - 新增 `R9-T3 drives review FAIL to retry_ready, redispatch, then reviewer PASS completes original` E2E 合同。
  - 在 temp Prisma DB 中 seed project / DEV+REVIEW agents / group / original `pm_audit` task / cross-project sentinel。
  - 通过 mock workerClient 驱动四轮 daemon tick：
    1. Long DEV dispatch -> worker proof -> review task created，original 进入 `review_pending`。
    2. Shun REVIEW dispatch -> `{ verdict: 'CHANGES_REQUESTED' }` -> original `retry_ready`，first review task `completed`，review bridge `changes_requested`。
    3. Long redispatch original -> retry worker proof -> 新 review task created，original 再次 `review_pending`。
    4. Shun REVIEW dispatch -> `{ verdict: 'PASS' }` -> retry review task 与 original 均 `completed`。
  - 断言 4 个 `worker_result_ingest` artifacts 均存在，且 cross-project sentinel 未被触碰。
- `src/daemon/v8_tick_loop.ts`
  - `spawnReviewTasks()` 查询 existing review bridge 时仅复用 active/blocking review（`created/dispatched/running/blocked`），不再把历史 `changes_requested` review 当作可复用 review_task。
  - 保持状态变化通过 `transitionTask()` / V8 FSM；未直接写 completed。
- `docs/v8/long-proof-r9-t3-review-fail-retry-pass-e2e.md`
  - 本 proof 文档。

## TDD 记录

| 阶段 | 命令 | 结果 |
|---|---|---|
| RED | `npm test -- --runInBand tests/v8/v8_daemon_tick_loop.test.ts -t 'R9-T3 drives review FAIL'` | failed：第三轮 retry 后只查到 1 条 review；daemon 将历史 `changes_requested` bridge 作为 existing review 复用，导致未生成新的 retry review task。 |
| GREEN | `npm test -- --runInBand tests/v8/v8_daemon_tick_loop.test.ts -t 'R9-T3 drives review FAIL'` | passed：1 test。 |

## 验证命令与结果

| 命令 | 结果 |
|---|---|
| `npm test -- --runInBand tests/v8/v8_daemon_tick_loop.test.ts -t 'R9-T3 drives review FAIL'` | passed：1 suite / 1 test。 |
| `npm test -- --runInBand tests/v8/v8_daemon_tick_loop.test.ts -t 'R9-T[23]'` | passed：1 suite / 2 tests。 |
| `npm test -- --runInBand tests/v8/v8_review_policy.test.ts` | passed：1 suite / 11 tests。 |
| `npm test -- --runInBand tests/v8` | passed：21 suites / 97 tests。 |
| `npx prisma validate` | passed：schema valid。 |
| `npm run build` | passed：root TypeScript build。 |
| `git diff --check` | passed：无 whitespace error。 |
| source/pollution scan | passed：`SOURCE_BOUNDARY_OK`，`pollution_status_hits=[]`，`tracked_pollution_hits=[]`。 |

验证日志：`/tmp/nexus-v8-r9-t3-review-fail-retry-pass-e2e-verify.log`

- lines：`177`
- sha256：`5f40d8d01bfe987a2ab6eb2113d009d1ab25fb7855a29ad9e5a4a330ab10ab8a`
- summary：`/tmp/nexus-v8-r9-t3-review-fail-retry-pass-e2e-summary.md`
- HEAD：`5cf75df765d7e95ff19c2f541498a3cfba815bb9`

环境噪声：日志首行 `/root/.openclaw/completions/openclaw.bash: No such file or directory` 为 shell startup warning；验证命令 exit 0。

## 已实现内容

1. E2E 合同覆盖完整链路：worker proof -> review FAIL -> `retry_ready` -> Long redispatch -> worker proof -> review PASS -> completed。
2. Retry 后 daemon 不再复用历史 `changes_requested` review bridge，而是为新的 proof 生成新的 review task。
3. FAIL/PASS closeout 仍复用 R5/R9 既有 `transitionTask()` / FSM Controller；未引入 direct completed write。
4. project_id 分区验证覆盖同项目 original/review artifacts 与 cross-project sentinel。

## 剩余风险 / 非阻断观察

1. 当前工作区已有大量前序 R4/R5/R6/R7/R8/R9 累计 dirty/untracked WIP；本卡主审范围是 `src/daemon/v8_tick_loop.ts`、`tests/v8/v8_daemon_tick_loop.test.ts` 与本 proof。历史/legacy/未触碰文件问题按治理要求只列为非阻断观察。
2. 本卡使用 mock workerClient 驱动 E2E；真实 Telegram delivery / WebUI / cron backend 不在 R9-T3 范围。
3. 二次 FAIL loop-breaker 已由 R5 合同覆盖；本卡只覆盖一次 FAIL 后成功 retry PASS 的 happy recovery path。

## 下一阶段输入

1. 可追加真实 OpenAI-compatible worker endpoint smoke，证明外部 worker 返回 `CHANGES_REQUESTED` / `PASS` 结构与当前 ingest 规范一致。
2. 可把 retry 后 review bridge lineage 固化为显式字段，便于 WebUI 展示多轮 review 历史。
3. 可补 event bus/report 层 E2E，验证 retry/pass closeout 后 report/SSE/WebUI 展示链路。
