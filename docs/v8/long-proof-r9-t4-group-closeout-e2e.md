# Long Proof — V8-R9-T4 group closeout -> next phase thaw E2E

任务：`nexus-v8-r9-t4-group-closeout-e2e`
范围：仅补齐 R9-T4 daemon E2E 合同与最小 closeout 后续 phase thaw 串联：completed group -> archive -> `group_summary` sent proof -> next blueprint phase thaw。未进入真实 Telegram delivery、WebUI、cron backend、生产/ignored SQLite 或后续阶段。

## 前置阅读

- `docs/v8/README.md` — V8 clean rebuild 主线约束。
- `docs/v8/legacy-test-classification.md` — R9 E2E rewrite 输入与 legacy 边界。
- `docs/v8/legacy-dal-boundary.md` — V8 Runtime/Daemon 不回退 legacy DAL/direct SQLite。
- `docs/v8/prisma-schema-boundary.md` — Prisma schema / Client 为 V8 主线数据层契约。
- `docs/v8/long-proof-r9-t2-worker-proof-review-pass-e2e.md` — worker proof -> review PASS -> completed 前序输入。
- `docs/v8/long-proof-r9-t3-review-fail-retry-pass-e2e.md` — review FAIL -> retry -> PASS 前序输入。

## 修改文件

本卡 task-scoped 修改：

- `tests/v8/v8_daemon_tick_loop.test.ts`
  - 新增 `R9-T4 closes a completed group, writes summary proof, and thaws the next blueprint phase` E2E 合同。
  - 在 temp Prisma DB 中 seed project / frozen blueprint / phase A completed group / phase B next group / cross-project sentinel。
  - 单次 `V8DaemonTickLoop.tick()` 断言：
    - phase A group 归档为 `archived`。
    - 写入 `message_type='group_summary'` 且 `status='sent'` 的 summary proof。
    - summary payload 记录 `next_phase`。
    - phase B `TaskGroup` 与 2 个 task 被 thaw，task 保持 `created`。
    - phase B 内 dependency 同项目创建。
    - 其他 project 同名 group 不被归档，也不 thaw phase B。
- `src/daemon/v8_tick_loop.ts`
  - closeout result 增加 `details` 作为 runtime proof 观测字段。
  - 新增 `advanceNextPhaseAfterCloseout()`：从 archived group `ext_meta.blueprint_id/phase_id` 读取同项目 frozen blueprint 上下文，调用 `V8RuntimeApiService.advancePhase()`，复用既有 R3 thaw gate。
  - closeout 创建/复用 `group_summary` 后才 advance next phase，并把 `next_phase` 写回 summary payload。
  - 保持任务状态变化仍走 V8 service/FSM/thaw engine；未直接操作生产 DB 或 legacy DAL。
- `docs/v8/long-proof-r9-t4-group-closeout-e2e.md`
  - 本 proof 文档。

## TDD 记录

| 阶段 | 命令 | 结果 |
|---|---|---|
| RED | `npm test -- --runInBand tests/v8/v8_daemon_tick_loop.test.ts -t 'R9-T4'` | 失败：只出现 `group-archived:r9-t4-group-a`，缺 `next-phase-thawed:r9-t4-group-b`，证明 closeout 后未 thaw 下一阶段。 |
| GREEN | `npm test -- --runInBand tests/v8/v8_daemon_tick_loop.test.ts -t 'R9-T4'` | PASS：1 passed。 |

## 验证命令与结果

完整验证日志：`/tmp/nexus-v8-r9-t4-verify.log`

- 行数：`255 /tmp/nexus-v8-r9-t4-verify.log`
- SHA256：`79f51c72f8bf2a7df23d01e70ebeeae190f0517f3c74f417651846121ec4420d`
- Summary：`/tmp/nexus-v8-r9-t4-verify-summary.md`

通过命令：

```bash
npm test -- --runInBand tests/v8/v8_daemon_tick_loop.test.ts -t 'R9-T4'
npm test -- --runInBand tests/v8/v8_daemon_tick_loop.test.ts -t 'R9-T[234]|closeout archives'
npm test -- --runInBand tests/v8/v8_daemon_tick_loop.test.ts
npm test -- --runInBand tests/v8
npx prisma validate
npm run build
git diff --check
python3 source-boundary scan
python3 pollution status scan
```

结果摘要：

- `tests/v8/v8_daemon_tick_loop.test.ts`：14 passed。
- `tests/v8`：21 suites passed / 98 tests passed。
- `npx prisma validate`：valid。
- `npm run build`：`tsc` 通过。
- `git diff --check`：通过。
- source-boundary scan：`source_boundary_ok`，本卡触达源文件未出现 `better-sqlite3/sqlite3/data/nexus.db/prisma/data/nexus.db/$queryRaw/$executeRaw`。
- pollution status scan：`pollution_status_ok`，未新增 DB/dist/node_modules/secrets/proof JSON/.env 污染。

## 剩余风险

- 当前仓库进入本卡前已有大量 R5/R6/R7/R8/R9 相关 dirty/untracked WIP；本卡只在 `src/daemon/v8_tick_loop.ts`、`tests/v8/v8_daemon_tick_loop.test.ts` 与本 proof 文档范围内新增 R9-T4 行为。最终 `git status` 中的其他文件保留为前序/并行任务工作区状态，未在本卡扩展处理。
- closeout -> next phase thaw 依赖 `TaskGroup.ext_meta` 中存在 `blueprint_id` 与 `phase_id`。缺失该元数据时保持只 closeout，不自动 thaw；这是兼容既有非 blueprint group 的保守行为。
- 本卡不做真实 Telegram 群发、不做 WebUI 展示、不做 cron/backend 自动调度策略。

## 下一阶段输入

- 下游可基于 `group_summary.payload_json.next_phase` 与 newly thawed `TaskGroup/Task` 进入下一阶段派发。
- 如果需要对缺失 `ext_meta.blueprint_id/phase_id` 的 legacy/thawed group 自动补齐，建议单独 migration/backfill 卡处理。
