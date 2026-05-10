# 双系统 Agent 接入教程：Hermes + OpenClaw

[English](./dual-agent.md) · [简体中文](./dual-agent.zh-CN.md) · [繁體中文](./dual-agent.zh-TW.md)

---

## 概述

本教程介绍如何在同一个 Nexus Dispatch 实例上同时运行 **Hermes 和 OpenClaw Worker**。PM Daemon 根据每个 Agent 的**泳道 (lane)** 和**方言 (dialect)** 将任务路由到正确的 Worker——编码任务走 OpenClaw，内容任务走 Hermes——统一在一个控制平面下管理。

**适合谁：** 使用多种 Agent 类型、希望有统一派单/追踪/验收系统的团队。

![双系统架构](../assets/guide/dual-system-architecture.png)

---

## 前置条件

开始之前，请确保：

| 要求 | 验证方式 |
| --- | --- |
| Nexus Dispatch API Server 已运行 | `curl -I http://localhost:8000/api/v1/events/stream` |
| 环境变量 `API_AUTH_TOKEN` 已设置 | `echo $API_AUTH_TOKEN`（不能为空） |
| Hermes Agent 已安装且 gateway 已配置 | `hermes --version` 和 `hermes gateway status` |
| OpenClaw 已安装且端点可达 | `curl -I http://your-openclaw-host:8647/v1/runs` |
| PM Daemon 已运行 | `docker compose ps nexus-daemon` 或 `systemctl status nexus-dispatch-daemon` |
| Nexus 中已创建项目 | 参见 [安装与部署指南](../install.zh-CN.md) §3.4 |

---

## 路由原理

Nexus Dispatch 使用两个维度来将任务发送到正确的 Agent：

| 维度 | 作用 | 示例 |
| --- | --- | --- |
| **Lane（泳道）** | 标识工作类型。任务和 Agent 必须属于同一泳道才能匹配。 | `DEV`、`CONTENT`、`DESIGN` |
| **Dialect（方言）** | 决定派发时的传输格式。Daemon 根据方言选择正确的适配器。 | `hermes` → HermesMCPAdapter，`openclaw` → OpenClawAdapter |

```
PM Daemon (tick 循环)
  │
  │ 1. 获取待处理任务
  │ 2. 对每个任务，查找 lane 匹配的在线 Agent
  │ 3. 选择 Agent（优先级 + 并发控制）
  │ 4. 查询 agent.dialect → 选择适配器
  │
  ├─ dialect: "hermes" ──→ HermesMCPAdapter ──→ POST 到 Hermes 端点
  │                                              (MCP intent 格式)
  │
  └─ dialect: "openclaw" ─→ OpenClawAdapter ──→ POST 到 OpenClaw 端点
                                               (OpenAI messages 格式)
```

**结果：** 一个 Nexus 实例可以同时将编码任务派发到 OpenClaw、内容任务派发到 Hermes。每个 Agent 以自己的原生格式处理任务。

---

## 第 1 步：注册两个 Agent

分别注册一个 Hermes Worker（内容任务）和一个 OpenClaw Worker（编码任务）：

### 1a. 注册 Hermes Worker（CONTENT 泳道）

```bash
curl -sS -X POST \
  "http://localhost:${NEXUS_API_PORT:-8000}/api/v1/runtime/projects/${NEXUS_PROJECT_ID:-nexus-dispatch}/agents" \
  -H "Authorization: Bearer ${API_AUTH_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{
    "agent_id": "hermes-content-1",
    "endpoint": "http://your-hermes-host:8080/intent",
    "lane": "CONTENT",
    "dialect": "hermes",
    "soul_prompt": "You are a content production agent. Write high-quality copy and submit proof.",
    "tools_allowed": ["web", "browser", "file", "terminal"],
    "max_concurrency": 1,
    "status": "online"
  }'
```

### 1b. 注册 OpenClaw Worker（DEV 泳道）

```bash
curl -sS -X POST \
  "http://localhost:${NEXUS_API_PORT:-8000}/api/v1/runtime/projects/${NEXUS_PROJECT_ID:-nexus-dispatch}/agents" \
  -H "Authorization: Bearer ${API_AUTH_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{
    "agent_id": "long-coder-1",
    "endpoint": "http://your-openclaw-host:8647/v1/runs",
    "lane": "DEV",
    "dialect": "openclaw",
    "soul_prompt": "You are a coding agent. Execute tasks precisely, write clean code, and submit proof of completion.",
    "tools_allowed": ["terminal", "file", "web"],
    "max_concurrency": 1,
    "status": "online"
  }'
```

> ⚠️ **OpenClaw 版本说明：** 默认端口 `8647` 和路径 `/v1/runs` 基于 Nexus Dispatch 参考配置。请以实际版本为准，通过命令验证你安装的 OpenClaw 版本。

---

## 第 2 步：验证两个 Agent 均已注册

```bash
curl -sS \
  "http://localhost:${NEXUS_API_PORT:-8000}/api/v1/runtime/projects/${NEXUS_PROJECT_ID:-nexus-dispatch}/agents" \
  -H "Authorization: Bearer ${API_AUTH_TOKEN}"
```

**预期响应**应显示两个 Agent：

```json
{
  "agents": [
    {
      "id": "hermes-content-1",
      "lane": "CONTENT",
      "dialect": "hermes",
      "status": "online",
      "endpoint": "http://your-hermes-host:8080/intent"
    },
    {
      "id": "long-coder-1",
      "lane": "DEV",
      "dialect": "openclaw",
      "status": "online",
      "endpoint": "http://your-openclaw-host:8647/v1/runs"
    }
  ]
}
```

确认两个 Agent 都显示 `"status": "online"` 且 `dialect` 值正确。

---

## 第 3 步：为每个泳道创建任务

### 3a. 内容任务 → 路由到 Hermes

```bash
curl -sS -X POST \
  "http://localhost:${NEXUS_API_PORT:-8000}/api/v1/runtime/tasks" \
  -H "Authorization: Bearer ${API_AUTH_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{
    "project_id": "nexus-dispatch",
    "id": "content-task-001",
    "title": "Write Landing Page Copy",
    "objective": "Produce trilingual landing page copy for the new feature release.",
    "lane_required": "CONTENT",
    "acceptance_mode": "group_only",
    "acceptance_criteria": [
      "Three language versions delivered",
      "Each version is under 200 words",
      "CTA is clear and actionable"
    ]
  }'
```

### 3b. 编码任务 → 路由到 OpenClaw

```bash
curl -sS -X POST \
  "http://localhost:${NEXUS_API_PORT:-8000}/api/v1/runtime/tasks" \
  -H "Authorization: Bearer ${API_AUTH_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{
    "project_id": "nexus-dispatch",
    "id": "dev-task-001",
    "title": "Fix Authentication Bug",
    "objective": "The login endpoint returns 500 on empty password. Fix and add test coverage.",
    "lane_required": "DEV",
    "acceptance_mode": "group_only",
    "acceptance_criteria": [
      "Login endpoint returns 400 on empty password",
      "Unit test added for edge case",
      "No regression in existing auth tests"
    ]
  }'
```

---

## 第 4 步：验证路由

PM Daemon 运行时会自动：
1. 获取两个待处理任务
2. 匹配 `content-task-001`（lane: CONTENT）→ `hermes-content-1`（dialect: hermes）
3. 匹配 `dev-task-001`（lane: DEV）→ `long-coder-1`（dialect: openclaw）
4. 使用正确的适配器分别派发

检查任务状态：

```bash
# 检查内容任务
curl -sS \
  "http://localhost:${NEXUS_API_PORT:-8000}/api/v1/runtime/tasks/content-task-001?project_id=nexus-dispatch" \
  -H "Authorization: Bearer ${API_AUTH_TOKEN}"

# 检查编码任务
curl -sS \
  "http://localhost:${NEXUS_API_PORT:-8000}/api/v1/runtime/tasks/dev-task-001?project_id=nexus-dispatch" \
  -H "Authorization: Bearer ${API_AUTH_TOKEN}"
```

两个任务都应沿状态机推进：`created` → `dispatched` → `in_progress` → `completed`。

### 手动驱动生命周期（Daemon 未运行时）

```bash
# 内容任务
for event in dispatch start submit_completion request_review review_pass; do
  curl -sS -X POST \
    "http://localhost:${NEXUS_API_PORT:-8000}/api/v1/runtime/tasks/transition" \
    -H "Authorization: Bearer ${API_AUTH_TOKEN}" \
    -H "Content-Type: application/json" \
    -d "{
      \"project_id\": \"nexus-dispatch\",
      \"task_id\": \"content-task-001\",
      \"event\": \"${event}\",
      \"proof\": { \"source\": \"hermes-content-1\", \"type\": \"dual-agent-test\" }
    }"
done

# 编码任务
for event in dispatch start submit_completion request_review review_pass; do
  curl -sS -X POST \
    "http://localhost:${NEXUS_API_PORT:-8000}/api/v1/runtime/tasks/transition" \
    -H "Authorization: Bearer ${API_AUTH_TOKEN}" \
    -H "Content-Type: application/json" \
    -d "{
      \"project_id\": \"nexus-dispatch\",
      \"task_id\": \"dev-task-001\",
      \"event\": \"${event}\",
      \"proof\": { \"source\": \"long-coder-1\", \"type\": \"dual-agent-test\" }
    }"
done
```

---

## 第 5 步：验证完成

```bash
curl -sS \
  "http://localhost:${NEXUS_API_PORT:-8000}/api/v1/runtime/tasks/content-task-001?project_id=nexus-dispatch" \
  -H "Authorization: Bearer ${API_AUTH_TOKEN}" | python3 -c "import sys,json; print(json.load(sys.stdin).get('status'))"

curl -sS \
  "http://localhost:${NEXUS_API_PORT:-8000}/api/v1/runtime/tasks/dev-task-001?project_id=nexus-dispatch" \
  -H "Authorization: Bearer ${API_AUTH_TOKEN}" | python3 -c "import sys,json; print(json.load(sys.stdin).get('status'))"
```

**预期：** 两个都应返回 `"completed"`。

---

## Telegram 通知配置

每个 Agent 必须配置**自己的** Telegram bot。Daemon 严禁代发。

```bash
AGENT_NOTIFICATIONS='{
  "hermes-content-1": {
    "bot_token": "${HERMES_CONTENT_BOT_TOKEN}",
    "chat_id": "${NEXUS_GROUP_CHAT_ID}"
  },
  "long-coder-1": {
    "bot_token": "${LONG_CODER_BOT_TOKEN}",
    "chat_id": "${NEXUS_GROUP_CHAT_ID}"
  }
}'
```

**规则：**
- 每个 agent_id 对应自己的 bot_token。严禁在 Agent 之间共享 bot token。
- 两个 Agent 可以发到同一个群组（相同 `chat_id`），也可以发到不同群组。
- 群组中的可见消息必须人类可读——不得包含原始 JSON、任务 ID 或 Token。
- 完整的追踪数据保存在数据库和 Runtime proof 中。

---

## 并发与调度

| 场景 | 行为 |
| --- | --- |
| 两个任务，不同泳道 | 同时派发到不同 Agent。 |
| 两个任务，同一泳道，Agent `max_concurrency: 1` | 顺序处理。 |
| 两个任务，同一泳道，Agent `max_concurrency: 2` | 同一 Agent 并行处理。 |
| 没有 Agent 匹配任务的泳道 | 任务保持 `pending`，直到匹配的 Agent 上线。 |

---

## 排错指南

| 症状 | 检查命令 | 常见原因 / 解决方案 |
| --- | --- | --- |
| 任务卡在 `pending` | `curl -sS .../agents` — 确认至少有一个 Agent 匹配任务的泳道 | 没有在线 Agent 匹配该泳道，或所有匹配 Agent 已达最大并发。 |
| 错误的 Agent 接了任务 | 检查任务的 `lane_required` 与 Agent 的 `lane` 字段 | 泳道不匹配——确保任务泳道与目标 Agent 的泳道一致。 |
| 一个 Agent 收到所有任务 | 检查注册 Agent 的 `lane` 值 | 多个 Agent 注册了同一泳道。用不同泳道路由。 |
| Hermes 任务以 OpenAI 格式发送 | 检查 Agent 注册时的 `dialect` 字段 | Agent 注册了错误的 `dialect`。Hermes 必须用 `"hermes"`，OpenClaw 必须用 `"openclaw"`。 |
| OpenClaw 任务以 MCP 格式发送 | 同上 | 同上——确认 `dialect` 字段与 Agent 类型一致。 |
| API 调用返回 401 | 确认 `Authorization: Bearer` 请求头 | Token 缺失或不匹配。 |
| Daemon 未派发 | `docker compose logs nexus-daemon --since=10m` | 无待处理任务、所有 Agent 离线、或 Daemon 未运行。 |
| 某个 Agent 无 Telegram 通知 | 检查 `AGENT_NOTIFICATIONS` 中该 `agent_id` 的配置 | 该 Agent 的 bot 配置缺失或配置错误。 |

---

## 下一步

- [Hermes Agent 接入教程](./hermes-agent.zh-CN.md) — 详细的 Hermes 配置
- [OpenClaw Agent 接入教程](./openclaw-agent.zh-CN.md) — 详细的 OpenClaw 配置
- [安装与部署指南](../install.zh-CN.md) — 完整部署参考
