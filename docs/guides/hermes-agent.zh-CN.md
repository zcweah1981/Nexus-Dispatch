# Hermes Agent 接入教程

[English](./hermes-agent.md) · [简体中文](./hermes-agent.zh-CN.md) · [繁體中文](./hermes-agent.zh-TW.md)

---

## 概述

本教程介绍如何将一个 **Hermes Agent** 作为 Worker 接入 Nexus Dispatch 控制平面。接入完成后，PM Daemon 会自动将任务派发到你的 Hermes 实例，Hermes 执行任务并通过 Runtime API 提交验收凭证。

**适合谁：** 正在运行 Hermes Agent、希望它自动接收并执行 Nexus Dispatch 派发任务的开发者和运维人员。

![Hermes 集成](../assets/guide/hermes-integration.png)

---

## 前置条件

开始之前，请确保：

| 要求 | 验证方式 |
| --- | --- |
| Nexus Dispatch API Server 已运行 | `curl -I http://localhost:8000/api/v1/events/stream` |
| 环境变量 `API_AUTH_TOKEN` 已设置 | `echo $API_AUTH_TOKEN`（不能为空） |
| Hermes Agent 已安装 | `hermes --version` |
| Hermes gateway 已配置（用于 Telegram 通知） | `hermes gateway status` |
| Nexus 中已创建项目 | 参见 [安装与部署指南](../install.zh-CN.md) §3.4 |

---

## 架构说明

当 Daemon 向 Hermes 类型 Worker 派发任务时：

```
PM Daemon
  │
  │ 选取任务 + 匹配 Agent (dialect: "hermes")
  │
  ▼
HermesMCPAdapter.adapt()
  │
  │ 将任务转换为 MCP intent 载荷：
  │ {
  │   "mcp_intent": "execute_task",
  │   "task_id": "...",
  │   "parameters": { "title": "...", "description": "..." },
  │   "expected_artifact": "mcp_tool_call"
  │ }
  │
  ▼
POST → Hermes Worker 端点
  │
  │ Hermes 接收 intent，执行任务，
  │ 通过 Runtime API 提交验收凭证
  │
  ▼
POST /api/v1/runtime/reports  (凭证 + 交付物)
POST /api/v1/runtime/tasks/transition  (状态变更)
```

**关键点：** Hermes Worker 接收的是 MCP 风格的 intent 载荷，不是原始 OpenAI messages 格式。你的 Hermes 端点必须能理解 `{ mcp_intent, task_id, parameters }` 格式。

---

## 第 1 步：注册 Hermes Agent

将你的 Hermes 实例注册为 Nexus Dispatch 的 Worker：

```bash
curl -sS -X POST \
  "http://localhost:${NEXUS_API_PORT:-8000}/api/v1/runtime/projects/${NEXUS_PROJECT_ID:-nexus-dispatch}/agents" \
  -H "Authorization: Bearer ${API_AUTH_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{
    "agent_id": "hermes-worker-1",
    "endpoint": "http://your-hermes-host:8080/intent",
    "lane": "CONTENT",
    "dialect": "hermes",
    "soul_prompt": "You are a content production agent. Follow task instructions precisely and submit proof.",
    "tools_allowed": ["web", "browser", "file", "terminal"],
    "max_concurrency": 1,
    "status": "online"
  }'
```

**字段说明：**

| 字段 | 说明 |
| --- | --- |
| `agent_id` | Worker 的唯一标识。建议使用描述性名称，如 `hermes-content-1`。 |
| `endpoint` | 你的 Hermes 实例接收 MCP intent 载荷的 URL。 |
| `lane` | 该 Agent 负责的工作类型：`DEV`、`CONTENT`、`DESIGN` 等。 |
| `dialect` | Hermes 类型 Worker 必须设为 `"hermes"`。 |
| `soul_prompt` | Agent 处理任务时注入的系统级指令。 |
| `tools_allowed` | Agent 被允许使用的工具集。 |
| `max_concurrency` | 最大并行任务数。大多数场景建议设为 `1`。 |
| `status` | 设为 `"online"` 可立即开始接收任务。 |

---

## 第 2 步：验证注册

确认 Agent 已成功注册：

```bash
curl -sS \
  "http://localhost:${NEXUS_API_PORT:-8000}/api/v1/runtime/projects/${NEXUS_PROJECT_ID:-nexus-dispatch}/agents" \
  -H "Authorization: Bearer ${API_AUTH_TOKEN}"
```

**预期响应**应包含你的 Agent：

```json
{
  "agents": [
    {
      "id": "hermes-worker-1",
      "lane": "CONTENT",
      "dialect": "hermes",
      "status": "online",
      "endpoint": "http://your-hermes-host:8080/intent"
    }
  ]
}
```

---

## 第 3 步：创建测试任务

创建一个简单任务来测试集成：

```bash
curl -sS -X POST \
  "http://localhost:${NEXUS_API_PORT:-8000}/api/v1/runtime/tasks" \
  -H "Authorization: Bearer ${API_AUTH_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{
    "project_id": "nexus-dispatch",
    "id": "hermes-test-001",
    "title": "Hermes Integration Test",
    "objective": "Verify that the Hermes worker receives and processes a dispatched task correctly.",
    "lane_required": "CONTENT",
    "acceptance_mode": "group_only",
    "acceptance_criteria": [
      "Task reaches completed through Runtime API transitions",
      "Proof artifact is submitted by the Hermes worker"
    ]
  }'
```

---

## 第 4 步：驱动任务生命周期

如果手动测试（Daemon 未运行），用以下转换驱动生命周期：

```bash
for event in dispatch start submit_completion request_review review_pass; do
  curl -sS -X POST \
    "http://localhost:${NEXUS_API_PORT:-8000}/api/v1/runtime/tasks/transition" \
    -H "Authorization: Bearer ${API_AUTH_TOKEN}" \
    -H "Content-Type: application/json" \
    -d "{
      \"project_id\": \"nexus-dispatch\",
      \"task_id\": \"hermes-test-001\",
      \"event\": \"${event}\",
      \"proof\": { \"source\": \"hermes-worker-1\", \"type\": \"integration-test\" }
    }"
done
```

如果 PM Daemon 正在运行，它会自动处理派发。Hermes Worker 应该：
1. 在其端点接收 MCP intent 载荷
2. 使用配置的工具执行任务
3. 通过 `POST /api/v1/runtime/reports` 提交验收凭证
4. 通过 `POST /api/v1/runtime/tasks/transition` 变更任务状态

---

## 第 5 步：验证任务完成

```bash
curl -sS \
  "http://localhost:${NEXUS_API_PORT:-8000}/api/v1/runtime/tasks/hermes-test-001?project_id=nexus-dispatch" \
  -H "Authorization: Bearer ${API_AUTH_TOKEN}"
```

**预期：** `status` 字段应为 `"completed"`。

---

## Hermes Worker 端点要求

你的 Hermes 实例必须暴露一个 HTTP 端点，满足以下条件：

1. **接受 POST** 请求，JSON body 为 MCP intent 格式：
   ```json
   {
     "mcp_intent": "execute_task",
     "task_id": "some-task-id",
     "parameters": {
       "title": "Task Title",
       "description": "Task description"
     },
     "expected_artifact": "mcp_tool_call"
   }
   ```

2. **返回响应**并包含执行凭证。

3. **向 Nexus Runtime API 提交凭证**：
   ```bash
   curl -sS -X POST \
     "http://localhost:8000/api/v1/runtime/reports" \
     -H "Authorization: Bearer ${API_AUTH_TOKEN}" \
     -H "Content-Type: application/json" \
     -d '{
       "project_id": "nexus-dispatch",
       "task_id": "hermes-test-001",
       "run_id": "run-001",
       "type": "completion",
       "content": { "summary": "Task completed successfully", "files_changed": ["..."] }
     }'
   ```

### 用 Hermes 搭建端点

你可以通过 gateway 模式运行 Hermes，并配置 webhook 来处理接收到的 intent：

```bash
# 启动 Hermes gateway
hermes gateway run

# 或配置特定的 webhook 路由
hermes webhook subscribe nexus-intent
```

也可以用自定义脚本在端点上监听，然后分发给 `hermes chat -q`：

```bash
# 单次执行模式
hermes chat -q "Execute task: {task_title}. Description: {task_description}"
```

---

## Telegram 通知配置

每个 Agent 通过**自己的** Telegram bot 发送通知。在环境变量中配置：

```bash
AGENT_NOTIFICATIONS='{
  "hermes-worker-1": {
    "bot_token": "${HERMES_WORKER_BOT_TOKEN}",
    "chat_id": "${NEXUS_GROUP_CHAT_ID}"
  }
}'
```

**规则：**
- 严禁使用 Daemon bot 或 PM bot 代替 Agent 发送通知。
- 群组中的可见消息必须人类可读——不得包含原始 JSON、任务 ID 或 Token。
- 完整的追踪数据保存在数据库和 Runtime proof 中。

---

## 排错指南

| 症状 | 检查命令 | 常见原因 / 解决方案 |
| --- | --- | --- |
| Agent 未收到任务 | `curl -sS .../agents` — 确认 `status: "online"` 和 `dialect: "hermes"` | Agent 状态为 offline，或 lane 与待处理任务不匹配。 |
| Daemon 未派发 | 检查 Daemon 日志：`docker compose logs nexus-daemon --since=10m` | 无待处理任务、Agent 未上线、lane 不匹配、或 Worker 端点不可达。 |
| Worker 端点返回错误 | `curl -X POST http://your-hermes-host:8080/intent -d '{}'` | Hermes gateway 未运行、端口错误、防火墙阻拦。 |
| API 调用返回 401 | 确认 `Authorization: Bearer` 请求头与 `API_AUTH_TOKEN` 一致 | Token 缺失、不匹配、或未在环境中设置。 |
| 验收凭证未被接受 | 检查任务状态：`GET /api/v1/runtime/tasks/{id}?project_id=...` | 任务可能已处于终态，或状态转换序列错误。 |
| Hermes MCP 报错 | `hermes doctor` 并检查日志 | Hermes 未配置 MCP，或缺少 skill/plugin。 |
| Telegram 无通知 | 确认 `AGENT_NOTIFICATIONS` JSON 和 bot 权限 | 缺少 Agent 的 bot 配置、token/chat_id 错误、bot 缺少群组权限。 |

---

## 下一步

- [OpenClaw Agent 接入教程](./openclaw-agent.zh-CN.md) — 接入 OpenClaw Worker
- [双系统 Agent 接入教程](./dual-agent.zh-CN.md) — 同时运行 Hermes 和 OpenClaw
- [安装与部署指南](../install.zh-CN.md) — 完整部署参考
- [Hermes Agent 官方文档](https://hermes-agent.nousresearch.com/docs/) — Hermes 官方文档
