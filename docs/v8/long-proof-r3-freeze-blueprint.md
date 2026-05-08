# Long Proof — V8-R3-T2 Freeze Blueprint

任务：`nexus-v8-r3-t2-freeze-blueprint`
范围：仅实现 freeze blueprint inert metadata；不执行 thaw/phase gate/daemon/review/report/cron/WebUI 行为，未触碰生产 DB 或 ignored SQLite。

## 前置阅读

- `docs/v8/README.md`
- `docs/v8/long-proof-r0-clean-rebuild-baseline.md`
- `docs/v8/legacy-dal-boundary.md`
- `docs/v8/prisma-schema-boundary.md`
- `docs/v8/long-proof-r2-api-contract-tests.md`
- `docs/v8/long-proof-r3-blueprint-json-schema.md`

## 修改文件

- `src/engine/v8_blueprint_freezer.ts` — 新增 `freezeV8Blueprint()`，先 `parseV8Blueprint()` 再写入 `project_blueprints.status='frozen'`；校验 project 存在；拒绝同 `blueprint_id` 跨项目复用；只返回 phase/task 计数，不创建 runtime rows。
- `tests/v8/v8_blueprint_freezer.test.ts` — 新增 freeze 合同测试：frozen 存储、TaskGroup/Task 零污染、legacy freezer 不消费 frozen blueprint、跨项目复用拒绝、malformed blueprint 写前失败。
- `docs/v8/long-proof-r3-freeze-blueprint.md` — 本 proof 文件。

## 实现内容

1. Freeze 行为把 V8 Blueprint JSON 存为项目元数据：`project_blueprints.schema_json = JSON.stringify(parsedBlueprint)`，`status='frozen'`。
2. 写入前强制调用 `parseV8Blueprint()`；包含 runtime 字段（例如 task.status）的 malformed blueprint 会在 DB 写入前失败。
3. `blueprint_id` 作为全局唯一业务键：同项目可 upsert，跨项目复用直接拒绝，避免租户间 blueprint 污染。
4. frozen blueprint 保持非 active：legacy `FreezerEngine.thaw_next_phase()` 只读取 active blueprint，因此不会把 frozen blueprint 注入 `task_groups` / `nexus_tasks`。
5. 本卡不实现 thaw，也不绕过 R2 Runtime API/service/FSM Controller 做任何 task/run 状态变化。

## 验证命令与结果

| 命令 | 结果 |
|---|---|
| `npm test -- --runInBand tests/v8/v8_blueprint_freezer.test.ts` | passed：1 suite / 4 tests |
| `npx prisma validate` | passed：schema valid |
| `npm run build` | passed：`tsc` exit 0 |
| `npm test -- --runInBand tests/v8` | passed：10 suites / 36 tests |
| `npm test -- --runInBand` | passed：31 suites / 216 tests |
| `git diff --check` | passed：no output |
| `git show --check HEAD` | passed：no whitespace errors |
| `git status --short --untracked-files=all` | clean |
| pollution scans (`status` grep + `git ls-files data prisma/data dist src/webui/dist '*.db' '*.sqlite' '*.sqlite3' 'proof*.json' '*proof*.json' '.env' '*.env'`) | no output；无 DB/dist/node_modules/secrets/proof JSON/env 污染 |

## 剩余风险

1. `freezeV8Blueprint()` 是 service/engine 函数，尚未接入 HTTP Runtime API；后续 R3/R4 若需要对外入口，必须保持 route thin，并继续走 project-scoped service 边界。
2. Frozen blueprint 只是 inert metadata；真正 thaw/phase gate 尚未实现，后续必须明确把 `status='frozen' -> active/thawing` 的状态变化纳入 R2 FSM/service 审计链路。
3. Legacy `FreezerEngine` 仍存在历史 thaw 行为，但本卡用 `status='frozen'` 证明它不会消费新 frozen blueprint。

## 下一阶段输入

- 后续 thaw phase 必须以 `parseV8Blueprint()` 解析后的 frozen schema 为输入。
- thaw/phase gate 必须通过 V8 Runtime API/service/FSM Controller 创建或迁移 task 状态，不得直接污染 active tasks。
- 可复用 focused gate：`npm test -- --runInBand tests/v8/v8_blueprint_freezer.test.ts`。
