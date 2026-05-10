     1|# OpenClaw Agent 接入教程
     2|
     3|[English](./openclaw-agent.md) · [简体中文](./openclaw-agent.zh-CN.md) · [繁體中文](./openclaw-agent.zh-TW.md)
     4|
     5|---
     6|
     7|## 概述
     8|
     9|本教程說明如何將 **OpenClaw Agent** 作為 Worker 接入 Nexus Dispatch 控制平面。接入完成後，PM Daemon 會自動使用 OpenAI 相容的 messages 格式將任務派發到你的 OpenClaw 實例，Worker 透過 Runtime API 提交驗收憑證。
    10|
    11|**適合誰：** 正在執行 OpenClaw（或任何 OpenAI 相容的編碼 Agent）、希望它自動接收並執行 Nexus Dispatch 派發任務的開發者和維運人員。
    12|
    13|![OpenClaw 整合](../assets/guide/openclaw-integration.png)
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
    25|| OpenClaw 已安裝並設定 | 用你的安裝方式驗證 |
    26|| OpenClaw Worker 端點可達 | `curl -I http://your-openclaw-host:8647/v1/runs` |
    27|| Nexus 中已建立專案 | 參見[安裝與部署指南](../install.zh-TW.md) §3.4 |
    28|
    29|> ⚠️ **版本說明：** OpenClaw 的 CLI 標誌、預設連接埠和端點路徑可能因版本而異。請以實際版本為準，透過指令驗證。本教程中的端點路徑 `/v1/runs` 基於 Nexus Dispatch 預設設定——如果你的 OpenClaw 實例使用不同的路由，請相應調整。
    30|
    31|---
    32|
    33|## 架構說明
    34|
    35|當 Daemon 向 OpenClaw 類型 Worker 派發任務時：
    36|
    37|```
    38|PM Daemon
    39|  │
    40|  │ 選取任務 + 匹配 Agent (dialect: "openclaw")
    41|  │
    42|  ▼
    43|OpenClawAdapter.adapt()
    44|  │
    45|  │ 將任務轉換為 OpenAI messages 載荷：
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
    57|POST → OpenClaw Worker 端點 (/v1/runs)
    58|  │
    59|  │ OpenClaw 接收 messages，執行任務，
    60|  │ 透過 Runtime API 提交驗收憑證
    61|  │
    62|  ▼
    63|POST /api/v1/runtime/reports  (憑證 + 交付物)
    64|POST /api/v1/runtime/tasks/transition  (狀態變更)
    65|```
    66|
    67|**關鍵點：** OpenClaw Worker 接收 OpenAI 相容的聊天訊息格式，並附帶工具定義。你的端點必須能理解 `{ messages, tools }` 格式並處理 `submit_proof` 工具呼叫。
    68|
    69|---
    70|
    71|## 第 1 步：註冊 OpenClaw Agent
    72|
    73|將你的 OpenClaw 實例註冊為 Nexus Dispatch 的 Worker：
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
    92|**欄位說明：**
    93|
    94|| 欄位 | 說明 |
    95|| --- | --- |
    96|| `agent_id` | Worker 的唯一識別碼。建議使用描述性名稱，如 `long-coder-1`。 |
    97|| `endpoint` | 你的 OpenClaw 實例接收派發載荷的 URL。預設：`http://host:8647/v1/runs`。 |
    98|| `lane` | 該 Agent 負責的工作類型：`DEV`、`CONTENT`、`DESIGN` 等。 |
    99|| `dialect` | OpenClaw 類型 Worker 必須設為 `"openclaw"`。 |
   100|| `soul_prompt` | Agent 處理任務時注入 messages 載荷的系統層級指令。 |
   101|| `tools_allowed` | Agent 被允許使用的工具集。 |
   102|| `max_concurrency` | 最大並行任務數。大多數場景建議設為 `1`。 |
   103|| `status` | 設為 `"online"` 可立即開始接收任務。 |
   104|
   105|> ⚠️ **以實際版本為準：** 預設連接埠 `8647` 和端點路徑 `/v1/runs` 基於 Nexus Dispatch 參考設定。你的 OpenClaw 版本可能使用不同的連接埠或路徑——請透過指令驗證你的實際版本。
   106|
   107|---
   108|
   109|## 第 2 步：驗證註冊
   110|
   111|確認 Agent 已成功註冊：
   112|
   113|```bash
   114|curl -sS \
   115|  "http://localhost:${NEXUS_API_PORT:-8000}/api/v1/runtime/projects/${NEXUS_PROJECT_ID:-nexus-dispatch}/agents" \
   116|  -H "Authorization: Bearer ${API_AUTH_TOKEN}"
   117|```
   118|
   119|**預期回應**應包含你的 Agent：
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
   137|## 第 3 步：建立測試任務
   138|
   139|建立一個簡單任務來測試整合：
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
   162|## 第 4 步：驅動任務生命週期
   163|
   164|如果手動測試（Daemon 未執行），用以下轉換驅動生命週期：
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
   181|如果 PM Daemon 正在執行，它會自動處理派發。OpenClaw Worker 應該：
   182|1. 在其端點接收 OpenAI messages 載荷
   183|2. 使用 `submit_proof` 工具和其他可用工具執行任務
   184|3. 透過 `POST /api/v1/runtime/reports` 提交驗收憑證
   185|4. 透過 `POST /api/v1/runtime/tasks/transition` 變更任務狀態
   186|
   187|---
   188|
   189|## 第 5 步：驗證任務完成
   190|
   191|```bash
   192|curl -sS \
   193|  "http://localhost:${NEXUS_API_PORT:-8000}/api/v1/runtime/tasks/openclaw-test-001?project_id=nexus-dispatch" \
   194|  -H "Authorization: Bearer ${API_AUTH_TOKEN}"
   195|```
   196|
   197|**預期：** `status` 欄位應為 `"completed"`。
   198|
   199|---
   200|
   201|## OpenClaw Worker 端點要求
   202|
   203|你的 OpenClaw 實例必須暴露一個 HTTP 端點，滿足以下條件：
   204|
   205|1. **接受 POST** 請求，JSON body 為 OpenAI messages 格式：
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
   237|2. **回傳回應**，包含工具呼叫（包括 `submit_proof`）和執行結果。
   238|
   239|3. **向 Nexus Runtime API 提交憑證**：
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
   254|> ⚠️ **以實際版本為準 / verify with command：** 確切的請求/回應格式取決於你的 OpenClaw 版本。請查閱你特定版本的 OpenClaw 文件確認 API 契約。
   255|
   256|---
   257|
   258|## Telegram 通知設定
   259|
   260|每個 Agent 透過**自己的** Telegram bot 發送通知。在環境變數中設定：
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
   271|**規則：**
   272|- 嚴禁使用 Daemon bot 或 PM bot 代替 Agent 發送通知。
   273|- 群組中的可見訊息必須人類可讀——不得包含原始 JSON、任務 ID 或 Token。
   274|- 完整的追蹤資料儲存在資料庫和 Runtime proof 中。
   275|
   276|---
   277|
   278|## 疑難排解
   279|
   280|| 症狀 | 檢查指令 | 常見原因 / 解決方案 |
   281|| --- | --- | --- |
   282|| Agent 未收到任務 | `curl -sS .../agents` — 確認 `status: "online"` 和 `dialect: "openclaw"` | Agent 狀態為 offline，或 lane 與待處理任務不匹配。 |
   283|| Daemon 未派發 | 檢查 Daemon 日誌：`docker compose logs nexus-daemon --since=10m` | 無待處理任務、Agent 未上線、lane 不匹配、或 Worker 端點不可達。 |
   284|| Worker 端點回傳錯誤 | `curl -X POST http://your-openclaw-host:8647/v1/runs -d '{}'` | OpenClaw 未執行、連接埠錯誤、防火牆阻擋。 |
   285|| API 呼叫回傳 401 | 確認 `Authorization: Bearer` 請求標頭與 `API_AUTH_TOKEN` 一致 | Token 缺失、不匹配、或未在環境中設定。 |
   286|| 驗收憑證未被接受 | 檢查任務狀態：`GET /api/v1/runtime/tasks/{id}?project_id=...` | 任務可能已處於終態，或狀態轉換序列錯誤。 |
   287|| Adapter 載荷不匹配 | 檢查 Daemon 日誌中的 adapter 錯誤 | OpenClaw 版本可能期望不同的訊息格式。以實際版本為準進行驗證。 |
   288|| Telegram 無通知 | 確認 `AGENT_NOTIFICATIONS` JSON 和 bot 權限 | 缺少 Agent 的 bot 設定、token/chat_id 錯誤、bot 缺少群組權限。 |
   289|
   290|---
   291|
   292|## 下一步
   293|
   294|- [Hermes Agent 接入教程](./hermes-agent.zh-TW.md) — 接入 Hermes Worker
   295|- [雙系統 Agent 接入教程](./dual-agent.zh-TW.md) — 同時執行 Hermes 和 OpenClaw
   296|- [安裝與部署指南](../install.zh-TW.md) — 完整部署參考
   297|