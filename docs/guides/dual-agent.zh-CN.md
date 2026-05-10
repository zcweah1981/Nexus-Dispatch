     1|# 双系统 Agent 接入教程：Hermes + OpenClaw
     2|
     3|[English](./dual-agent.md) · [简体中文](./dual-agent.zh-CN.md) · [繁體中文](./dual-agent.zh-TW.md)
     4|
     5|---
     6|
     7|## 概述
     8|
     9|本教程介绍如何在同一个 Nexus Dispatch 实例上同时运行 **Hermes 和 OpenClaw Worker**。PM Daemon 根据每个 Agent 的**泳道 (lane)** 和**方言 (dialect)** 将任务路由到正确的 Worker——编码任务走 OpenClaw，内容任务走 Hermes——统一在一个控制平面下管理。
    10|
    11|**适合谁：** 使用多种 Agent 类型、希望有统一派单/追踪/验收系统的团队。
    12|
    13|![双系统架构](../assets/guide/dual-system-architecture.png)
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
    25|| Hermes Agent 已安装且 gateway 已配置 | `hermes --version` 和 `hermes gateway status` |
    26|| OpenClaw 已安装且端点可达 | `curl -I http://your-openclaw-host:8647/v1/runs` |
    27|| PM Daemon 已运行 | `docker compose ps nexus-daemon` 或 `systemctl status nexus-dispatch-daemon` |
    28|| Nexus 中已创建项目 | 参见 [安装与部署指南](../install.zh-CN.md) §3.4 |
    29|
    30|---
    31|
    32|## 路由原理
    33|
    34|Nexus Dispatch 使用两个维度来将任务发送到正确的 Agent：
    35|
    36|| 维度 | 作用 | 示例 |
    37|| --- | --- | --- |
    38|| **Lane（泳道）** | 标识工作类型。任务和 Agent 必须属于同一泳道才能匹配。 | `DEV`、`CONTENT`、`DESIGN` |
    39|| **Dialect（方言）** | 决定派发时的传输格式。Daemon 根据方言选择正确的适配器。 | `hermes` → HermesMCPAdapter，`openclaw` → OpenClawAdapter |
    40|
    41|```
    42|PM Daemon (tick 循环)
    43|  │
    44|  │ 1. 获取待处理任务
    45|  │ 2. 对每个任务，查找 lane 匹配的在线 Agent
    46|  │ 3. 选择 Agent（优先级 + 并发控制）
    47|  │ 4. 查询 agent.dialect → 选择适配器
    48|  │
    49|  ├─ dialect: "hermes" ──→ HermesMCPAdapter ──→ POST 到 Hermes 端点
    50|  │                                              (MCP intent 格式)
    51|  │
    52|  └─ dialect: "openclaw" ─→ OpenClawAdapter ──→ POST 到 OpenClaw 端点
    53|                                               (OpenAI messages 格式)
    54|```
    55|
    56|**结果：** 一个 Nexus 实例可以同时将编码任务派发到 OpenClaw、内容任务派发到 Hermes。每个 Agent 以自己的原生格式处理任务。
    57|
    58|---
    59|
    60|## 第 1 步：注册两个 Agent
    61|
    62|分别注册一个 Hermes Worker（内容任务）和一个 OpenClaw Worker（编码任务）：
    63|
    64|### 1a. 注册 Hermes Worker（CONTENT 泳道）
    65|
    66|```bash
    67|curl -sS -X POST \
    68|  "http://localhost:${NEXUS_API_PORT:-8000}/api/v1/runtime/projects/${NEXUS_PROJECT_ID:-nexus-dispatch}/agents" \
    69|  -H "Authorization: Bearer ${API_AUTH_TOKEN}" \
    70|  -H "Content-Type: application/json" \
    71|  -d '{
    72|    "agent_id": "hermes-content-1",
    73|    "endpoint": "http://your-hermes-host:8080/intent",
    74|    "lane": "CONTENT",
    75|    "dialect": "hermes",
    76|    "soul_prompt": "You are a content production agent. Write high-quality copy and submit proof.",
    77|    "tools_allowed": ["web", "browser", "file", "terminal"],
    78|    "max_concurrency": 1,
    79|    "status": "online"
    80|  }'
    81|```
    82|
    83|### 1b. 注册 OpenClaw Worker（DEV 泳道）
    84|
    85|```bash
    86|curl -sS -X POST \
    87|  "http://localhost:${NEXUS_API_PORT:-8000}/api/v1/runtime/projects/${NEXUS_PROJECT_ID:-nexus-dispatch}/agents" \
    88|  -H "Authorization: Bearer ${API_AUTH_TOKEN}" \
    89|  -H "Content-Type: application/json" \
    90|  -d '{
    91|    "agent_id": "long-coder-1",
    92|    "endpoint": "http://your-openclaw-host:8647/v1/runs",
    93|    "lane": "DEV",
    94|    "dialect": "openclaw",
    95|    "soul_prompt": "You are a coding agent. Execute tasks precisely, write clean code, and submit proof of completion.",
    96|    "tools_allowed": ["terminal", "file", "web"],
    97|    "max_concurrency": 1,
    98|    "status": "online"
    99|  }'
   100|```
   101|
   102|> ⚠️ **OpenClaw 版本说明：** 默认端口 `8647` 和路径 `/v1/runs` 基于 Nexus Dispatch 参考配置。请以实际版本为准，通过命令验证你安装的 OpenClaw 版本。
   103|
   104|---
   105|
   106|## 第 2 步：验证两个 Agent 均已注册
   107|
   108|```bash
   109|curl -sS \
   110|  "http://localhost:${NEXUS_API_PORT:-8000}/api/v1/runtime/projects/${NEXUS_PROJECT_ID:-nexus-dispatch}/agents" \
   111|  -H "Authorization: Bearer ${API_AUTH_TOKEN}"
   112|```
   113|
   114|**预期响应**应显示两个 Agent：
   115|
   116|```json
   117|{
   118|  "agents": [
   119|    {
   120|      "id": "hermes-content-1",
   121|      "lane": "CONTENT",
   122|      "dialect": "hermes",
   123|      "status": "online",
   124|      "endpoint": "http://your-hermes-host:8080/intent"
   125|    },
   126|    {
   127|      "id": "long-coder-1",
   128|      "lane": "DEV",
   129|      "dialect": "openclaw",
   130|      "status": "online",
   131|      "endpoint": "http://your-openclaw-host:8647/v1/runs"
   132|    }
   133|  ]
   134|}
   135|```
   136|
   137|确认两个 Agent 都显示 `"status": "online"` 且 `dialect` 值正确。
   138|
   139|---
   140|
   141|## 第 3 步：为每个泳道创建任务
   142|
   143|### 3a. 内容任务 → 路由到 Hermes
   144|
   145|```bash
   146|curl -sS -X POST \
   147|  "http://localhost:${NEXUS_API_PORT:-8000}/api/v1/runtime/tasks" \
   148|  -H "Authorization: Bearer ${API_AUTH_TOKEN}" \
   149|  -H "Content-Type: application/json" \
   150|  -d '{
   151|    "project_id": "nexus-dispatch",
   152|    "id": "content-task-001",
   153|    "title": "Write Landing Page Copy",
   154|    "objective": "Produce trilingual landing page copy for the new feature release.",
   155|    "lane_required": "CONTENT",
   156|    "acceptance_mode": "group_only",
   157|    "acceptance_criteria": [
   158|      "Three language versions delivered",
   159|      "Each version is under 200 words",
   160|      "CTA is clear and actionable"
   161|    ]
   162|  }'
   163|```
   164|
   165|### 3b. 编码任务 → 路由到 OpenClaw
   166|
   167|```bash
   168|curl -sS -X POST \
   169|  "http://localhost:${NEXUS_API_PORT:-8000}/api/v1/runtime/tasks" \
   170|  -H "Authorization: Bearer ${API_AUTH_TOKEN}" \
   171|  -H "Content-Type: application/json" \
   172|  -d '{
   173|    "project_id": "nexus-dispatch",
   174|    "id": "dev-task-001",
   175|    "title": "Fix Authentication Bug",
   176|    "objective": "The login endpoint returns 500 on empty password. Fix and add test coverage.",
   177|    "lane_required": "DEV",
   178|    "acceptance_mode": "group_only",
   179|    "acceptance_criteria": [
   180|      "Login endpoint returns 400 on empty password",
   181|      "Unit test added for edge case",
   182|      "No regression in existing auth tests"
   183|    ]
   184|  }'
   185|```
   186|
   187|---
   188|
   189|## 第 4 步：验证路由
   190|
   191|PM Daemon 运行时会自动：
   192|1. 获取两个待处理任务
   193|2. 匹配 `content-task-001`（lane: CONTENT）→ `hermes-content-1`（dialect: hermes）
   194|3. 匹配 `dev-task-001`（lane: DEV）→ `long-coder-1`（dialect: openclaw）
   195|4. 使用正确的适配器分别派发
   196|
   197|检查任务状态：
   198|
   199|```bash
   200|# 检查内容任务
   201|curl -sS \
   202|  "http://localhost:${NEXUS_API_PORT:-8000}/api/v1/runtime/tasks/content-task-001?project_id=nexus-dispatch" \
   203|  -H "Authorization: Bearer ${API_AUTH_TOKEN}"
   204|
   205|# 检查编码任务
   206|curl -sS \
   207|  "http://localhost:${NEXUS_API_PORT:-8000}/api/v1/runtime/tasks/dev-task-001?project_id=nexus-dispatch" \
   208|  -H "Authorization: Bearer ${API_AUTH_TOKEN}"
   209|```
   210|
   211|两个任务都应沿状态机推进：`created` → `dispatched` → `in_progress` → `completed`。
   212|
   213|### 手动驱动生命周期（Daemon 未运行时）
   214|
   215|```bash
   216|# 内容任务
   217|for event in dispatch start submit_completion request_review review_pass; do
   218|  curl -sS -X POST \
   219|    "http://localhost:${NEXUS_API_PORT:-8000}/api/v1/runtime/tasks/transition" \
   220|    -H "Authorization: Bearer ${API_AUTH_TOKEN}" \
   221|    -H "Content-Type: application/json" \
   222|    -d "{
   223|      \"project_id\": \"nexus-dispatch\",
   224|      \"task_id\": \"content-task-001\",
   225|      \"event\": \"${event}\",
   226|      \"proof\": { \"source\": \"hermes-content-1\", \"type\": \"dual-agent-test\" }
   227|    }"
   228|done
   229|
   230|# 编码任务
   231|for event in dispatch start submit_completion request_review review_pass; do
   232|  curl -sS -X POST \
   233|    "http://localhost:${NEXUS_API_PORT:-8000}/api/v1/runtime/tasks/transition" \
   234|    -H "Authorization: Bearer ${API_AUTH_TOKEN}" \
   235|    -H "Content-Type: application/json" \
   236|    -d "{
   237|      \"project_id\": \"nexus-dispatch\",
   238|      \"task_id\": \"dev-task-001\",
   239|      \"event\": \"${event}\",
   240|      \"proof\": { \"source\": \"long-coder-1\", \"type\": \"dual-agent-test\" }
   241|    }"
   242|done
   243|```
   244|
   245|---
   246|
   247|## 第 5 步：验证完成
   248|
   249|```bash
   250|curl -sS \
   251|  "http://localhost:${NEXUS_API_PORT:-8000}/api/v1/runtime/tasks/content-task-001?project_id=nexus-dispatch" \
   252|  -H "Authorization: Bearer ${API_AUTH_TOKEN}" | python3 -c "import sys,json; print(json.load(sys.stdin).get('status'))"
   253|
   254|curl -sS \
   255|  "http://localhost:${NEXUS_API_PORT:-8000}/api/v1/runtime/tasks/dev-task-001?project_id=nexus-dispatch" \
   256|  -H "Authorization: Bearer ${API_AUTH_TOKEN}" | python3 -c "import sys,json; print(json.load(sys.stdin).get('status'))"
   257|```
   258|
   259|**预期：** 两个都应返回 `"completed"`。
   260|
   261|---
   262|
   263|## Telegram 通知配置
   264|
   265|每个 Agent 必须配置**自己的** Telegram bot。Daemon 严禁代发。
   266|
   267|```bash
   268|AGENT_NOTIFICATIONS='{
   269|  "hermes-content-1": {
   270|    "bot_token": "${HERMES_CONTENT_BOT_TOKEN}",
   271|    "chat_id": "${NEXUS_GROUP_CHAT_ID}"
   272|  },
   273|  "long-coder-1": {
   274|    "bot_token": "${LONG_CODER_BOT_TOKEN}",
   275|    "chat_id": "${NEXUS_GROUP_CHAT_ID}"
   276|  }
   277|}'
   278|```
   279|
   280|**规则：**
   281|- 每个 agent_id 对应自己的 bot_token。严禁在 Agent 之间共享 bot token。
   282|- 两个 Agent 可以发到同一个群组（相同 `chat_id`），也可以发到不同群组。
   283|- 群组中的可见消息必须人类可读——不得包含原始 JSON、任务 ID 或 Token。
   284|- 完整的追踪数据保存在数据库和 Runtime proof 中。
   285|
   286|---
   287|
   288|## 并发与调度
   289|
   290|| 场景 | 行为 |
   291|| --- | --- |
   292|| 两个任务，不同泳道 | 同时派发到不同 Agent。 |
   293|| 两个任务，同一泳道，Agent `max_concurrency: 1` | 顺序处理。 |
   294|| 两个任务，同一泳道，Agent `max_concurrency: 2` | 同一 Agent 并行处理。 |
   295|| 没有 Agent 匹配任务的泳道 | 任务保持 `pending`，直到匹配的 Agent 上线。 |
   296|
   297|---
   298|
   299|## 排错指南
   300|
   301|| 症状 | 检查命令 | 常见原因 / 解决方案 |
   302|| --- | --- | --- |
   303|| 任务卡在 `pending` | `curl -sS .../agents` — 确认至少有一个 Agent 匹配任务的泳道 | 没有在线 Agent 匹配该泳道，或所有匹配 Agent 已达最大并发。 |
   304|| 错误的 Agent 接了任务 | 检查任务的 `lane_required` 与 Agent 的 `lane` 字段 | 泳道不匹配——确保任务泳道与目标 Agent 的泳道一致。 |
   305|| 一个 Agent 收到所有任务 | 检查注册 Agent 的 `lane` 值 | 多个 Agent 注册了同一泳道。用不同泳道路由。 |
   306|| Hermes 任务以 OpenAI 格式发送 | 检查 Agent 注册时的 `dialect` 字段 | Agent 注册了错误的 `dialect`。Hermes 必须用 `"hermes"`，OpenClaw 必须用 `"openclaw"`。 |
   307|| OpenClaw 任务以 MCP 格式发送 | 同上 | 同上——确认 `dialect` 字段与 Agent 类型一致。 |
   308|| API 调用返回 401 | 确认 `Authorization: Bearer` 请求头 | Token 缺失或不匹配。 |
   309|| Daemon 未派发 | `docker compose logs nexus-daemon --since=10m` | 无待处理任务、所有 Agent 离线、或 Daemon 未运行。 |
   310|| 某个 Agent 无 Telegram 通知 | 检查 `AGENT_NOTIFICATIONS` 中该 `agent_id` 的配置 | 该 Agent 的 bot 配置缺失或配置错误。 |
   311|
   312|---
   313|
   314|## 下一步
   315|
   316|- [Hermes Agent 接入教程](./hermes-agent.zh-CN.md) — 详细的 Hermes 配置
   317|- [OpenClaw Agent 接入教程](./openclaw-agent.zh-CN.md) — 详细的 OpenClaw 配置
   318|- [安装与部署指南](../install.zh-CN.md) — 完整部署参考
   319|