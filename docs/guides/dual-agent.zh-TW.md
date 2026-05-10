# 雙系統 Agent 接入教程：Hermes + OpenClaw

[English](./dual-agent.md) · [简体中文](./dual-agent.zh-CN.md) · [繁體中文](./dual-agent.zh-TW.md)

---

## 概述

本教程說明如何在同一個 Nexus Dispatch 實例上同時執行 **Hermes 和 OpenClaw Worker**。PM Daemon 根據每個 Agent 的**泳道 (lane)** 和**方言 (dialect)** 將任務路由到正確的 Worker——編碼任務走 OpenClaw，內容任務走 Hermes——統一在一個控制平面下管理。

**適合誰：** 使用多種 Agent 類型、希望有統一派單/追蹤/驗收系統的團隊。

![雙系統架構](../assets/guide/dual-system-architecture.png)

---

## 前置條件

開始之前，請確保：

| 要求 | 驗證方式 |
| --- | --- |
| Nexus Dispatch API Server 已執行 | `curl -I http://localhost:8000/api/v1/events/stream` |
| 環境變數 `API_AUTH_TOKEN` 已設定 | `echo $API_AUTH_TOKEN`（不能為空） |
| Hermes Agent 已安裝且 gateway 已設定 | `hermes --version` 和 `hermes gateway status` |
| OpenClaw 已安裝且端點可達 | `curl -I http://your-openclaw-host:8647/v1/runs` |
| PM Daemon 已執行 | `docker compose ps nexus-daemon` 或 `systemctl status nexus-dispatch-daemon` |
| Nexus 中已建立專案 | 參見[安裝與部署指南](../install.zh-TW.md) §3.4 |

---

## 路由原理

Nexus Dispatch 使用兩個維度來將任務發送到正確的 Agent：

| 維度 | 作用 | 範例 |
| --- | --- | --- |
| **Lane（泳道）** | 識別工作類型。任務和 Agent 必須屬於同一泳道才能匹配。 | `DEV`、`CONTENT`、`DESIGN` |
| **Dialect（方言）** | 決定派發時的傳輸格式。Daemon 根據方言選擇正確的轉接器。 | `hermes` → HermesMCPAdapter，`openclaw` → OpenClawAdapter |

```
PM Daemon (tick 迴圈)
  │
  │ 1. 取得待處理任務
  │ 2. 對每個任務，尋找 lane 匹配的線上 Agent
  │ 3. 選擇 Agent（優先順序 + 並行控制）
  │ 4. 查詢 agent.dialect → 選擇轉接器
  │
  ├─ dialect: "hermes" ──→ HermesMCPAdapter ──→ POST 到 Hermes 端點
  │                                              (MCP intent 格式)
  │
  └─ dialect: "openclaw" ─→ OpenClawAdapter ──→ POST 到 OpenClaw 端點
                                               (OpenAI messages 格式)
```

**結果：** 一個 Nexus 實例可以同時將編碼任務派發到 OpenClaw、內容任務派發到 Hermes。每個 Agent 以自己的原生格式處理任務。

---

## 第 1 步：註冊兩個 Agent

分別註冊一個 Hermes Worker（內容任務）和一個 OpenClaw Worker（編碼任務）：

### 1a. 註冊 Hermes Worker（CONTENT 泳道）

```bash
curl -sS -X POST \
  "http://localhost:${NEXUS_API_PORT:-8000}/api/v1/runtime/projects/${NEXUS_PROJECT_ID:-nexus-dispatch}/agents" \
  -H "Authorization: Bearer ${API_AUTH_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{
    "agent_id": "hermes-content-1",
    "endpoint": "http://your-hermes-host:8080/intent",
    "lane": "CONTENT",
    "dialect": "hermes",
    "soul_prompt": "You are a content production agent. Write high-quality copy and submit proof.",
    "tools_allowed": ["web", "browser", "file", "terminal"],
    "max_concurrency": 1,
    "status": "online"
  }'
```

### 1b. 註冊 OpenClaw Worker（DEV 泳道）

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

> ⚠️ **OpenClaw 版本說明：** 預設連接埠 `8647` 和路徑 `/v1/runs` 基於 Nexus Dispatch 參考設定。請以實際版本為準，透過指令驗證你安裝的 OpenClaw 版本。

---

## 第 2 步：驗證兩個 Agent 均已註冊

```bash
curl -sS \
  "http://localhost:${NEXUS_API_PORT:-8000}/api/v1/runtime/projects/${NEXUS_PROJECT_ID:-nexus-dispatch}/agents" \
  -H "Authorization: Bearer ${API_AUTH_TOKEN}"
```

**預期回應**應顯示兩個 Agent：

```json
{
  "agents": [
    {
      "id": "hermes-content-1",
      "lane": "CONTENT",
      "dialect": "hermes",
      "status": "online",
      "endpoint": "http://your-hermes-host:8080/intent"
    },
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

確認兩個 Agent 都顯示 `"status": "online"` 且 `dialect` 值正確。

---

## 第 3 步：為每個泳道建立任務

### 3a. 內容任務 → 路由到 Hermes

```bash
curl -sS -X POST \
  "http://localhost:${NEXUS_API_PORT:-8000}/api/v1/runtime/tasks" \
  -H "Authorization: Bearer ${API_AUTH_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{
    "project_id": "nexus-dispatch",
    "id": "content-task-001",
    "title": "Write Landing Page Copy",
    "objective": "Produce trilingual landing page copy for the new feature release.",
    "lane_required": "CONTENT",
    "acceptance_mode": "group_only",
    "acceptance_criteria": [
      "Three language versions delivered",
      "Each version is under 200 words",
      "CTA is clear and actionable"
    ]
  }'
```

### 3b. 編碼任務 → 路由到 OpenClaw

```bash
curl -sS -X POST \
  "http://localhost:${NEXUS_API_PORT:-8000}/api/v1/runtime/tasks" \
  -H "Authorization: Bearer ${API_AUTH_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{
    "project_id": "nexus-dispatch",
    "id": "dev-task-001",
    "title": "Fix Authentication Bug",
    "objective": "The login endpoint returns 500 on empty password. Fix and add test coverage.",
    "lane_required": "DEV",
    "acceptance_mode": "group_only",
    "acceptance_criteria": [
      "Login endpoint returns 400 on empty password",
      "Unit test added for edge case",
      "No regression in existing auth tests"
    ]
  }'
```

---

## 第 4 步：驗證路由

PM Daemon 執行時會自動：
1. 取得兩個待處理任務
2. 匹配 `content-task-001`（lane: CONTENT）→ `hermes-content-1`（dialect: hermes）
3. 匹配 `dev-task-001`（lane: DEV）→ `long-coder-1`（dialect: openclaw）
4. 使用正確的轉接器分別派發

檢查任務狀態：

```bash
# 檢查內容任務
curl -sS \
  "http://localhost:${NEXUS_API_PORT:-8000}/api/v1/runtime/tasks/content-task-001?project_id=nexus-dispatch" \
  -H "Authorization: Bearer ${API_AUTH_TOKEN}"

# 檢查編碼任務
curl -sS \
  "http://localhost:${NEXUS_API_PORT:-8000}/api/v1/runtime/tasks/dev-task-001?project_id=nexus-dispatch" \
  -H "Authorization: Bearer ${API_AUTH_TOKEN}"
```

兩個任務都應沿狀態機推進：`created` → `dispatched` → `in_progress` → `completed`。

### 手動驅動生命週期（Daemon 未執行時）

```bash
# 內容任務
for event in dispatch start submit_completion request_review review_pass; do
  curl -sS -X POST \
    "http://localhost:${NEXUS_API_PORT:-8000}/api/v1/runtime/tasks/transition" \
    -H "Authorization: Bearer ${API_AUTH_TOKEN}" \
    -H "Content-Type: application/json" \
    -d "{
      \"project_id\": \"nexus-dispatch\",
      \"task_id\": \"content-task-001\",
      \"event\": \"${event}\",
      \"proof\": { \"source\": \"hermes-content-1\", \"type\": \"dual-agent-test\" }
    }"
done

# 編碼任務
for event in dispatch start submit_completion request_review review_pass; do
  curl -sS -X POST \
    "http://localhost:${NEXUS_API_PORT:-8000}/api/v1/runtime/tasks/transition" \
    -H "Authorization: Bearer ${API_AUTH_TOKEN}" \
    -H "Content-Type: application/json" \
    -d "{
      \"project_id\": \"nexus-dispatch\",
      \"task_id\": \"dev-task-001\",
      \"event\": \"${event}\",
      \"proof\": { \"source\": \"long-coder-1\", \"type\": \"dual-agent-test\" }
    }"
done
```

---

## 第 5 步：驗證完成

```bash
curl -sS \
  "http://localhost:${NEXUS_API_PORT:-8000}/api/v1/runtime/tasks/content-task-001?project_id=nexus-dispatch" \
  -H "Authorization: Bearer ${API_AUTH_TOKEN}" | python3 -c "import sys,json; print(json.load(sys.stdin).get('status'))"

curl -sS \
  "http://localhost:${NEXUS_API_PORT:-8000}/api/v1/runtime/tasks/dev-task-001?project_id=nexus-dispatch" \
  -H "Authorization: Bearer ${API_AUTH_TOKEN}" | python3 -c "import sys,json; print(json.load(sys.stdin).get('status'))"
```

**預期：** 兩個都應回傳 `"completed"`。

---

## Telegram 通知設定

每個 Agent 必須設定**自己的** Telegram bot。Daemon 嚴禁代發。

```bash
AGENT_NOTIFICATIONS='{
  "hermes-content-1": {
    "bot_token": "${HERMES_CONTENT_BOT_TOKEN}",
    "chat_id": "${NEXUS_GROUP_CHAT_ID}"
  },
  "long-coder-1": {
    "bot_token": "${LONG_CODER_BOT_TOKEN}",
    "chat_id": "${NEXUS_GROUP_CHAT_ID}"
  }
}'
```

**規則：**
- 每個 agent_id 對應自己的 bot_token。嚴禁在 Agent 之間共享 bot token。
- 兩個 Agent 可以發到同一個群組（相同 `chat_id`），也可以發到不同群組。
- 群組中的可見訊息必須人類可讀——不得包含原始 JSON、任務 ID 或 Token。
- 完整的追蹤資料儲存在資料庫和 Runtime proof 中。

---

## 並行與排程

| 場景 | 行為 |
| --- | --- |
| 兩個任務，不同泳道 | 同時派發到不同 Agent。 |
| 兩個任務，同一泳道，Agent `max_concurrency: 1` | 依序處理。 |
| 兩個任務，同一泳道，Agent `max_concurrency: 2` | 同一 Agent 並行處理。 |
| 沒有 Agent 匹配任務的泳道 | 任務保持 `pending`，直到匹配的 Agent 上線。 |

---

## 疑難排解

| 症狀 | 檢查指令 | 常見原因 / 解決方案 |
| --- | --- | --- |
| 任務卡在 `pending` | `curl -sS .../agents` — 確認至少有一個 Agent 匹配任務的泳道 | 沒有線上 Agent 匹配該泳道，或所有匹配 Agent 已達最大並行。 |
| 錯誤的 Agent 接了任務 | 檢查任務的 `lane_required` 與 Agent 的 `lane` 欄位 | 泳道不匹配——確保任務泳道與目標 Agent 的泳道一致。 |
| 一個 Agent 收到所有任務 | 檢查註冊 Agent 的 `lane` 值 | 多個 Agent 註冊了同一泳道。用不同泳道路由。 |
| Hermes 任務以 OpenAI 格式發送 | 檢查 Agent 註冊時的 `dialect` 欄位 | Agent 註冊了錯誤的 `dialect`。Hermes 必須用 `"hermes"`，OpenClaw 必須用 `"openclaw"`。 |
| OpenClaw 任務以 MCP 格式發送 | 同上 | 同上——確認 `dialect` 欄位與 Agent 類型一致。 |
| API 呼叫回傳 401 | 確認 `Authorization: Bearer` 請求標頭 | Token 缺失或不匹配。 |
| Daemon 未派發 | `docker compose logs nexus-daemon --since=10m` | 無待處理任務、所有 Agent 離線、或 Daemon 未執行。 |
| 某個 Agent 無 Telegram 通知 | 檢查 `AGENT_NOTIFICATIONS` 中該 `agent_id` 的設定 | 該 Agent 的 bot 設定缺失或設定錯誤。 |

---

## 下一步

- [Hermes Agent 接入教程](./hermes-agent.zh-TW.md) — 詳細的 Hermes 設定
- [OpenClaw Agent 接入教程](./openclaw-agent.zh-TW.md) — 詳細的 OpenClaw 設定
- [安裝與部署指南](../install.zh-TW.md) — 完整部署參考
