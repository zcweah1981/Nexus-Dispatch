# OpenClaw Agent 接入教程

[English](./openclaw-agent.md) · [简体中文](./openclaw-agent.zh-CN.md) · [繁體中文](./openclaw-agent.zh-TW.md)

---

## 概述

本教程介绍如何将一个 **OpenClaw Agent** 作为 Worker 接入 Nexus Dispatch 控制平面。接入完成后，PM Daemon 会自动使用 OpenAI 兼容的 messages 格式将任务派发到你的 OpenClaw 实例，Worker 通过 Runtime API 提交验收凭证。

**适合谁：** 正在运行 OpenClaw（或任何 OpenAI 兼容的编码 Agent）、希望它自动接收并执行 Nexus Dispatch 派发任务的开发者和运维人员。

![OpenClaw 集成](../assets/guide/openclaw-integration.png)

---

## 前置条件

开始之前，请确保：

| 要求 | 验证方式 |
| --- | --- |
| Nexus Dispatch API Server 已运行 | `curl -I http://localhost:8000/api/v1/events/stream` |
| 环境变量 `API_AUTH_TOKEN` 已设置 | `echo $API_AUTH_TOKEN`（不能为空） |
| OpenClaw 已安装并配置 | 用你的安装方式验证 |
| OpenClaw Worker 端点可达 | `curl -I http://your-openclaw-host:8647/v1/runs` |
| Nexus 中已创建项目 | 参见 [安装与部署指南](../install.zh-CN.md) §3.4 |

> ⚠️ **版本说明：** OpenClaw 的 CLI 标志、默认端口和端点路径可能因版本而异。请以实际版本为准，通过命令验证。本教程中的端点路径 `/v1/runs` 基于 Nexus Dispatch 默认配置——如果你的 OpenClaw 实例使用不同的路由，请相应调整。

---

## 架构说明

当 Daemon 向 OpenClaw 类型 Worker 派发任务时：

```
PM Daemon
  │
  │ 选取任务 + 匹配 Agent (dialect: "openclaw")
  │
  ▼
OpenClawAdapter.adapt()
  │
  │ 将任务转换为 OpenAI messages 载荷：
  │ {
  │   "messages": [
  │     { "role": "system", "content": "You are an OpenClaw Agent..." },
  │     { "role": "user", "content": "Execute Task: ...\nDescription: ..." }
  │   ],
  │   "tools": [
  │     { "type": "function", "function": { "name": "submit_proof", ... } }
  │   ]
  │ }
  │
  ▼
POST → OpenClaw Worker 端点 (/v1/runs)
  │
  │ OpenClaw 接收 messages，执行任务，
  │ 通过 Runtime API 提交验收凭证
  │
  ▼
POST /api/v1/runtime/reports  (凭证 + 交付物)
POST /api/v1/runtime/tasks/transition  (状态变更)
```

**关键点：** OpenClaw Worker 接收 OpenAI 兼容的聊天消息格式，并附带工具定义。你的端点必须能理解 `{ messages, tools }` 格式并处理 `submit_proof` 工具调用。

---

## 第 1 步：注册 OpenClaw Agent

将你的 OpenClaw 实例注册为 Nexus Dispatch 的 Worker：

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

**字段说明：**

| 字段 | 说明 |
| --- | --- |
| `agent_id` | Worker 的唯一标识。建议使用描述性名称，如 `long-coder-1`。 |
| `endpoint` | 你的 OpenClaw 实例接收派发载荷的 URL。默认：`http://host:8647/v1/runs`。 |
| `lane` | 该 Agent 负责的工作类型：`DEV`、`CONTENT`、`DESIGN` 等。 |
| `dialect` | OpenClaw 类型 Worker 必须设为 `"openclaw"`。 |
| `soul_prompt` | Agent 处理任务时注入 messages 载荷的系统级指令。 |
| `tools_allowed` | Agent 被允许使用的工具集。 |
| `max_concurrency` | 最大并行任务数。大多数场景建议设为 `1`。 |
| `status` | 设为 `"online"` 可立即开始接收任务。 |

> ⚠️ **以实际版本为准：** 默认端口 `8647` 和端点路径 `/v1/runs` 基于 Nexus Dispatch 参考配置。你的 OpenClaw 版本可能使用不同的端口或路径——请通过命令验证你的实际版本。

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
      "id": "long-coder-1",
      "lane": "DEV",
      "dialect": "openclaw",
      "status": "online",
      "endpoint": "http://your-openclaw-host:8647/v1/runs"
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
    "id": "openclaw-test-001",
    "title": "OpenClaw Integration Test",
    "objective": "Verify that the OpenClaw worker receives and processes a dispatched task correctly.",
    "lane_required": "DEV",
    "acceptance_mode": "group_only",
    "acceptance_criteria": [
      "Task reaches completed through Runtime API transitions",
      "Proof artifact is submitted by the OpenClaw worker"
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
      \"task_id\": \"openclaw-test-001\",
      \"event\": \"${event}\",
      \"proof\": { \"source\": \"long-coder-1\", \"type\": \"integration-test\" }
    }"
done
```

如果 PM Daemon 正在运行，它会自动处理派发。OpenClaw Worker 应该：
1. 在其端点接收 OpenAI messages 载荷
2. 使用 `submit_proof` 工具和其他可用工具执行任务
3. 通过 `POST /api/v1/runtime/reports` 提交验收凭证
4. 通过 `POST /api/v1/runtime/tasks/transition` 变更任务状态

---

## 第 5 步：验证任务完成

```bash
curl -sS \
  "http://localhost:${NEXUS_API_PORT:-8000}/api/v1/runtime/tasks/openclaw-test-001?project_id=nexus-dispatch" \
  -H "Authorization: Bearer ${API_AUTH_TOKEN}"
```

**预期：** `status` 字段应为 `"completed"`。

---

## OpenClaw Worker 端点要求

你的 OpenClaw 实例必须暴露一个 HTTP 端点，满足以下条件：

1. **接受 POST** 请求，JSON body 为 OpenAI messages 格式：
   ```json
   {
     "messages": [
       {
         "role": "system",
         "content": "You are an OpenClaw Agent executing a task. You must return tool calls to perform actions."
       },
       {
         "role": "user",
         "content": "Execute Task: Fix the authentication bug\nDescription: The login endpoint returns 500..."
       }
     ],
     "tools": [
       {
         "type": "function",
         "function": {
           "name": "submit_proof",
           "description": "Submit task completion proof",
           "parameters": {
             "type": "object",
             "properties": {
               "proof": { "type": "string" }
             },
             "required": ["proof"]
           }
         }
       }
     ]
   }
   ```

2. **返回响应**，包含工具调用（包括 `submit_proof`）和执行结果。

3. **向 Nexus Runtime API 提交凭证**：
   ```bash
   curl -sS -X POST \
     "http://localhost:8000/api/v1/runtime/reports" \
     -H "Authorization: Bearer ${API_AUTH_TOKEN}" \
     -H "Content-Type: application/json" \
     -d '{
       "project_id": "nexus-dispatch",
       "task_id": "openclaw-test-001",
       "run_id": "run-001",
       "type": "completion",
       "content": { "summary": "Task completed successfully", "files_changed": ["src/auth.ts"] }
     }'
   ```

> ⚠️ **以实际版本为准 / verify with command：** 确切的请求/响应格式取决于你的 OpenClaw 版本。请查阅你特定版本的 OpenClaw 文档确认 API 契约。

---

## Telegram 通知配置

每个 Agent 通过**自己的** Telegram bot 发送通知。在环境变量中配置：

```bash
AGENT_NOTIFICATIONS='{
  "long-coder-1": {
    "bot_token": "${LONG_CODER_BOT_TOKEN}",
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
| Agent 未收到任务 | `curl -sS .../agents` — 确认 `status: "online"` 和 `dialect: "openclaw"` | Agent 状态为 offline，或 lane 与待处理任务不匹配。 |
| Daemon 未派发 | 检查 Daemon 日志：`docker compose logs nexus-daemon --since=10m` | 无待处理任务、Agent 未上线、lane 不匹配、或 Worker 端点不可达。 |
| Worker 端点返回错误 | `curl -X POST http://your-openclaw-host:8647/v1/runs -d '{}'` | OpenClaw 未运行、端口错误、防火墙阻拦。 |
| API 调用返回 401 | 确认 `Authorization: Bearer` 请求头与 `API_AUTH_TOKEN` 一致 | Token 缺失、不匹配、或未在环境中设置。 |
| 验收凭证未被接受 | 检查任务状态：`GET /api/v1/runtime/tasks/{id}?project_id=...` | 任务可能已处于终态，或状态转换序列错误。 |
| Adapter 载荷不匹配 | 检查 Daemon 日志中的 adapter 错误 | OpenClaw 版本可能期望不同的消息格式。以实际版本为准进行验证。 |
| Telegram 无通知 | 确认 `AGENT_NOTIFICATIONS` JSON 和 bot 权限 | 缺少 Agent 的 bot 配置、token/chat_id 错误、bot 缺少群组权限。 |

---

## 下一步

- [Hermes Agent 接入教程](./hermes-agent.zh-CN.md) — 接入 Hermes Worker
- [双系统 Agent 接入教程](./dual-agent.zh-CN.md) — 同时运行 Hermes 和 OpenClaw
- [安装与部署指南](../install.zh-CN.md) — 完整部署参考
