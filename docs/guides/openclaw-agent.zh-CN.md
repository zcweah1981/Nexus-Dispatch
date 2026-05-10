     1|# OpenClaw Agent 接入教程
     2|
     3|[English](./openclaw-agent.md) · [简体中文](./openclaw-agent.zh-CN.md) · [繁體中文](./openclaw-agent.zh-TW.md)
     4|
     5|---
     6|
     7|## 概述
     8|
     9|本教程介绍如何将一个 **OpenClaw Agent** 作为 Worker 接入 Nexus Dispatch 控制平面。接入完成后，PM Daemon 会自动使用 OpenAI 兼容的 messages 格式将任务派发到你的 OpenClaw 实例，Worker 通过 Runtime API 提交验收凭证。
    10|
    11|**适合谁：** 正在运行 OpenClaw（或任何 OpenAI 兼容的编码 Agent）、希望它自动接收并执行 Nexus Dispatch 派发任务的开发者和运维人员。
    12|
    13|![OpenClaw 集成](../assets/guide/openclaw-integration.png)
    14|
    15|---
    16|
    17|## 前置条件
    18|
    19|开始之前，请确保：
    20|
    21|| 要求 | 验证方式 |
    22|| --- | --- |
    23|| Nexus Dispatch API Server 已运行 | `curl -I http://localhost:8000/api/v1/events/stream` |
    24|| 环境变量 `API_AUTH_TOKEN` 已设置 | `echo $API_AUTH_TOKEN`（不能为空） |
    25|| OpenClaw 已安装并配置 | 用你的安装方式验证 |
    26|| OpenClaw Worker 端点可达 | `curl -I http://your-openclaw-host:8647/v1/runs` |
    27|| Nexus 中已创建项目 | 参见 [安装与部署指南](../install.zh-CN.md) §3.4 |
    28|
    29|> ⚠️ **版本说明：** OpenClaw 的 CLI 标志、默认端口和端点路径可能因版本而异。请以实际版本为准，通过命令验证。本教程中的端点路径 `/v1/runs` 基于 Nexus Dispatch 默认配置——如果你的 OpenClaw 实例使用不同的路由，请相应调整。
    30|
    31|---
    32|
    33|## 架构说明
    34|
    35|当 Daemon 向 OpenClaw 类型 Worker 派发任务时：
    36|
    37|```
    38|PM Daemon
    39|  │
    40|  │ 选取任务 + 匹配 Agent (dialect: "openclaw")
    41|  │
    42|  ▼
    43|OpenClawAdapter.adapt()
    44|  │
    45|  │ 将任务转换为 OpenAI messages 载荷：
    46|  │ {
    47|  │   "messages": [
    48|  │     { "role": "system", "content": "You are an OpenClaw Agent..." },
    49|  │     { "role": "user", "content": "Execute Task: ...\nDescription: ..." }
    50|  │   ],
    51|  │   "tools": [
    52|  │     { "type": "function", "function": { "name": "submit_proof", ... } }
    53|  │   ]
    54|  │ }
    55|  │
    56|  ▼
    57|POST → OpenClaw Worker 端点 (/v1/runs)
    58|  │
    59|  │ OpenClaw 接收 messages，执行任务，
    60|  │ 通过 Runtime API 提交验收凭证
    61|  │
    62|  ▼
    63|POST /api/v1/runtime/reports  (凭证 + 交付物)
    64|POST /api/v1/runtime/tasks/transition  (状态变更)
    65|```
    66|
    67|**关键点：** OpenClaw Worker 接收 OpenAI 兼容的聊天消息格式，并附带工具定义。你的端点必须能理解 `{ messages, tools }` 格式并处理 `submit_proof` 工具调用。
    68|
    69|---
    70|
    71|## 第 1 步：注册 OpenClaw Agent
    72|
    73|将你的 OpenClaw 实例注册为 Nexus Dispatch 的 Worker：
    74|
    75|```bash
    76|curl -sS -X POST \
    77|  "http://localhost:${NEXUS_API_PORT:-8000}/api/v1/runtime/projects/${NEXUS_PROJECT_ID:-nexus-dispatch}/agents" \
    78|  -H "Authorization: Bearer ${API_AUTH_TOKEN}" \
    79|  -H "Content-Type: application/json" \
    80|  -d '{
    81|    "agent_id": "long-coder-1",
    82|    "endpoint": "http://your-openclaw-host:8647/v1/runs",
    83|    "lane": "DEV",
    84|    "dialect": "openclaw",
    85|    "soul_prompt": "You are a coding agent. Execute tasks precisely, write clean code, and submit proof of completion.",
    86|    "tools_allowed": ["terminal", "file", "web"],
    87|    "max_concurrency": 1,
    88|    "status": "online"
    89|  }'
    90|```
    91|
    92|**字段说明：**
    93|
    94|| 字段 | 说明 |
    95|| --- | --- |
    96|| `agent_id` | Worker 的唯一标识。建议使用描述性名称，如 `long-coder-1`。 |
    97|| `endpoint` | 你的 OpenClaw 实例接收派发载荷的 URL。默认：`http://host:8647/v1/runs`。 |
    98|| `lane` | 该 Agent 负责的工作类型：`DEV`、`CONTENT`、`DESIGN` 等。 |
    99|| `dialect` | OpenClaw 类型 Worker 必须设为 `"openclaw"`。 |
   100|| `soul_prompt` | Agent 处理任务时注入 messages 载荷的系统级指令。 |
   101|| `tools_allowed` | Agent 被允许使用的工具集。 |
   102|| `max_concurrency` | 最大并行任务数。大多数场景建议设为 `1`。 |
   103|| `status` | 设为 `"online"` 可立即开始接收任务。 |
   104|
   105|> ⚠️ **以实际版本为准：** 默认端口 `8647` 和端点路径 `/v1/runs` 基于 Nexus Dispatch 参考配置。你的 OpenClaw 版本可能使用不同的端口或路径——请通过命令验证你的实际版本。
   106|
   107|---
   108|
   109|## 第 2 步：验证注册
   110|
   111|确认 Agent 已成功注册：
   112|
   113|```bash
   114|curl -sS \
   115|  "http://localhost:${NEXUS_API_PORT:-8000}/api/v1/runtime/projects/${NEXUS_PROJECT_ID:-nexus-dispatch}/agents" \
   116|  -H "Authorization: Bearer ${API_AUTH_TOKEN}"
   117|```
   118|
   119|**预期响应**应包含你的 Agent：
   120|
   121|```json
   122|{
   123|  "agents": [
   124|    {
   125|      "id": "long-coder-1",
   126|      "lane": "DEV",
   127|      "dialect": "openclaw",
   128|      "status": "online",
   129|      "endpoint": "http://your-openclaw-host:8647/v1/runs"
   130|    }
   131|  ]
   132|}
   133|```
   134|
   135|---
   136|
   137|## 第 3 步：创建测试任务
   138|
   139|创建一个简单任务来测试集成：
   140|
   141|```bash
   142|curl -sS -X POST \
   143|  "http://localhost:${NEXUS_API_PORT:-8000}/api/v1/runtime/tasks" \
   144|  -H "Authorization: Bearer ${API_AUTH_TOKEN}" \
   145|  -H "Content-Type: application/json" \
   146|  -d '{
   147|    "project_id": "nexus-dispatch",
   148|    "id": "openclaw-test-001",
   149|    "title": "OpenClaw Integration Test",
   150|    "objective": "Verify that the OpenClaw worker receives and processes a dispatched task correctly.",
   151|    "lane_required": "DEV",
   152|    "acceptance_mode": "group_only",
   153|    "acceptance_criteria": [
   154|      "Task reaches completed through Runtime API transitions",
   155|      "Proof artifact is submitted by the OpenClaw worker"
   156|    ]
   157|  }'
   158|```
   159|
   160|---
   161|
   162|## 第 4 步：驱动任务生命周期
   163|
   164|如果手动测试（Daemon 未运行），用以下转换驱动生命周期：
   165|
   166|```bash
   167|for event in dispatch start submit_completion request_review review_pass; do
   168|  curl -sS -X POST \
   169|    "http://localhost:${NEXUS_API_PORT:-8000}/api/v1/runtime/tasks/transition" \
   170|    -H "Authorization: Bearer ${API_AUTH_TOKEN}" \
   171|    -H "Content-Type: application/json" \
   172|    -d "{
   173|      \"project_id\": \"nexus-dispatch\",
   174|      \"task_id\": \"openclaw-test-001\",
   175|      \"event\": \"${event}\",
   176|      \"proof\": { \"source\": \"long-coder-1\", \"type\": \"integration-test\" }
   177|    }"
   178|done
   179|```
   180|
   181|如果 PM Daemon 正在运行，它会自动处理派发。OpenClaw Worker 应该：
   182|1. 在其端点接收 OpenAI messages 载荷
   183|2. 使用 `submit_proof` 工具和其他可用工具执行任务
   184|3. 通过 `POST /api/v1/runtime/reports` 提交验收凭证
   185|4. 通过 `POST /api/v1/runtime/tasks/transition` 变更任务状态
   186|
   187|---
   188|
   189|## 第 5 步：验证任务完成
   190|
   191|```bash
   192|curl -sS \
   193|  "http://localhost:${NEXUS_API_PORT:-8000}/api/v1/runtime/tasks/openclaw-test-001?project_id=nexus-dispatch" \
   194|  -H "Authorization: Bearer ${API_AUTH_TOKEN}"
   195|```
   196|
   197|**预期：** `status` 字段应为 `"completed"`。
   198|
   199|---
   200|
   201|## OpenClaw Worker 端点要求
   202|
   203|你的 OpenClaw 实例必须暴露一个 HTTP 端点，满足以下条件：
   204|
   205|1. **接受 POST** 请求，JSON body 为 OpenAI messages 格式：
   206|   ```json
   207|   {
   208|     "messages": [
   209|       {
   210|         "role": "system",
   211|         "content": "You are an OpenClaw Agent executing a task. You must return tool calls to perform actions."
   212|       },
   213|       {
   214|         "role": "user",
   215|         "content": "Execute Task: Fix the authentication bug\nDescription: The login endpoint returns 500..."
   216|       }
   217|     ],
   218|     "tools": [
   219|       {
   220|         "type": "function",
   221|         "function": {
   222|           "name": "submit_proof",
   223|           "description": "Submit task completion proof",
   224|           "parameters": {
   225|             "type": "object",
   226|             "properties": {
   227|               "proof": { "type": "string" }
   228|             },
   229|             "required": ["proof"]
   230|           }
   231|         }
   232|       }
   233|     ]
   234|   }
   235|   ```
   236|
   237|2. **返回响应**，包含工具调用（包括 `submit_proof`）和执行结果。
   238|
   239|3. **向 Nexus Runtime API 提交凭证**：
   240|   ```bash
   241|   curl -sS -X POST \
   242|     "http://localhost:8000/api/v1/runtime/reports" \
   243|     -H "Authorization: Bearer ${API_AUTH_TOKEN}" \
   244|     -H "Content-Type: application/json" \
   245|     -d '{
   246|       "project_id": "nexus-dispatch",
   247|       "task_id": "openclaw-test-001",
   248|       "run_id": "run-001",
   249|       "type": "completion",
   250|       "content": { "summary": "Task completed successfully", "files_changed": ["src/auth.ts"] }
   251|     }'
   252|   ```
   253|
   254|> ⚠️ **以实际版本为准 / verify with command：** 确切的请求/响应格式取决于你的 OpenClaw 版本。请查阅你特定版本的 OpenClaw 文档确认 API 契约。
   255|
   256|---
   257|
   258|## Telegram 通知配置
   259|
   260|每个 Agent 通过**自己的** Telegram bot 发送通知。在环境变量中配置：
   261|
   262|```bash
   263|AGENT_NOTIFICATIONS='{
   264|  "long-coder-1": {
   265|    "bot_token": "${LONG_CODER_BOT_TOKEN}",
   266|    "chat_id": "${NEXUS_GROUP_CHAT_ID}"
   267|  }
   268|}'
   269|```
   270|
   271|**规则：**
   272|- 严禁使用 Daemon bot 或 PM bot 代替 Agent 发送通知。
   273|- 群组中的可见消息必须人类可读——不得包含原始 JSON、任务 ID 或 Token。
   274|- 完整的追踪数据保存在数据库和 Runtime proof 中。
   275|
   276|---
   277|
   278|## 排错指南
   279|
   280|| 症状 | 检查命令 | 常见原因 / 解决方案 |
   281|| --- | --- | --- |
   282|| Agent 未收到任务 | `curl -sS .../agents` — 确认 `status: "online"` 和 `dialect: "openclaw"` | Agent 状态为 offline，或 lane 与待处理任务不匹配。 |
   283|| Daemon 未派发 | 检查 Daemon 日志：`docker compose logs nexus-daemon --since=10m` | 无待处理任务、Agent 未上线、lane 不匹配、或 Worker 端点不可达。 |
   284|| Worker 端点返回错误 | `curl -X POST http://your-openclaw-host:8647/v1/runs -d '{}'` | OpenClaw 未运行、端口错误、防火墙阻拦。 |
   285|| API 调用返回 401 | 确认 `Authorization: Bearer` 请求头与 `API_AUTH_TOKEN` 一致 | Token 缺失、不匹配、或未在环境中设置。 |
   286|| 验收凭证未被接受 | 检查任务状态：`GET /api/v1/runtime/tasks/{id}?project_id=...` | 任务可能已处于终态，或状态转换序列错误。 |
   287|| Adapter 载荷不匹配 | 检查 Daemon 日志中的 adapter 错误 | OpenClaw 版本可能期望不同的消息格式。以实际版本为准进行验证。 |
   288|| Telegram 无通知 | 确认 `AGENT_NOTIFICATIONS` JSON 和 bot 权限 | 缺少 Agent 的 bot 配置、token/chat_id 错误、bot 缺少群组权限。 |
   289|
   290|---
   291|
   292|## 下一步
   293|
   294|- [Hermes Agent 接入教程](./hermes-agent.zh-CN.md) — 接入 Hermes Worker
   295|- [双系统 Agent 接入教程](./dual-agent.zh-CN.md) — 同时运行 Hermes 和 OpenClaw
   296|- [安装与部署指南](../install.zh-CN.md) — 完整部署参考
   297|