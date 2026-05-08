# Long Proof — V8-R3-T1 Blueprint JSON Schema

任务：`nexus-v8-r3-t1-blueprint-json-schema`
范围：仅执行 R3 Blueprint frozen JSON schema 与 contract tests；未进入 R3 后续 Freezer thaw / Phase Gate / Daemon / Review / Report / Cron / WebUI 行为实现，未触碰生产 DB 或 ignored SQLite。

## 前置阅读

- `docs/v8/README.md`
- `docs/v8/long-proof-r0-clean-rebuild-baseline.md`
- `docs/v8/long-proof-r1-prisma-schema.md`
- `docs/v8/long-proof-r1-migration-test-db.md`
- `docs/v8/long-proof-r1-repositories.md`
- `docs/v8/long-proof-r1-legacy-dal-boundary.md`
- `docs/v8/prisma-schema-boundary.md`
- `docs/v8/legacy-dal-boundary.md`
- `docs/v8/long-proof-r2-fsm-state-matrix.md`
- `docs/v8/long-proof-r2-transition-task-service.md`
- `docs/v8/long-proof-r2-forbid-direct-completed.md`
- `docs/v8/long-proof-r2-api-routes-controller-boundary.md`
- `docs/v8/long-proof-r2-api-contract-tests.md`

## 修改文件

- `src/blueprints/v8_blueprint_schema.ts` — 新增 V8 Blueprint frozen JSON schema、TypeScript contract types、`validateV8Blueprint()` 与 `parseV8Blueprint()`；只做 schema/semantic validation，不做 DB/API/thaw 写入。
- `tests/v8/v8_blueprint_schema.test.ts` — 新增 contract tests：draft-07 schema shape、canonical blueprint 通过、runtime/out-of-scope 字段拒绝、`acceptance_mode` 枚举、phase/group/task 唯一性、`depends_on` 引用校验、Ajv compatibility、source denylist。
- `docs/v8/README.md` — 补充 R3 Blueprint schema 入口与边界。
- `docs/v8/long-proof-r3-blueprint-json-schema.md` — 本 proof 文件。

## Frozen Blueprint JSON Contract

顶层只允许：

```json
{
  "version": "v8-r3",
  "blueprint_id": "bp-nexus-v8-r3-contract",
  "name": "Nexus V8 R3 contract blueprint",
  "description": "optional",
  "phases": [
    {
      "phase_id": "r3-p1",
      "name": "R3 Phase 1",
      "group_id": "nexus-v8-r3-p1",
      "description": "optional",
      "priority": 10,
      "tasks": [
        {
          "task_id": "nexus-v8-r3-p1-t1",
          "title": "Task title",
          "objective": "Task objective",
          "lane_required": "DEV",
          "acceptance_mode": "pm_audit",
          "acceptance_criteria": ["AC1"],
          "reviewer": "shun-designer-1",
          "depends_on": ["other-task-id"],
          "payload": {},
          "payload_schema": {},
          "ext_meta": {},
          "max_retries": 3
        }
      ]
    }
  ]
}
```

明确禁止进入 blueprint 的 runtime 字段：`project_id`、`status`、`run_id`、`proof_data` 等。后续 thaw/phase gate 必须把 blueprint 输入先通过 `parseV8Blueprint()`，再由 R2 Runtime API/service/FSM Controller 进行状态流转。

## TDD 记录

| 阶段 | 命令 | 结果 |
|---|---|---|
| RED | `npm test -- --runInBand tests/v8/v8_blueprint_schema.test.ts` | 预期失败：`Cannot find module '../../src/blueprints/v8_blueprint_schema'`。 |
| GREEN | `npm test -- --runInBand tests/v8/v8_blueprint_schema.test.ts` | passed：1 suite / 4 tests。 |

## 验证命令与结果

| 命令 | 结果 |
|---|---:|
| `npm test -- --runInBand tests/v8/v8_blueprint_schema.test.ts` | passed：1 suite / 4 tests |
| `npm test -- --runInBand tests/v8` | passed：9 suites / 32 tests |
| `npm run build` | passed |
| `npx prisma validate` | passed |
| `npm test -- --runInBand` | passed：30 suites / 212 tests |
| `git show --check HEAD` | passed / no whitespace errors |
| `git diff --check HEAD^..HEAD` | passed / no output |
| `grep -R "better-sqlite3\\|sqlite3\\|data/nexus.db\\|prisma/data/nexus.db\\|\\$queryRaw\\|\\$executeRaw\\|\\.create(\\|\\.update(" src/blueprints/v8_blueprint_schema.ts \|\| true` | no output；schema module 未引入 direct DB / SQL / Prisma write |
| `git status --short --untracked-files=all` | clean |
| status/track pollution scans for DB/dist/node_modules/secrets/proof JSON/.env | no output |

## Commit

- 本地提交：`feat(v8-r3): freeze blueprint json schema`。
- 最终 SHA 以 `git rev-parse HEAD` 为准。

## 下一阶段输入

1. R3-T2 Freezer/thaw 只能消费 `parseV8Blueprint()` 的输出；不得绕过 schema validation。
2. Thaw 写 task/group 时必须通过 V8 Repository / Runtime API，并继续按 `project_id` 分区。
3. Phase Gate/Daemon 不得把 blueprint schema 中禁止的 runtime 字段作为输入来源；状态变化继续走 R2 `transitionTask()` / FSM Controller。
