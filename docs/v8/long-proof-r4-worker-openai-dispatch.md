# Long Proof — V8-R4-T3 Worker OpenAI-compatible Dispatch

任务：`nexus-v8-r4-t3-worker-run-dispatch`
范围：仅在 R4 daemon dispatch step 内接入注册 Agent endpoint 的 OpenAI-compatible worker 调用，并记录 run/dispatch proof；不进入 resident cron/systemd、真实 Telegram 可见投递、worker completion polling 协议扩展、review verdict 终局处理、WebUI 或生产/ignored SQLite 迁移。

## 前置阅读
- `docs/v8/README.md`
- `docs/v8/legacy-test-classification.md`
- `docs/v8/legacy-dal-boundary.md`
- `docs/v8/prisma-schema-boundary.md`
- `docs/v8/long-proof-r0-clean-rebuild-baseline.md`
- `docs/v8/long-proof-r2-api-contract-tests.md`
- `docs/v8/long-proof-r3-thaw-current-phase.md`
- `docs/v8/long-proof-r4-daemon-tick-loop.md`
- `docs/v8/long-proof-r4-stale-takeover-lease.md`

## 修改文件
- `src/daemon/v8_tick_loop.ts` — 新增可注入 `workerFetch` 与默认 `OpenAICompatibleWorkerClient`；dispatch step 使用已注册 `Agent.endpoint` POST OpenAI-compatible `/v1/chat/completions` 风格 payload；成功后写入 `Run.worker_run_id`，并记录 `agent_dispatch` report 与 `worker_dispatch_proof` artifact。
- `tests/v8/v8_daemon_tick_loop.test.ts` — 增补 fail-first contracts：验证默认 worker client 调用注册 endpoint、payload 带 `model/metadata/messages`、run 保存 worker_run_id、dispatch report/artifact 落库；既有五步测试也验证 dispatch proof。
- `docs/v8/long-proof-r4-worker-openai-dispatch.md` — 本 proof 文件。

## TDD 记录
| 阶段 | 命令 | 结果 |
|---|---|---|
| RED-1 dispatch proof | `npm test -- --runInBand tests/v8/v8_daemon_tick_loop.test.ts` | 预期失败：`No Report found`，证明既有 dispatch step 未记录 `agent_dispatch` / `worker_dispatch_proof`。 |
| GREEN-1 dispatch proof | `npm test -- --runInBand tests/v8/v8_daemon_tick_loop.test.ts` | passed：6 tests。 |
| RED-2 OpenAI-compatible client | `npm test -- --runInBand tests/v8/v8_daemon_tick_loop.test.ts` | 预期失败：`workerFetch` 不存在于 `V8DaemonTickLoopOptions`。 |
| GREEN-2 OpenAI-compatible client | `npm test -- --runInBand tests/v8/v8_daemon_tick_loop.test.ts` | passed：7 tests。 |

## 已实现内容
1. `V8DaemonTickLoopOptions.workerFetch` 作为 R4-T3 默认 worker HTTP 适配注入点；未引入真实网络测试依赖。
2. 默认 `OpenAICompatibleWorkerClient` 使用注册表中的 `agent.endpoint` 作为唯一派发 URL，body 包含：
   - `model: payload.agent.dialect`
   - `messages[0]` system 执行约束
   - `messages[1]` JSON dispatch payload（含 project/task/run/lease/agent）
   - `metadata.project_id/task_id/run_id/agent_id/lease_token`
3. Worker endpoint 返回 `{ id }` 或 `{ worker_run_id }` 时，daemon 将其写入当前 project-scoped `Run.worker_run_id`。
4. 每次成功 dispatch 后写入：
   - `Report(message_type='agent_dispatch', status='sent', run_id=...)`，payload 记录 endpoint/agent/run/lease/worker_run_id。
   - `Artifact(artifact_type='worker_dispatch_proof', run_id=...)`，payload_data/proof/metadata_json 记录结构化 dispatch proof。
5. 所有新增 DB 写入均携带 `project_id`，状态迁移仍通过 `transitionTask()` / `V8RuntimeApiService`，未使用 legacy DAL、ignored SQLite 或 raw SQL。

## 验证命令与结果
| 命令 | 结果 |
|---|---|
| `npm test -- --runInBand tests/v8/v8_daemon_tick_loop.test.ts` | passed：1 suite / 7 tests |
| `npm test -- --runInBand tests/v8` | passed：12 suites / 49 tests |
| `npm run build` | passed：`tsc` exit 0 |
| `npx prisma validate` | passed：schema valid |
| `git diff --check` | passed：no whitespace errors |
| source denylist grep on `src/daemon/v8_tick_loop.ts` / focused test | 仅命中测试中的 denylist regex 字符串；生产 daemon 无 legacy DAL/ignored DB/raw SQL。 |
| pollution/status scan | no output：未产生 DB/dist/node_modules/secrets/proof JSON/.env 污染。 |
| tracked pollution scan | no output：未跟踪 DB/dist/proof JSON/.env 污染文件。 |

## 剩余风险
1. 默认 OpenAI-compatible dispatch 只覆盖发送与 worker_run_id 捕获；worker completion 仍沿用既有 `drainResults(project_id)` 注入协议，真实轮询/回调协议需后续卡定义。
2. `agent.dialect` 暂作为 OpenAI-compatible `model` 字段；后续如需独立 model/provider 配置，应扩展 Agent schema 或 tools_allowed/ext config。
3. Telegram 可见消息仍不在本卡范围；本卡的 dispatch proof 只进入 runtime DB/report/artifact。

## 下一阶段输入
- 后续 worker integration 可复用 `workerFetch` 注入点，替换为真实 `fetch`/HTTP client。
- Worker 必须回传 `lease_token` 与 `worker_run_id`，completion ingest 才能通过 R4-T2 lease 校验。
- Reviewer 可重点审核 `src/daemon/v8_tick_loop.ts` 的 endpoint dispatch payload、project-scoped proof 写入，以及 `tests/v8/v8_daemon_tick_loop.test.ts` 的新增 OpenAI-compatible contract。
