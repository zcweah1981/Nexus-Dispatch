# Long Proof — V8-R9-T7 RC 验收报告与 v8-rc1 标记

任务：`nexus-v8-r9-t7-rc-report-tag`
范围：仅生成 PM RC 验收报告、执行 RC 验证矩阵、创建/验证本地等价 RC 标记 `v8-rc1`。不新增业务语义，不操作生产/ignored SQLite，不推送远端 GitHub。

## 前置阅读

- `docs/v8/README.md`
- `docs/v8/legacy-test-classification.md`
- `docs/v8/legacy-dal-boundary.md`
- `docs/v8/prisma-schema-boundary.md`
- `docs/v8/long-proof-r0-clean-rebuild-baseline.md`
- `docs/v8/long-proof-r9-t2-worker-proof-review-pass-e2e.md`
- `docs/v8/long-proof-r9-t3-review-fail-retry-pass-e2e.md`
- `docs/v8/long-proof-r9-t4-group-closeout-e2e.md`
- `docs/v8/long-proof-r9-t5-cron-registry-isolation-smoke.md`
- `docs/v8/long-proof-r9-t6-daemon-restart-recovery-smoke.md`

## 修改文件

- `docs/v8/pm-acceptance-report-v8-rc1.md` — PM RC 验收报告。
- `docs/v8/long-proof-r9-t7-rc-report-tag.md` — 本 proof 文件。
- `tests/v8/v8_daemon_tick_loop.test.ts` — 修正 R9-T6 audit trail 断言：按 `status='error'` / `error_stack contains timeout_recovery` 定位 original stale run，避免依赖 `run_id ASC` 的字典序偶然性。
- 本地 Git tag：`v8-rc1`（annotated tag，指向 HEAD `5cf75df765d7e95ff19c2f541498a3cfba815bb9`；不 push）。

## 实现内容

1. 汇总 R0-R9 前序 proof 与边界文档，生成 PM RC 验收报告。
2. 创建本地 annotated tag `v8-rc1`，等价 RC 标记指向当前 HEAD。
3. 按 RC 验收要求执行 V8 测试、Prisma validate、root build、WebUI build、diff/pollution/source-boundary 扫描。
4. RC 验证中发现 R9-T6 测试对 run 排序假设脆弱：先记录失败，再最小修正测试断言并重跑全量验证。
5. 输出 proof：修改文件、测试命令、结果、剩余风险、下一阶段输入。

## 验证命令与结果

验证日志：

- `/tmp/nexus-v8-r9-t7-rc-report-tag-verify.log`
- 行数：`174`
- SHA256：`2e5a124401a7047faf8d81777471ac060e9d33fd2def66d9ff2fbc1a41f02c7b`
- Summary：`/tmp/nexus-v8-r9-t7-rc-report-tag-summary.md`

通过命令：

```bash
npm test -- --runInBand tests/v8
npm test -- --runInBand tests/v8/v8_project_agent_blueprint_e2e.test.ts tests/v8/v8_daemon_tick_loop.test.ts
npx prisma validate
npm run build
npm --prefix src/webui run build
git diff --check
python3 v8 source boundary scan
python3 v8 runtime route thin scan
python3 pollution status scan
python3 tracked pollution scan
git show --no-patch v8-rc1
```

结果摘要：

- `tests/v8`：21 suites / 100 tests passed。
- R9 E2E slice：2 suites / 18 tests passed。
- Prisma validate：schema valid。
- root build：`tsc` passed。
- WebUI build：Vite build passed；生成 `src/webui/dist` 未进入 git status。
- `git diff --check`：passed。
- V8 source boundary：`v8_source_boundary_hits=[]`。
- V8 Runtime route thin scan：`v8_runtime_route_forbidden_hits=[]`，slice `58..492`。
- pollution status：`pollution_status_hits=[]`。
- tracked pollution：`tracked_pollution_hits=[]`。
- `v8-rc1` tag target：`5cf75df765d7e95ff19c2f541498a3cfba815bb9`。

## TDD / 调试记录

- 首轮 RC bundle：`tests/v8` passed，但 R9 E2E slice 中 R9-T6 失败：`allRuns[0].status` 期望 `error`，实际 `success`。
- 判定：测试脆弱断言；`run_id ASC` 字典序不能代表 original stale run 时间顺序。
- 修正：改为 `allRuns.find((r) => r.status === 'error')` 并断言 `error_stack` 包含 `timeout_recovery`，再查找 success retry run。
- focused rerun：`npm test -- --runInBand tests/v8/v8_project_agent_blueprint_e2e.test.ts tests/v8/v8_daemon_tick_loop.test.ts` passed。
- 最终 RC bundle：全绿，详见日志 SHA。

## 剩余风险 / 非阻断观察

1. 当前仓库进入本卡前已有大量 R4-R9 累积 dirty/untracked WIP；本卡主审范围为 RC 报告/proof、`v8-rc1` 本地 tag 与 R9-T6 测试脆弱断言修正。历史/legacy/未触碰问题按治理要求仅列为非阻断观察。
2. `v8-rc1` tag 指向 HEAD；未提交 WIP 文件不会被 tag 包含。若需要可复现远端 release，必须另行获得 PM 对提交整理与 remote push 的明确授权。
3. legacy route observation scan 仍发现旧入口/旧 API 路由 direct DB/raw SQL 痕迹；V8 Runtime route slice 已验证 clean。legacy route retirement 应作为后续专卡处理。
4. 本 RC 验证为 temp DB / mock workerClient / build-level smoke；真实 systemd restart、真实 Telegram delivery、真实 cron scheduler adapter 属于 R10+/ops 后续范围。

## 下一阶段输入

- R10+/ops：systemd 级 restart smoke、journald/health-check、真实 daemon 长跑。
- Release hygiene：冻结当前 WIP、整理提交、重新打可复现 tag；是否 push 需 PM 明确授权。
- Legacy route retirement：清理旧 `/tasks/*` direct DB/raw SQL route 与旧 default DB path。
- WebUI/API alignment：继续补齐 graph metadata 与 proof summary API 对齐。
