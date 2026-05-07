# Long Proof — V8-R0 Clean Rebuild Baseline

任务：`nexus-v8-r0-clean-rebuild-baseline`  
范围：仅执行 R0（冻结旧线、测试/Jest/git hygiene、V8 smoke skeleton）；未进入 R1-R9 Runtime API / Prisma Repository / Daemon / Review / Report / Cron / WebUI 重构。

## 修改文件

### 配置与仓库边界
- `.gitignore` — 忽略 `dist/`、`node_modules/`、DB、proof JSON、logs、secrets、临时目录、SQLite sidecar、生成物。
- `jest.config.js` — 限定 TS 测试源；排除 `dist/`、`node_modules/`、`tests/legacy/`、webui/gateway 生成目录。
- `tsconfig.json` — 排除 `dist` 与 `tests/legacy`。

### legacy 隔离与分类
- `tests/prisma_dal.test.ts` → `tests/legacy/v75-schema-drift/prisma_dal.test.ts`
- `__tests__/daemon/daemon.test.ts` → `tests/legacy/daemon-api-contract/daemon.test.ts`
- `docs/v8/legacy-test-classification.md` — keep / legacy / rewrite 清单与隔离理由。

### V8 smoke skeleton
- `docs/v8/README.md`
- `docs/v8/contracts/runtime-control-plane.contract.json`
- `docs/v8/schema/v8_smoke_schema.sql`
- `tests/v8/v8_smoke.test.ts`

### keep 测试 DB 边界
- `tests/dynamic_review.test.ts` — 删除 ignored 本地 DB/生产 DB 复制逻辑；每次在 `os.tmpdir()` 创建临时 DB，并通过 checked-in Prisma schema 初始化。
- `tests/fsm_controllers.test.ts` — 删除 ignored 本地 DB/生产 DB 复制逻辑；每次在 `os.tmpdir()` 创建临时 DB，并通过 checked-in Prisma schema 初始化。
- `tests/freezer.test.ts` — 删除 fixture 优先复制逻辑；每次在 `os.tmpdir()` 创建临时 DB，并通过 checked-in Prisma schema 初始化。

### 测试稳定性
- `tests/sse.test.ts` — SSE 测试改为原生 HTTP server/client，显式关闭连接，避免 open handle。
- `tests/sse_realtime.test.ts` — `afterAll` 中 `await prismaDal.close()`。

### 污染清理
- 删除两个历史已跟踪 malformed proof JSON 路径：
  - `"submit_proof.json\\n{\\n"`
  - `"test_proof_t61_final.json\\n{\\n"`

## 测试命令与结果

| 命令 | 结果 | Proof |
|---|---:|---|
| `npm test -- --runInBand tests/v8/v8_smoke.test.ts`（RED） | 预期失败：缺 contract/schema 文件 | `/tmp/nexus-r0-v8-smoke-red.txt` |
| `npm test -- --runInBand tests/v8/v8_smoke.test.ts`（GREEN） | 2 passed | `/tmp/nexus-r0-v8-smoke-green.txt`、`/tmp/nexus-r0-v8-smoke-green-current.txt` |
| `./node_modules/.bin/jest --listTests --runInBand` | 22 tests；无 `/dist/`、`/node_modules/`、`/tests/legacy/` | `/tmp/nexus-r0-list-final.txt` |
| `npm run build` | passed / exit 0 | `/tmp/nexus-r0-build-final.txt` |
| `npm test -- --runInBand` | 22 suites / 181 tests passed | `/tmp/nexus-r0-test-final.txt` |
| `git diff --check` | passed / no output | `/tmp/nexus-r0-diff-check-final.txt` |
| keep 测试本地/生产 DB 依赖搜索 | 三个 keep 测试及 Long proof 无旧本地 fixture/DB 复制依赖误述 | `/tmp/nexus-r0-prod-db-fallback-check-current.txt` |
| `git status --short --untracked-files=all` + tracked pollution grep | 无 DB/dist/node_modules/secrets 新污染；历史 malformed proof 为删除清理项 | `/tmp/nexus-r0-git-status-final.txt` |

## 结果

- Jest 默认基线不再误跑 `dist/tests`、`dist/**`、`node_modules/**`、`tests/legacy/**`。
- `.gitignore` 已覆盖 DB、dist、node_modules、proof JSON、logs、secrets、临时产物。
- 现有测试已分类为 keep / legacy / rewrite；legacy 隔离有明确原因且未删除有效源代码伪造通过。
- V8 smoke skeleton 已建立，且测试 DB 从 checked-in schema 创建到临时目录，不复制生产 DB。
- 默认 keep 测试中的本地/生产 DB 复制依赖已移除；`tests/dynamic_review.test.ts`、`tests/fsm_controllers.test.ts`、`tests/freezer.test.ts` 均从 checked-in Prisma schema 初始化临时 DB。
- build/test 全量通过。

## 剩余风险

1. `tests/legacy/**` 是迁移参考，不参与默认 Jest；后续若单独运行 legacy 测试，可能需要修正相对 import 路径。
2. 旧 Runtime API / Prisma DAL / daemon 主线仍存在历史直接 DB/状态机漂移问题；本任务按 R0 边界没有改业务主线。
3. `npm run build` 会生成 `dist/`，但已被忽略，且 Jest list 已验证不会执行 `dist/tests`。
4. 当前工作区未 commit、未 push；需要 PM/reviewer 审核后决定是否提交。

## R1 输入建议

1. 将 `docs/v8/contracts/runtime-control-plane.contract.json` 升级为 R1 schema/repository contract 输入。
2. 从正式 Prisma schema/migration 初始化测试 DB；禁止复制 `data/nexus.db` 或 `prisma/data/nexus.db`。
3. 重写 `tests/legacy/v75-schema-drift/prisma_dal.test.ts`：覆盖空库 migration、project_id 分区、`task_group_id`、artifact/report/run schema 一致性。
4. 保持 `tests/legacy/` 默认不跑，直到对应 R 阶段重写完成。
5. R1 不应继续扩展 legacy DAL；应建立单一 Prisma Repository/Runtime API 边界。
