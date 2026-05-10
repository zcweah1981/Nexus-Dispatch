     1|# Hermes Agent 接入教程
     2|
     3|[English](./hermes-agent.md) · [简体中文](./hermes-agent.zh-CN.md) · [繁體中文](./hermes-agent.zh-TW.md)
     4|
     5|---
     6|
     7|## 概述
     8|
     9|本教程說明如何將 **Hermes Agent** 作為 Worker 接入 Nexus Dispatch 控制平面。接入完成後，PM Daemon 會自動將任務派發到你的 Hermes 實例，Hermes 執行任務並透過 Runtime API 提交驗收憑證。
    10|
    11|**適合誰：** 正在執行 Hermes Agent、希望它自動接收並執行 Nexus Dispatch 派發任務的開發者和維運人員。
    12|
    13|![Hermes 整合](../assets/guide/hermes-integration.png)
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
    25|| Hermes Agent 已安裝 | `hermes --version` |
    26|| Hermes gateway 已設定（用於 Telegram 通知） | `hermes gateway status` |
    27|| Nexus 中已建立專案 | 參見[安裝與部署指南](../install.zh-TW.md) §3.4 |
    28|
    29|---
    30|
    31|## 架構說明
    32|
    33|當 Daemon 向 Hermes 類型 Worker 派發任務時：
    34|
    35|```
    36|PM Daemon
    37|  │
    38|  │ 選取任務 + 匹配 Agent (dialect: "hermes")
    39|  │
    40|  ▼
    41|HermesMCPAdapter.adapt()
    42|  │
    43|  │ 將任務轉換為 MCP intent 載荷：
    44|  │ {
    45|  │   "mcp_intent": "execute_task",
    46|  │   "task_id": "...",
    47|  │   "parameters": { "title": "...", "description": "..." },
    48|  │   "expected_artifact": "mcp_tool_call"
    49|  │ }
    50|  │
    51|  ▼
    52|POST → Hermes Worker 端點
    53|  │
    54|  │ Hermes 接收 intent，執行任務，
    55|  │ 透過 Runtime API 提交驗收憑證
    56|  │
    57|  ▼
    58|POST /api/v1/runtime/reports  (憑證 + 交付物)
    59|POST /api/v1/runtime/tasks/transition  (狀態變更)
    60|```
    61|
    62|**關鍵點：** Hermes Worker 接收的是 MCP 風格的 intent 載荷，不是原始 OpenAI messages 格式。你的 Hermes 端點必須能理解 `{ mcp_intent, task_id, parameters }` 格式。
    63|
    64|---
    65|
    66|## 第 1 步：註冊 Hermes Agent
    67|
    68|將你的 Hermes 實例註冊為 Nexus Dispatch 的 Worker：
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
    87|**欄位說明：**
    88|
    89|| 欄位 | 說明 |
    90|| --- | --- |
    91|| `agent_id` | Worker 的唯一識別碼。建議使用描述性名稱，如 `hermes-content-1`。 |
    92|| `endpoint` | 你的 Hermes 實例接收 MCP intent 載荷的 URL。 |
    93|| `lane` | 該 Agent 負責的工作類型：`DEV`、`CONTENT`、`DESIGN` 等。 |
    94|| `dialect` | Hermes 類型 Worker 必須設為 `"hermes"`。 |
    95|| `soul_prompt` | Agent 處理任務時注入的系統層級指令。 |
    96|| `tools_allowed` | Agent 被允許使用的工具集。 |
    97|| `max_concurrency` | 最大並行任務數。大多數場景建議設為 `1`。 |
    98|| `status` | 設為 `"online"` 可立即開始接收任務。 |
    99|
   100|---
   101|
   102|## 第 2 步：驗證註冊
   103|
   104|確認 Agent 已成功註冊：
   105|
   106|```bash
   107|curl -sS \
   108|  "http://localhost:${NEXUS_API_PORT:-8000}/api/v1/runtime/projects/${NEXUS_PROJECT_ID:-nexus-dispatch}/agents" \
   109|  -H "Authorization: Bearer ${API_AUTH_TOKEN}"
   110|```
   111|
   112|**預期回應**應包含你的 Agent：
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
   130|## 第 3 步：建立測試任務
   131|
   132|建立一個簡單任務來測試整合：
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
   155|## 第 4 步：驅動任務生命週期
   156|
   157|如果手動測試（Daemon 未執行），用以下轉換驅動生命週期：
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
   174|如果 PM Daemon 正在執行，它會自動處理派發。Hermes Worker 應該：
   175|1. 在其端點接收 MCP intent 載荷
   176|2. 使用設定的工具執行任務
   177|3. 透過 `POST /api/v1/runtime/reports` 提交驗收憑證
   178|4. 透過 `POST /api/v1/runtime/tasks/transition` 變更任務狀態
   179|
   180|---
   181|
   182|## 第 5 步：驗證任務完成
   183|
   184|```bash
   185|curl -sS \
   186|  "http://localhost:${NEXUS_API_PORT:-8000}/api/v1/runtime/tasks/hermes-test-001?project_id=nexus-dispatch" \
   187|  -H "Authorization: Bearer ${API_AUTH_TOKEN}"
   188|```
   189|
   190|**預期：** `status` 欄位應為 `"completed"`。
   191|
   192|---
   193|
   194|## Hermes Worker 端點要求
   195|
   196|你的 Hermes 實例必須暴露一個 HTTP 端點，滿足以下條件：
   197|
   198|1. **接受 POST** 請求，JSON body 為 MCP intent 格式：
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
   211|2. **回傳回應**並包含執行憑證。
   212|
   213|3. **向 Nexus Runtime API 提交憑證**：
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
   228|### 用 Hermes 架設端點
   229|
   230|你可以透過 gateway 模式執行 Hermes，並設定 webhook 來處理接收到的 intent：
   231|
   232|```bash
   233|# 啟動 Hermes gateway
   234|hermes gateway run
   235|
   236|# 或設定特定的 webhook 路由
   237|hermes webhook subscribe nexus-intent
   238|```
   239|
   240|也可以用自訂腳本在端點上監聽，然後分發給 `hermes chat -q`：
   241|
   242|```bash
   243|# 單次執行模式
   244|hermes chat -q "Execute task: {task_title}. Description: {task_description}"
   245|```
   246|
   247|---
   248|
   249|## Telegram 通知設定
   250|
   251|每個 Agent 透過**自己的** Telegram bot 發送通知。在環境變數中設定：
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
   262|**規則：**
   263|- 嚴禁使用 Daemon bot 或 PM bot 代替 Agent 發送通知。
   264|- 群組中的可見訊息必須人類可讀——不得包含原始 JSON、任務 ID 或 Token。
   265|- 完整的追蹤資料儲存在資料庫和 Runtime proof 中。
   266|
   267|---
   268|
   269|## 疑難排解
   270|
   271|| 症狀 | 檢查指令 | 常見原因 / 解決方案 |
   272|| --- | --- | --- |
   273|| Agent 未收到任務 | `curl -sS .../agents` — 確認 `status: "online"` 和 `dialect: "hermes"` | Agent 狀態為 offline，或 lane 與待處理任務不匹配。 |
   274|| Daemon 未派發 | 檢查 Daemon 日誌：`docker compose logs nexus-daemon --since=10m` | 無待處理任務、Agent 未上線、lane 不匹配、或 Worker 端點不可達。 |
   275|| Worker 端點回傳錯誤 | `curl -X POST http://your-hermes-host:8080/intent -d '{}'` | Hermes gateway 未執行、連接埠錯誤、防火牆阻擋。 |
   276|| API 呼叫回傳 401 | 確認 `Authorization: Bearer` 請求標頭與 `API_AUTH_TOKEN` 一致 | Token 缺失、不匹配、或未在環境中設定。 |
   277|| 驗收憑證未被接受 | 檢查任務狀態：`GET /api/v1/runtime/tasks/{id}?project_id=...` | 任務可能已處於終態，或狀態轉換序列錯誤。 |
   278|| Hermes MCP 報錯 | `hermes doctor` 並檢查日誌 | Hermes 未設定 MCP，或缺少 skill/plugin。 |
   279|| Telegram 無通知 | 確認 `AGENT_NOTIFICATIONS` JSON 和 bot 權限 | 缺少 Agent 的 bot 設定、token/chat_id 錯誤、bot 缺少群組權限。 |
   280|
   281|---
   282|
   283|## 下一步
   284|
   285|- [OpenClaw Agent 接入教程](./openclaw-agent.zh-TW.md) — 接入 OpenClaw Worker
   286|- [雙系統 Agent 接入教程](./dual-agent.zh-TW.md) — 同時執行 Hermes 和 OpenClaw
   287|- [安裝與部署指南](../install.zh-TW.md) — 完整部署參考
   288|- [Hermes Agent 官方文件](https://hermes-agent.nousresearch.com/docs/) — Hermes 官方文件
   289|