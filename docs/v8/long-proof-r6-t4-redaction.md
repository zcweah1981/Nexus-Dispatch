# Long Proof — V8-R6-T4 敏感信息脱敏

任务：`nexus-v8-r6-t4-redaction`

范围：仅实现 V8 report/completion_reports 队列中的用户可见消息脱敏，防止 token、Authorization、chat_id 等敏感信息进入 Telegram 群组正文；不进入真实 Telegram delivery、PM final decision、WebUI、生产/ignored SQLite 迁移。

## 前置阅读

已阅读并按边界执行：

- `docs/v8/README.md` — V8 clean rebuild baseline 与 R1+ 主线边界。
- `docs/v8/long-proof-r6-t2-visible-message-formatter.md` — R6 可见消息格式化基准。
- 治理红线：不暴露 token/chat_id/Authorization/raw JSON/secrets。

## 修改文件

本卡新增/修改：

- `src/reports/v8_visible_message_formatter.ts`
  - 增加 `SENSITIVE_LABEL_VALUE_RE`：匹配 `token/secret/chat_id/bot_token` 等标签后的值。
  - 增加 `BEARER_VALUE_RE`：匹配 `Bearer` 凭证。
  - 增加 `COMMON_SECRET_VALUE_RE`：匹配常用密钥格式（sk-..., ghp_..., xoxb-..., telegram bot token, -100... chat_id）。
  - 在 `sanitizeVisibleText` 中接入 `[redacted]` 替换逻辑。
- `tests/v8/v8_visible_message_formatter.test.ts`
  - 增加 fail-first contract：验证 `agent_result` 中的敏感标签、Bearer 凭证、以及多种 Secret 格式被正确脱敏。
  - 增加 Runtime API service contract：验证通过 `createReport` 创建的报告其 `summary` 已脱敏，而 `payload_json` 完整保留原始信息。
- `docs/v8/long-proof-r6-t4-redaction.md`
  - 本 proof 文件。

## TDD 记录

| 阶段 | 命令 | 结果 |
|---|---|---|
| RED | `npm test -- --runInBand tests/v8/v8_visible_message_formatter.test.ts --testNamePattern "redacts sensitive"` | failed：接收到原始敏感字符串，未包含 `[redacted]`。 |
| GREEN | 同上 | passed：2 tests。敏感信息成功替换为 `[redacted]`。 |
| V8 suite | `npm test -- --runInBand tests/v8` | passed：14 suites / 70 tests。 |

## 验证命令与结果

完整验证日志：`/tmp/nexus-v8-r6-t4-redaction-verify.log`

- 行数/SHA：`128 /tmp/nexus-v8-r6-t4-redaction-verify.log`；`7c72f7c234a954e3f3b97b0a8830114f4e6628992001b6ba2c027936315d2`。
- Summary：`/tmp/nexus-v8-r6-t4-redaction-summary.md`。

| 命令 | 结果 |
|---|---|
| `npx prisma validate` | passed：schema valid。 |
| `npm test -- --runInBand tests/v8/v8_visible_message_formatter.test.ts` | passed：6 tests。 |
| `npm test -- --runInBand tests/v8` | passed：14 suites / 70 tests。 |
| `npm run build` | passed：`tsc` exit 0。 |
| `git diff --check` | passed：no whitespace error。 |
| production TS source boundary scan | passed：未命中 legacy DAL / direct SQLite / ignored DB / raw Prisma SQL。 |
| pollution status scan | passed：`pollution_status_hits=[]`。 |

## 已实现内容

1. 核心脱敏正则：支持多种敏感信息模式识别，包括显式标签（token/secret 等）、认证头（Bearer/Authorization）以及特定长度/前缀的密钥串（sk/ghp/xoxb/bot_token/chat_id）。
2. 可见性隔离：脱敏仅作用于 `Report.summary` 字段，即用于 Telegram 发送的文本。
3. 审计保留：`Report.payload_json` 继续以原始格式存储完整 trace，确保系统内部审计和 subagent 处理不受脱敏影响。
4. FSM 兼容：脱敏逻辑作为可见性格式化的一部分，在 `ReportRepository.create` 阶段完成，不改变 report 的生命周期或任务状态。

## 剩余风险

1. 正则黑名单模式无法穷举所有可能的敏感格式；建议上游 Agent 尽量避免在 summary 中直接输出原始凭证。
2. 某些非敏感的 6 位以上数字串或带 `-100` 前缀的普通文本可能触发误杀，但作为安全加固项，误杀优于泄露。

## 下一阶段输入

- 后续 Telegram delivery worker 必须直接发送 `Report.summary`。
- 后续如果要增加白名单脱敏（允许特定 project_id 格式等），需在 `v8_visible_message_formatter.ts` 中扩展。
