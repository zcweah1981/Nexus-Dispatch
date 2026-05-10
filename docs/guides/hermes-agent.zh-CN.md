     1|# Hermes Agent 接入教程
     2|
     3|[English](./hermes-agent.md) · [简体中文](./hermes-agent.zh-CN.md) · [繁體中文](./hermes-agent.zh-TW.md)
     4|
     5|---
     6|
     7|## 概述
     8|
     9|本教程介绍如何将一个 **Hermes Agent** 作为 Worker 接入 Nexus Dispatch 控制平面。接入完成后，PM Daemon 会自动将任务派发到你的 Hermes 实例，Hermes 执行任务并通过 Runtime API 提交验收凭证。
    10|
    11|**适合谁：** 正在运行 Hermes Agent、希望它自动接收并执行 Nexus Dispatch 派发任务的开发者和运维人员。
    12|
    13|![Hermes 集成](../assets/guide/hermes-integration.png)
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
    25|| Hermes Agent 已安装 | `hermes --version` |
    26|| Hermes gateway 已配置（用于 Telegram 通知） | `hermes gateway status` |
    27|| Nexus 中已创建项目 | 参见 [安装与部署指南](../install.zh-CN.md) §3.4 |
    28|
    29|---
    30|
    31|## 架构说明
    32|
    33|当 Daemon 向 Hermes 类型 Worker 派发任务时：
    34|
    35|```
    36|PM Daemon
    37|  │
    38|  │ 选取任务 + 匹配 Agent (dialect: "hermes")
    39|  │
    40|  ▼
    41|HermesMCPAdapter.adapt()
    42|  │
    43|  │ 将任务转换为 MCP intent 载荷：
    44|  │ {
    45|  │   "mcp_intent": "execute_task",
    46|  │   "task_id": "...",
    47|  │   "parameters": { "title": "...", "description": "..." },
    48|  │   "expected_artifact": "mcp_tool_call"
    49|  │ }
    50|  │
    51|  ▼
    52|POST → Hermes Worker 端点
    53|  │
    54|  │ Hermes 接收 intent，执行任务，
    55|  │ 通过 Runtime API 提交验收凭证
    56|  │
    57|  ▼
    58|POST /api/v1/runtime/reports  (凭证 + 交付物)
    59|POST /api/v1/runtime/tasks/transition  (状态变更)
    60|```
    61|
    62|**关键点：** Hermes Worker 接收的是 MCP 风格的 intent 载荷，不是原始 OpenAI messages 格式。你的 Hermes 端点必须能理解 `{ mcp_intent, task_id, parameters }` 格式。
    63|
    64|---
    65|
    66|## 第 1 步：注册 Hermes Agent
    67|
    68|将你的 Hermes 实例注册为 Nexus Dispatch 的 Worker：
    69|
    70|```bash
    71|curl -sS -X POST \
    72|  "http://localhost:${NEXUS_API_PORT:-8000}/api/v1/runtime/projects/${NEXUS_PROJECT_ID:-nexus-dispatch}/agents" \
    73|  -H "Authorization: Bearer ${API_AUTH_TOKEN}" \
    74|  -H "Content-Type: application/json" \
    75|  -d '{
    76|    "agent_id": "hermes-worker-1",
    77|    "endpoint": "http://your-hermes-host:8080/intent",
    78|    "lane": "CONTENT",
    79|    "dialect": "hermes",
    80|    "soul_prompt": "You are a content production agent. Follow task instructions precisely and submit proof.",
    81|    "tools_allowed": ["web", "browser", "file", "terminal"],
    82|    "max_concurrency": 1,
    83|    "status": "online"
    84|  }'
    85|```
    86|
    87|**字段说明：**
    88|
    89|| 字段 | 说明 |
    90|| --- | --- |
    91|| `agent_id` | Worker 的唯一标识。建议使用描述性名称，如 `hermes-content-1`。 |
    92|| `endpoint` | 你的 Hermes 实例接收 MCP intent 载荷的 URL。 |
    93|| `lane` | 该 Agent 负责的工作类型：`DEV`、`CONTENT`、`DESIGN` 等。 |
    94|| `dialect` | Hermes 类型 Worker 必须设为 `"hermes"`。 |
    95|| `soul_prompt` | Agent 处理任务时注入的系统级指令。 |
    96|| `tools_allowed` | Agent 被允许使用的工具集。 |
    97|| `max_concurrency` | 最大并行任务数。大多数场景建议设为 `1`。 |
    98|| `status` | 设为 `"online"` 可立即开始接收任务。 |
    99|
   100|---
   101|
   102|## 第 2 步：验证注册
   103|
   104|确认 Agent 已成功注册：
   105|
   106|```bash
   107|curl -sS \
   108|  "http://localhost:${NEXUS_API_PORT:-8000}/api/v1/runtime/projects/${NEXUS_PROJECT_ID:-nexus-dispatch}/agents" \
   109|  -H "Authorization: Bearer ${API_AUTH_TOKEN}"
   110|```
   111|
   112|**预期响应**应包含你的 Agent：
   113|
   114|```json
   115|{
   116|  "agents": [
   117|    {
   118|      "id": "hermes-worker-1",
   119|      "lane": "CONTENT",
   120|      "dialect": "hermes",
   121|      "status": "online",
   122|      "endpoint": "http://your-hermes-host:8080/intent"
   123|    }
   124|  ]
   125|}
   126|```
   127|
   128|---
   129|
   130|## 第 3 步：创建测试任务
   131|
   132|创建一个简单任务来测试集成：
   133|
   134|```bash
   135|curl -sS -X POST \
   136|  "http://localhost:${NEXUS_API_PORT:-8000}/api/v1/runtime/tasks" \
   137|  -H "Authorization: Bearer ${API_AUTH_TOKEN}" \
   138|  -H "Content-Type: application/json" \
   139|  -d '{
   140|    "project_id": "nexus-dispatch",
   141|    "id": "hermes-test-001",
   142|    "title": "Hermes Integration Test",
   143|    "objective": "Verify that the Hermes worker receives and processes a dispatched task correctly.",
   144|    "lane_required": "CONTENT",
   145|    "acceptance_mode": "group_only",
   146|    "acceptance_criteria": [
   147|      "Task reaches completed through Runtime API transitions",
   148|      "Proof artifact is submitted by the Hermes worker"
   149|    ]
   150|  }'
   151|```
   152|
   153|---
   154|
   155|## 第 4 步：驱动任务生命周期
   156|
   157|如果手动测试（Daemon 未运行），用以下转换驱动生命周期：
   158|
   159|```bash
   160|for event in dispatch start submit_completion request_review review_pass; do
   161|  curl -sS -X POST \
   162|    "http://localhost:${NEXUS_API_PORT:-8000}/api/v1/runtime/tasks/transition" \
   163|    -H "Authorization: Bearer ${API_AUTH_TOKEN}" \
   164|    -H "Content-Type: application/json" \
   165|    -d "{
   166|      \"project_id\": \"nexus-dispatch\",
   167|      \"task_id\": \"hermes-test-001\",
   168|      \"event\": \"${event}\",
   169|      \"proof\": { \"source\": \"hermes-worker-1\", \"type\": \"integration-test\" }
   170|    }"
   171|done
   172|```
   173|
   174|如果 PM Daemon 正在运行，它会自动处理派发。Hermes Worker 应该：
   175|1. 在其端点接收 MCP intent 载荷
   176|2. 使用配置的工具执行任务
   177|3. 通过 `POST /api/v1/runtime/reports` 提交验收凭证
   178|4. 通过 `POST /api/v1/runtime/tasks/transition` 变更任务状态
   179|
   180|---
   181|
   182|## 第 5 步：验证任务完成
   183|
   184|```bash
   185|curl -sS \
   186|  "http://localhost:${NEXUS_API_PORT:-8000}/api/v1/runtime/tasks/hermes-test-001?project_id=nexus-dispatch" \
   187|  -H "Authorization: Bearer ${API_AUTH_TOKEN}"
   188|```
   189|
   190|**预期：** `status` 字段应为 `"completed"`。
   191|
   192|---
   193|
   194|## Hermes Worker 端点要求
   195|
   196|你的 Hermes 实例必须暴露一个 HTTP 端点，满足以下条件：
   197|
   198|1. **接受 POST** 请求，JSON body 为 MCP intent 格式：
   199|   ```json
   200|   {
   201|     "mcp_intent": "execute_task",
   202|     "task_id": "some-task-id",
   203|     "parameters": {
   204|       "title": "Task Title",
   205|       "description": "Task description"
   206|     },
   207|     "expected_artifact": "mcp_tool_call"
   208|   }
   209|   ```
   210|
   211|2. **返回响应**并包含执行凭证。
   212|
   213|3. **向 Nexus Runtime API 提交凭证**：
   214|   ```bash
   215|   curl -sS -X POST \
   216|     "http://localhost:8000/api/v1/runtime/reports" \
   217|     -H "Authorization: Bearer ${API_AUTH_TOKEN}" \
   218|     -H "Content-Type: application/json" \
   219|     -d '{
   220|       "project_id": "nexus-dispatch",
   221|       "task_id": "hermes-test-001",
   222|       "run_id": "run-001",
   223|       "type": "completion",
   224|       "content": { "summary": "Task completed successfully", "files_changed": ["..."] }
   225|     }'
   226|   ```
   227|
   228|### 用 Hermes 搭建端点
   229|
   230|你可以通过 gateway 模式运行 Hermes，并配置 webhook 来处理接收到的 intent：
   231|
   232|```bash
   233|# 启动 Hermes gateway
   234|hermes gateway run
   235|
   236|# 或配置特定的 webhook 路由
   237|hermes webhook subscribe nexus-intent
   238|```
   239|
   240|也可以用自定义脚本在端点上监听，然后分发给 `hermes chat -q`：
   241|
   242|```bash
   243|# 单次执行模式
   244|hermes chat -q "Execute task: {task_title}. Description: {task_description}"
   245|```
   246|
   247|---
   248|
   249|## Telegram 通知配置
   250|
   251|每个 Agent 通过**自己的** Telegram bot 发送通知。在环境变量中配置：
   252|
   253|```bash
   254|AGENT_NOTIFICATIONS='{
   255|  "hermes-worker-1": {
   256|    "bot_token": "${HERMES_WORKER_BOT_TOKEN}",
   257|    "chat_id": "${NEXUS_GROUP_CHAT_ID}"
   258|  }
   259|}'
   260|```
   261|
   262|**规则：**
   263|- 严禁使用 Daemon bot 或 PM bot 代替 Agent 发送通知。
   264|- 群组中的可见消息必须人类可读——不得包含原始 JSON、任务 ID 或 Token。
   265|- 完整的追踪数据保存在数据库和 Runtime proof 中。
   266|
   267|---
   268|
   269|## 排错指南
   270|
   271|| 症状 | 检查命令 | 常见原因 / 解决方案 |
   272|| --- | --- | --- |
   273|| Agent 未收到任务 | `curl -sS .../agents` — 确认 `status: "online"` 和 `dialect: "hermes"` | Agent 状态为 offline，或 lane 与待处理任务不匹配。 |
   274|| Daemon 未派发 | 检查 Daemon 日志：`docker compose logs nexus-daemon --since=10m` | 无待处理任务、Agent 未上线、lane 不匹配、或 Worker 端点不可达。 |
   275|| Worker 端点返回错误 | `curl -X POST http://your-hermes-host:8080/intent -d '{}'` | Hermes gateway 未运行、端口错误、防火墙阻拦。 |
   276|| API 调用返回 401 | 确认 `Authorization: Bearer` 请求头与 `API_AUTH_TOKEN` 一致 | Token 缺失、不匹配、或未在环境中设置。 |
   277|| 验收凭证未被接受 | 检查任务状态：`GET /api/v1/runtime/tasks/{id}?project_id=...` | 任务可能已处于终态，或状态转换序列错误。 |
   278|| Hermes MCP 报错 | `hermes doctor` 并检查日志 | Hermes 未配置 MCP，或缺少 skill/plugin。 |
   279|| Telegram 无通知 | 确认 `AGENT_NOTIFICATIONS` JSON 和 bot 权限 | 缺少 Agent 的 bot 配置、token/chat_id 错误、bot 缺少群组权限。 |
   280|
   281|---
   282|
   283|## 下一步
   284|
   285|- [OpenClaw Agent 接入教程](./openclaw-agent.zh-CN.md) — 接入 OpenClaw Worker
   286|- [双系统 Agent 接入教程](./dual-agent.zh-CN.md) — 同时运行 Hermes 和 OpenClaw
   287|- [安装与部署指南](../install.zh-CN.md) — 完整部署参考
   288|- [Hermes Agent 官方文档](https://hermes-agent.nousresearch.com/docs/) — Hermes 官方文档
   289|