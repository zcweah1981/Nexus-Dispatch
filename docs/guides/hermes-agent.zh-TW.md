# Hermes Agent 接入教程

[English](./hermes-agent.md) · [简体中文](./hermes-agent.zh-CN.md) · [繁體中文](./hermes-agent.zh-TW.md)

---

## 概述

本教程說明如何將 **Hermes Agent** 作為 Worker 接入 Nexus Dispatch 控制平面。接入完成後，PM Daemon 會自動將任務派發到你的 Hermes 實例，Hermes 執行任務並透過 Runtime API 提交驗收憑證。

**適合誰：** 正在執行 Hermes Agent、希望它自動接收並執行 Nexus Dispatch 派發任務的開發者和維運人員。

![Hermes 整合](../assets/guide/hermes-integration.png)

---

## 前置條件

開始之前，請確保：

| 要求 | 驗證方式 |
| --- | --- |
| Nexus Dispatch API Server 已執行 | `curl -I http://localhost:8000/api/v1/events/stream` |
| 環境變數 `API_AUTH_TOKEN` 已設定 | `echo $API_AUTH_TOKEN`（不能為空） |
| Hermes Agent 已安裝 | `hermes --version` |
| Hermes gateway 已設定（用於 Telegram 通知） | `hermes gateway status` |
| Nexus 中已建立專案 | 參見[安裝與部署指南](../install.zh-TW.md) §3.4 |

---

## 架構說明

當 Daemon 向 Hermes 類型 Worker 派發任務時：

```
PM Daemon
  │
  │ 選取任務 + 匹配 Agent (dialect: "hermes")
  │
  ▼
HermesMCPAdapter.adapt()
  │
  │ 將任務轉換為 MCP intent 載荷：
  │ {
  │   "mcp_intent": "execute_task",
  │   "task_id": "...",
  │   "parameters": { "title": "...", "description": "..." },
  │   "expected_artifact": "mcp_tool_call"
  │ }
  │
  ▼
POST → Hermes Worker 端點
  │
  │ Hermes 接收 intent，執行任務，
  │ 透過 Runtime API 提交驗收憑證
  │
  ▼
POST /api/v1/runtime/reports  (憑證 + 交付物)
POST /api/v1/runtime/tasks/transition  (狀態變更)
```

**關鍵點：** Hermes Worker 接收的是 MCP 風格的 intent 載荷，不是原始 OpenAI messages 格式。你的 Hermes 端點必須能理解 `{ mcp_intent, task_id, parameters }` 格式。

---

## 第 1 步：註冊 Hermes Agent

將你的 Hermes 實例註冊為 Nexus Dispatch 的 Worker：

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

**欄位說明：**

| 欄位 | 說明 |
| --- | --- |
| `agent_id` | Worker 的唯一識別碼。建議使用描述性名稱，如 `hermes-content-1`。 |
| `endpoint` | 你的 Hermes 實例接收 MCP intent 載荷的 URL。 |
| `lane` | 該 Agent 負責的工作類型：`DEV`、`CONTENT`、`DESIGN` 等。 |
| `dialect` | Hermes 類型 Worker 必須設為 `"hermes"`。 |
| `soul_prompt` | Agent 處理任務時注入的系統層級指令。 |
| `tools_allowed` | Agent 被允許使用的工具集。 |
| `max_concurrency` | 最大並行任務數。大多數場景建議設為 `1`。 |
| `status` | 設為 `"online"` 可立即開始接收任務。 |

---

## 第 2 步：驗證註冊

確認 Agent 已成功註冊：

```bash
curl -sS \
  "http://localhost:${NEXUS_API_PORT:-8000}/api/v1/runtime/projects/${NEXUS_PROJECT_ID:-nexus-dispatch}/agents" \
  -H "Authorization: Bearer ${API_AUTH_TOKEN}"
```

**預期回應**應包含你的 Agent：

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

## 第 3 步：建立測試任務

建立一個簡單任務來測試整合：

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

## 第 4 步：驅動任務生命週期

如果手動測試（Daemon 未執行），用以下轉換驅動生命週期：

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

如果 PM Daemon 正在執行，它會自動處理派發。Hermes Worker 應該：
1. 在其端點接收 MCP intent 載荷
2. 使用設定的工具執行任務
3. 透過 `POST /api/v1/runtime/reports` 提交驗收憑證
4. 透過 `POST /api/v1/runtime/tasks/transition` 變更任務狀態

---

## 第 5 步：驗證任務完成

```bash
curl -sS \
  "http://localhost:${NEXUS_API_PORT:-8000}/api/v1/runtime/tasks/hermes-test-001?project_id=nexus-dispatch" \
  -H "Authorization: Bearer ${API_AUTH_TOKEN}"
```

**預期：** `status` 欄位應為 `"completed"`。

---

## Hermes Worker 端點要求

你的 Hermes 實例必須暴露一個 HTTP 端點，滿足以下條件：

1. **接受 POST** 請求，JSON body 為 MCP intent 格式：
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

2. **回傳回應**並包含執行憑證。

3. **向 Nexus Runtime API 提交憑證**：
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

### 用 Hermes 架設端點

你可以透過 gateway 模式執行 Hermes，並設定 webhook 來處理接收到的 intent：

```bash
# 啟動 Hermes gateway
hermes gateway run

# 或設定特定的 webhook 路由
hermes webhook subscribe nexus-intent
```

也可以用自訂腳本在端點上監聽，然後分發給 `hermes chat -q`：

```bash
# 單次執行模式
hermes chat -q "Execute task: {task_title}. Description: {task_description}"
```

---

## Telegram 通知設定

每個 Agent 透過**自己的** Telegram bot 發送通知。在環境變數中設定：

```bash
AGENT_NOTIFICATIONS='{
  "hermes-worker-1": {
    "bot_token": "${HERMES_WORKER_BOT_TOKEN}",
    "chat_id": "${NEXUS_GROUP_CHAT_ID}"
  }
}'
```

**規則：**
- 嚴禁使用 Daemon bot 或 PM bot 代替 Agent 發送通知。
- 群組中的可見訊息必須人類可讀——不得包含原始 JSON、任務 ID 或 Token。
- 完整的追蹤資料儲存在資料庫和 Runtime proof 中。

---

## 疑難排解

| 症狀 | 檢查指令 | 常見原因 / 解決方案 |
| --- | --- | --- |
| Agent 未收到任務 | `curl -sS .../agents` — 確認 `status: "online"` 和 `dialect: "hermes"` | Agent 狀態為 offline，或 lane 與待處理任務不匹配。 |
| Daemon 未派發 | 檢查 Daemon 日誌：`docker compose logs nexus-daemon --since=10m` | 無待處理任務、Agent 未上線、lane 不匹配、或 Worker 端點不可達。 |
| Worker 端點回傳錯誤 | `curl -X POST http://your-hermes-host:8080/intent -d '{}'` | Hermes gateway 未執行、連接埠錯誤、防火牆阻擋。 |
| API 呼叫回傳 401 | 確認 `Authorization: Bearer` 請求標頭與 `API_AUTH_TOKEN` 一致 | Token 缺失、不匹配、或未在環境中設定。 |
| 驗收憑證未被接受 | 檢查任務狀態：`GET /api/v1/runtime/tasks/{id}?project_id=...` | 任務可能已處於終態，或狀態轉換序列錯誤。 |
| Hermes MCP 報錯 | `hermes doctor` 並檢查日誌 | Hermes 未設定 MCP，或缺少 skill/plugin。 |
| Telegram 無通知 | 確認 `AGENT_NOTIFICATIONS` JSON 和 bot 權限 | 缺少 Agent 的 bot 設定、token/chat_id 錯誤、bot 缺少群組權限。 |

---

## 下一步

- [OpenClaw Agent 接入教程](./openclaw-agent.zh-TW.md) — 接入 OpenClaw Worker
- [雙系統 Agent 接入教程](./dual-agent.zh-TW.md) — 同時執行 Hermes 和 OpenClaw
- [安裝與部署指南](../install.zh-TW.md) — 完整部署參考
- [Hermes Agent 官方文件](https://hermes-agent.nousresearch.com/docs/) — Hermes 官方文件
