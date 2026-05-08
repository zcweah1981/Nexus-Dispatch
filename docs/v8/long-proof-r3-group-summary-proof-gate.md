# Long Proof — V8-R3-T4 Group Summary Proof Gate

任务：`nexus-v8-r3-t4-group-summary-proof-gate`
范围：在 R3 当前 phase/group 显式 thaw 服务中增加“后续 phase 解冻前必须已有前序 group summary proof”的最小 gate；不进入 daemon auto-thaw、dispatch、review/report 投递、cron、WebUI 或生产 DB 迁移。

## 前置阅读

- `docs/v8/README.md`
- `docs/v8/long-proof-r0-clean-rebuild-baseline.md`
- `docs/v8/legacy-dal-boundary.md`
- `docs/v8/prisma-schema-boundary.md`
- `docs/v8/long-proof-r2-api-contract-tests.md`
- `docs/v8/long-proof-r3-blueprint-json-schema.md`
- `docs/v8/long-proof-r3-freeze-blueprint.md`
- `docs/v8/long-proof-r3-thaw-current-phase.md`

## 修改文件

- `src/engine/v8_blueprint_thaw.ts` — 新增 `assertPriorPhaseSummaryProof()`，当请求 thaw 非首个 phase 时，要求前一 phase 的 `TaskGroup` 属于同 `project_id`、`status='archived'`，且存在同项目 `reports.message_type='group_summary' AND status='sent'`，其 `payload_json` 绑定前序 `group_id` 或 `task_group_id`；否则抛出 `409/GROUP_SUMMARY_PROOF_REQUIRED`。
- `tests/v8/v8_blueprint_thaw_current_phase.test.ts` — 新增 fail-first contract：前序 group 未完成、仅 archived 但无 sent summary proof 时都不得 thaw 下一 phase；写入 sent `group_summary` proof 后才允许 thaw。
- `docs/v8/long-proof-r3-group-summary-proof-gate.md` — 本 proof 文件。

## 实现内容

1. 首个 phase 不受该 gate 影响，仍可由 `POST /api/v1/runtime/blueprints/thaw-current-phase` 或 service 显式 thaw。
2. 非首个 phase thaw 前先定位 blueprint 中的前一 phase，并 project-scoped 查询对应 `TaskGroup`。
3. gate 条件为：前序 group 已归档（`archived`）且同项目已有已发送的 group summary proof（`reports.message_type='group_summary'`、`status='sent'`，payload 绑定前序 group）。
4. gate 失败时 fail-closed：返回/抛出 `GROUP_SUMMARY_PROOF_REQUIRED`，不会创建下一 phase 的 `TaskGroup`/`Task`。
5. 未改变 R2 FSM 状态链路；任务状态仍必须由 Runtime API/FSM Controller 推进。

## 验证命令与结果

| 命令 | 结果 |
|---|---|
| `npm test -- --runInBand tests/v8/v8_blueprint_thaw_current_phase.test.ts --testNamePattern='service blocks later phase thaw'` | RED：新增测试先失败，现有实现会直接 thaw `r3-p2`。 |
| `npm test -- --runInBand tests/v8/v8_blueprint_thaw_current_phase.test.ts --testNamePattern='service blocks later phase thaw'` | GREEN：1 passed。 |
| `npm test -- --runInBand tests/v8/v8_blueprint_thaw_current_phase.test.ts` | passed：1 suite / 5 tests。 |
| `npm test -- --runInBand tests/v8` | passed：11 suites / 41 tests。 |
| `npx prisma validate` | passed：schema valid。 |
| `npm run build` | passed：`tsc` exit 0。 |
| `git diff --check` | passed：no output。 |
| `npm test -- --runInBand` | passed：32 suites / 221 tests。 |
| pollution scan：`git status --short --untracked-files=all \| grep -E '(^\|/)(dist\|node_modules)(/\|$)\|\\.db(-wal\|-shm)?$\|\\.sqlite(3)?$\|secret\|\\.env\|proof.*\\.json\|test_proof.*\\.json' \|\| true` | no output。 |
| tracked pollution：`git ls-files data prisma/data dist src/webui/dist '*.db' '*.sqlite' '*.sqlite3' 'proof*.json' '*proof*.json' '.env' '*.env' \|\| true` | no output。 |
| source denylist：task scoped `grep -R "better-sqlite3\|sqlite3\|data/nexus.db\|prisma/data/nexus.db\|\$queryRaw\|\$executeRaw" ...` | 仅命中测试中的 denylist regex 字符串；生产文件无 direct SQLite / ignored DB / raw query。 |

## 剩余风险

1. 本卡只在 R3 explicit thaw service 层实现 group summary proof gate；未实现 group summary report 的生成/投递器，也未接入 daemon 自动推进。
2. 当前 proof 绑定依据为 `reports.payload_json` 中的 `group_id` 或 `task_group_id` 字符串；后续若新增专用 summary artifact 或 Report schema 字段，应替换为更强结构化关联。
3. 仍未触碰 ignored/runtime SQLite；实际环境需要后续通过安全迁移/初始化获得相同 schema。

## 下一阶段输入

- 后续 phase gate/daemon 若要自动 thaw 下一阶段，必须复用该 gate 或同等 project-scoped service，不得绕过 group summary proof。
- 后续 report/closeout 卡应定义并发送 `message_type='group_summary'` 的结构化 payload，至少包含 `group_id` 或 `task_group_id`，发送成功后再允许推进 phase。
- 可复用 focused gate：`npm test -- --runInBand tests/v8/v8_blueprint_thaw_current_phase.test.ts`。
