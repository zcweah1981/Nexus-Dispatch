     1|# 雙系統 Agent 接入教程：Hermes + OpenClaw
     2|
     3|[English](./dual-agent.md) · [简体中文](./dual-agent.zh-CN.md) · [繁體中文](./dual-agent.zh-TW.md)
     4|
     5|---
     6|
     7|## 概述
     8|
     9|本教程說明如何在同一個 Nexus Dispatch 實例上同時執行 **Hermes 和 OpenClaw Worker**。PM Daemon 根據每個 Agent 的**泳道 (lane)** 和**方言 (dialect)** 將任務路由到正確的 Worker——編碼任務走 OpenClaw，內容任務走 Hermes——統一在一個控制平面下管理。
    10|
    11|**適合誰：** 使用多種 Agent 類型、希望有統一派單/追蹤/驗收系統的團隊。
    12|
    13|![雙系統架構](../assets/guide/dual-system-architecture.png)
    14|
    15|---
    16|
    17|## 前置條件
    18|
    19|開始之前，請確保：
    20|
    21|| 要求 | 驗證方式 |
    22|| --- | --- |
    23|| Nexus Dispatch API Server 已執行 | `curl -I http://localhost:8000/api/v1/events/stream` |
    24|| 環境變數 `API_AUTH_TOKEN` 已設定 | `echo $API_AUTH_TOKEN`（不能為空） |
    25|| Hermes Agent 已安裝且 gateway 已設定 | `hermes --version` 和 `hermes gateway status` |
    26|| OpenClaw 已安裝且端點可達 | `curl -I http://your-openclaw-host:8647/v1/runs` |
    27|| PM Daemon 已執行 | `docker compose ps nexus-daemon` 或 `systemctl status nexus-dispatch-daemon` |
    28|| Nexus 中已建立專案 | 參見[安裝與部署指南](../install.zh-TW.md) §3.4 |
    29|
    30|---
    31|
    32|## 路由原理
    33|
    34|Nexus Dispatch 使用兩個維度來將任務發送到正確的 Agent：
    35|
    36|| 維度 | 作用 | 範例 |
    37|| --- | --- | --- |
    38|| **Lane（泳道）** | 識別工作類型。任務和 Agent 必須屬於同一泳道才能匹配。 | `DEV`、`CONTENT`、`DESIGN` |
    39|| **Dialect（方言）** | 決定派發時的傳輸格式。Daemon 根據方言選擇正確的轉接器。 | `hermes` → HermesMCPAdapter，`openclaw` → OpenClawAdapter |
    40|
    41|```
    42|PM Daemon (tick 迴圈)
    43|  │
    44|  │ 1. 取得待處理任務
    45|  │ 2. 對每個任務，尋找 lane 匹配的線上 Agent
    46|  │ 3. 選擇 Agent（優先順序 + 並行控制）
    47|  │ 4. 查詢 agent.dialect → 選擇轉接器
    48|  │
    49|  ├─ dialect: "hermes" ──→ HermesMCPAdapter ──→ POST 到 Hermes 端點
    50|  │                                              (MCP intent 格式)
    51|  │
    52|  └─ dialect: "openclaw" ─→ OpenClawAdapter ──→ POST 到 OpenClaw 端點
    53|                                               (OpenAI messages 格式)
    54|```
    55|
    56|**結果：** 一個 Nexus 實例可以同時將編碼任務派發到 OpenClaw、內容任務派發到 Hermes。每個 Agent 以自己的原生格式處理任務。
    57|
    58|---
    59|
    60|## 第 1 步：註冊兩個 Agent
    61|
    62|分別註冊一個 Hermes Worker（內容任務）和一個 OpenClaw Worker（編碼任務）：
    63|
    64|### 1a. 註冊 Hermes Worker（CONTENT 泳道）
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
    83|### 1b. 註冊 OpenClaw Worker（DEV 泳道）
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
   102|> ⚠️ **OpenClaw 版本說明：** 預設連接埠 `8647` 和路徑 `/v1/runs` 基於 Nexus Dispatch 參考設定。請以實際版本為準，透過指令驗證你安裝的 OpenClaw 版本。
   103|
   104|---
   105|
   106|## 第 2 步：驗證兩個 Agent 均已註冊
   107|
   108|```bash
   109|curl -sS \
   110|  "http://localhost:${NEXUS_API_PORT:-8000}/api/v1/runtime/projects/${NEXUS_PROJECT_ID:-nexus-dispatch}/agents" \
   111|  -H "Authorization: Bearer ${API_AUTH_TOKEN}"
   112|```
   113|
   114|**預期回應**應顯示兩個 Agent：
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
   137|確認兩個 Agent 都顯示 `"status": "online"` 且 `dialect` 值正確。
   138|
   139|---
   140|
   141|## 第 3 步：為每個泳道建立任務
   142|
   143|### 3a. 內容任務 → 路由到 Hermes
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
   165|### 3b. 編碼任務 → 路由到 OpenClaw
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
   189|## 第 4 步：驗證路由
   190|
   191|PM Daemon 執行時會自動：
   192|1. 取得兩個待處理任務
   193|2. 匹配 `content-task-001`（lane: CONTENT）→ `hermes-content-1`（dialect: hermes）
   194|3. 匹配 `dev-task-001`（lane: DEV）→ `long-coder-1`（dialect: openclaw）
   195|4. 使用正確的轉接器分別派發
   196|
   197|檢查任務狀態：
   198|
   199|```bash
   200|# 檢查內容任務
   201|curl -sS \
   202|  "http://localhost:${NEXUS_API_PORT:-8000}/api/v1/runtime/tasks/content-task-001?project_id=nexus-dispatch" \
   203|  -H "Authorization: Bearer ${API_AUTH_TOKEN}"
   204|
   205|# 檢查編碼任務
   206|curl -sS \
   207|  "http://localhost:${NEXUS_API_PORT:-8000}/api/v1/runtime/tasks/dev-task-001?project_id=nexus-dispatch" \
   208|  -H "Authorization: Bearer ${API_AUTH_TOKEN}"
   209|```
   210|
   211|兩個任務都應沿狀態機推進：`created` → `dispatched` → `in_progress` → `completed`。
   212|
   213|### 手動驅動生命週期（Daemon 未執行時）
   214|
   215|```bash
   216|# 內容任務
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
   230|# 編碼任務
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
   247|## 第 5 步：驗證完成
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
   259|**預期：** 兩個都應回傳 `"completed"`。
   260|
   261|---
   262|
   263|## Telegram 通知設定
   264|
   265|每個 Agent 必須設定**自己的** Telegram bot。Daemon 嚴禁代發。
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
   280|**規則：**
   281|- 每個 agent_id 對應自己的 bot_token。嚴禁在 Agent 之間共享 bot token。
   282|- 兩個 Agent 可以發到同一個群組（相同 `chat_id`），也可以發到不同群組。
   283|- 群組中的可見訊息必須人類可讀——不得包含原始 JSON、任務 ID 或 Token。
   284|- 完整的追蹤資料儲存在資料庫和 Runtime proof 中。
   285|
   286|---
   287|
   288|## 並行與排程
   289|
   290|| 場景 | 行為 |
   291|| --- | --- |
   292|| 兩個任務，不同泳道 | 同時派發到不同 Agent。 |
   293|| 兩個任務，同一泳道，Agent `max_concurrency: 1` | 依序處理。 |
   294|| 兩個任務，同一泳道，Agent `max_concurrency: 2` | 同一 Agent 並行處理。 |
   295|| 沒有 Agent 匹配任務的泳道 | 任務保持 `pending`，直到匹配的 Agent 上線。 |
   296|
   297|---
   298|
   299|## 疑難排解
   300|
   301|| 症狀 | 檢查指令 | 常見原因 / 解決方案 |
   302|| --- | --- | --- |
   303|| 任務卡在 `pending` | `curl -sS .../agents` — 確認至少有一個 Agent 匹配任務的泳道 | 沒有線上 Agent 匹配該泳道，或所有匹配 Agent 已達最大並行。 |
   304|| 錯誤的 Agent 接了任務 | 檢查任務的 `lane_required` 與 Agent 的 `lane` 欄位 | 泳道不匹配——確保任務泳道與目標 Agent 的泳道一致。 |
   305|| 一個 Agent 收到所有任務 | 檢查註冊 Agent 的 `lane` 值 | 多個 Agent 註冊了同一泳道。用不同泳道路由。 |
   306|| Hermes 任務以 OpenAI 格式發送 | 檢查 Agent 註冊時的 `dialect` 欄位 | Agent 註冊了錯誤的 `dialect`。Hermes 必須用 `"hermes"`，OpenClaw 必須用 `"openclaw"`。 |
   307|| OpenClaw 任務以 MCP 格式發送 | 同上 | 同上——確認 `dialect` 欄位與 Agent 類型一致。 |
   308|| API 呼叫回傳 401 | 確認 `Authorization: Bearer` 請求標頭 | Token 缺失或不匹配。 |
   309|| Daemon 未派發 | `docker compose logs nexus-daemon --since=10m` | 無待處理任務、所有 Agent 離線、或 Daemon 未執行。 |
   310|| 某個 Agent 無 Telegram 通知 | 檢查 `AGENT_NOTIFICATIONS` 中該 `agent_id` 的設定 | 該 Agent 的 bot 設定缺失或設定錯誤。 |
   311|
   312|---
   313|
   314|## 下一步
   315|
   316|- [Hermes Agent 接入教程](./hermes-agent.zh-TW.md) — 詳細的 Hermes 設定
   317|- [OpenClaw Agent 接入教程](./openclaw-agent.zh-TW.md) — 詳細的 OpenClaw 設定
   318|- [安裝與部署指南](../install.zh-TW.md) — 完整部署參考
   319|