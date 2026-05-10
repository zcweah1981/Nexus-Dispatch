# OpenClaw Agent 接入教程

[English](./openclaw-agent.md) · [简体中文](./openclaw-agent.zh-CN.md) · [繁體中文](./openclaw-agent.zh-TW.md)

---

## 概述

本教程說明如何將 **OpenClaw Agent** 作為 Worker 接入 Nexus Dispatch 控制平面。接入完成後，PM Daemon 會自動使用 OpenAI 相容的 messages 格式將任務派發到你的 OpenClaw 實例，Worker 透過 Runtime API 提交驗收憑證。

**適合誰：** 正在執行 OpenClaw（或任何 OpenAI 相容的編碼 Agent）、希望它自動接收並執行 Nexus Dispatch 派發任務的開發者和維運人員。

![OpenClaw 整合](../assets/guide/openclaw-integration.png)

---

## 前置條件

開始之前，請確保：

| 要求 | 驗證方式 |
| --- | --- |
| Nexus Dispatch API Server 已執行 | `curl -I http://localhost:8000/api/v1/events/stream` |
| 環境變數 `API_AUTH_TOKEN` 已設定 | `echo $API_AUTH_TOKEN`（不能為空） |
| OpenClaw 已安裝並設定 | 用你的安裝方式驗證 |
| OpenClaw Worker 端點可達 | `curl -I http://your-openclaw-host:8647/v1/runs` |
| Nexus 中已建立專案 | 參見[安裝與部署指南](../install.zh-TW.md) §3.4 |

> ⚠️ **版本說明：** OpenClaw 的 CLI 標誌、預設連接埠和端點路徑可能因版本而異。請以實際版本為準，透過指令驗證。本教程中的端點路徑 `/v1/runs` 基於 Nexus Dispatch 預設設定——如果你的 OpenClaw 實例使用不同的路由，請相應調整。

---

## 架構說明

當 Daemon 向 OpenClaw 類型 Worker 派發任務時：

```
PM Daemon
  │
  │ 選取任務 + 匹配 Agent (dialect: "openclaw")
  │
  ▼
OpenClawAdapter.adapt()
  │
  │ 將任務轉換為 OpenAI messages 載荷：
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
POST → OpenClaw Worker 端點 (/v1/runs)
  │
  │ OpenClaw 接收 messages，執行任務，
  │ 透過 Runtime API 提交驗收憑證
  │
  ▼
POST /api/v1/runtime/reports  (憑證 + 交付物)
POST /api/v1/runtime/tasks/transition  (狀態變更)
```

**關鍵點：** OpenClaw Worker 接收 OpenAI 相容的聊天訊息格式，並附帶工具定義。你的端點必須能理解 `{ messages, tools }` 格式並處理 `submit_proof` 工具呼叫。

---

## 第 1 步：註冊 OpenClaw Agent

將你的 OpenClaw 實例註冊為 Nexus Dispatch 的 Worker：

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

**欄位說明：**

| 欄位 | 說明 |
| --- | --- |
| `agent_id` | Worker 的唯一識別碼。建議使用描述性名稱，如 `long-coder-1`。 |
| `endpoint` | 你的 OpenClaw 實例接收派發載荷的 URL。預設：`http://host:8647/v1/runs`。 |
| `lane` | 該 Agent 負責的工作類型：`DEV`、`CONTENT`、`DESIGN` 等。 |
| `dialect` | OpenClaw 類型 Worker 必須設為 `"openclaw"`。 |
| `soul_prompt` | Agent 處理任務時注入 messages 載荷的系統層級指令。 |
| `tools_allowed` | Agent 被允許使用的工具集。 |
| `max_concurrency` | 最大並行任務數。大多數場景建議設為 `1`。 |
| `status` | 設為 `"online"` 可立即開始接收任務。 |

> ⚠️ **以實際版本為準：** 預設連接埠 `8647` 和端點路徑 `/v1/runs` 基於 Nexus Dispatch 參考設定。你的 OpenClaw 版本可能使用不同的連接埠或路徑——請透過指令驗證你的實際版本。

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

## 第 3 步：建立測試任務

建立一個簡單任務來測試整合：

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
      \"task_id\": \"openclaw-test-001\",
      \"event\": \"${event}\",
      \"proof\": { \"source\": \"long-coder-1\", \"type\": \"integration-test\" }
    }"
done
```

如果 PM Daemon 正在執行，它會自動處理派發。OpenClaw Worker 應該：
1. 在其端點接收 OpenAI messages 載荷
2. 使用 `submit_proof` 工具和其他可用工具執行任務
3. 透過 `POST /api/v1/runtime/reports` 提交驗收憑證
4. 透過 `POST /api/v1/runtime/tasks/transition` 變更任務狀態

---

## 第 5 步：驗證任務完成

```bash
curl -sS \
  "http://localhost:${NEXUS_API_PORT:-8000}/api/v1/runtime/tasks/openclaw-test-001?project_id=nexus-dispatch" \
  -H "Authorization: Bearer ${API_AUTH_TOKEN}"
```

**預期：** `status` 欄位應為 `"completed"`。

---

## OpenClaw Worker 端點要求

你的 OpenClaw 實例必須暴露一個 HTTP 端點，滿足以下條件：

1. **接受 POST** 請求，JSON body 為 OpenAI messages 格式：
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

2. **回傳回應**，包含工具呼叫（包括 `submit_proof`）和執行結果。

3. **向 Nexus Runtime API 提交憑證**：
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

> ⚠️ **以實際版本為準 / verify with command：** 確切的請求/回應格式取決於你的 OpenClaw 版本。請查閱你特定版本的 OpenClaw 文件確認 API 契約。

---

## Telegram 通知設定

每個 Agent 透過**自己的** Telegram bot 發送通知。在環境變數中設定：

```bash
AGENT_NOTIFICATIONS='{
  "long-coder-1": {
    "bot_token": "${LONG_CODER_BOT_TOKEN}",
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
| Agent 未收到任務 | `curl -sS .../agents` — 確認 `status: "online"` 和 `dialect: "openclaw"` | Agent 狀態為 offline，或 lane 與待處理任務不匹配。 |
| Daemon 未派發 | 檢查 Daemon 日誌：`docker compose logs nexus-daemon --since=10m` | 無待處理任務、Agent 未上線、lane 不匹配、或 Worker 端點不可達。 |
| Worker 端點回傳錯誤 | `curl -X POST http://your-openclaw-host:8647/v1/runs -d '{}'` | OpenClaw 未執行、連接埠錯誤、防火牆阻擋。 |
| API 呼叫回傳 401 | 確認 `Authorization: Bearer` 請求標頭與 `API_AUTH_TOKEN` 一致 | Token 缺失、不匹配、或未在環境中設定。 |
| 驗收憑證未被接受 | 檢查任務狀態：`GET /api/v1/runtime/tasks/{id}?project_id=...` | 任務可能已處於終態，或狀態轉換序列錯誤。 |
| Adapter 載荷不匹配 | 檢查 Daemon 日誌中的 adapter 錯誤 | OpenClaw 版本可能期望不同的訊息格式。以實際版本為準進行驗證。 |
| Telegram 無通知 | 確認 `AGENT_NOTIFICATIONS` JSON 和 bot 權限 | 缺少 Agent 的 bot 設定、token/chat_id 錯誤、bot 缺少群組權限。 |

---

## 下一步

- [Hermes Agent 接入教程](./hermes-agent.zh-TW.md) — 接入 Hermes Worker
- [雙系統 Agent 接入教程](./dual-agent.zh-TW.md) — 同時執行 Hermes 和 OpenClaw
- [安裝與部署指南](../install.zh-TW.md) — 完整部署參考
