<div align="center">
  <img src="./docs/assets/nexus-hero.png" alt="Nexus Dispatch — 多 Agent 團隊的任務控制中心" width="720" />
  <h1>Nexus Dispatch</h1>
  <p><strong>統一排程 · 證據閉環 · 結果可驗證</strong></p>
  <p>
    <a href="./README.md">English</a> ·
    <a href="./README.zh-CN.md">简体中文</a> ·
    <a href="./README.zh-TW.md">繁體中文</a>
  </p>
</div>

<p align="center">
  <img src="https://img.shields.io/badge/Brain-PM_Brain-orange" alt="PM Brain" />
  <img src="https://img.shields.io/badge/Tasks-Long--running_Unattended-9cf" alt="Long-running Tasks" />
  <img src="https://img.shields.io/badge/Fleet-Multi--Agent-purple" alt="Multi-Agent Fleet" />
  <img src="https://img.shields.io/badge/Delivery-Proof--based-brightgreen" alt="Proof-based Delivery" />
  <img src="https://img.shields.io/badge/Visibility-Telegram_+_WebUI-teal" alt="Telegram + WebUI" />
  <img src="https://img.shields.io/badge/Runtime-API_Control_Plane-blue" alt="API Control Plane" />
  <img src="https://img.shields.io/badge/Workflow-Unattended-success" alt="Unattended Workflow" />
  <img src="https://img.shields.io/badge/Deploy-Docker_·_systemd-informational" alt="Docker/systemd Ready" />
  <img src="https://img.shields.io/badge/License-MIT-blue" alt="License: MIT" />
</p>

---

> **一個 PM 大腦中樞，協調你的整個 AI Agent 編隊——派單、追蹤、驗證，全程無人值守。**
>
> Nexus Dispatch 是多 Agent 團隊一直缺少的任務控制中心。它用一個 PM 大腦中樞來協調異構 AI Agent，基於 API-first、狀態機驅動的執行時期，搭配證據閉環的交付門控——確保正確的工作到達正確的 Agent，帶著可驗證的證據完成，全程保持有序推進。不依賴聊天上下文，不丟失任務狀態。

---

## ✨ 為什麼選擇 Nexus Dispatch？

你有 Codex、Claude、Hermes、OpenClaw 或自建 Worker——但沒有人統一指揮。任務在縫隙中丟失，完成狀態未經確認，聊天頻道淹沒在噪音裡。

Nexus Dispatch 給你一個**永不打烊的 PM 大腦中樞**：

| ✅ 你能得到什麼 | ⚙️ 實作方式 |
| --- | --- |
| 🧠 **統一排程** | PM 大腦中樞評估優先級、解析 DAG 依賴、按泳道路由到最合適的 Agent。 |
| 🔁 **長任務不斷線** | 發射後不管的任務鏈，即使跨小時或跨天也能持續推進——自動重試、狀態自動恢復。 |
| 🛡️ **證據閉環** | Worker 提交結構化交付物（Git SHA、檔案雜湊、截圖）。證據通過驗證門控，才算「已完成」。 |
| 🤖 **多 Agent 協作** | 按泳道和並發數註冊異構 Worker。Daemon 統一派發、統一回收，所有互動走同一 API 邊界。 |
| 📱 **執行過程可追蹤** | 每個 Agent 透過自己的 bot 發通知。WebUI 儀表板即時串流展示任務狀態、DAG 進度和交付物畫廊。 |
| 🔌 **單一真相源** | 每次狀態流轉走 REST。沒有共享資料庫，沒有 SSH 隧道，Agent 無法直連 DB。 |
| 🐳 **分鐘級部署** | 單台 VPS，Docker Compose 或裸機。一個 SQLite 檔案。零外部資料庫依賴。 |

---

## 🏷️ 產品亮點

```
🧠 PM 大腦中樞         ·  DAG 優先級派單與依賴解析
⏳ 長任務不斷線         ·  跨小時/跨天的工作流鏈，無人值守持續推進
🤖 多 Agent 協作        ·  異構 Worker 按泳道路由，並發控制
🛡️ 證據閉環            ·  每個完成門控必須提交結構化交付物
📱 Telegram + WebUI    ·  獨立 Agent bot 通知 + 即時 SSE 儀表板
🔌 API 控制平面        ·  純 REST 狀態機，Bearer Token 認證，無直連資料庫
🔄 無人值守推進        ·  發射後不管，自動重試，阻塞狀態自動恢復
🐳 Docker/systemd     ·  單台 VPS，一個 SQLite 檔案，零外部依賴
```

---

## 👥 適合誰？

| 角色 | 使用場景 |
| --- | --- |
| **AI Agent 團隊** | 按泳道路由和並發控制，向編碼、設計、內容、審核 Agent 派發任務。 |
| **技術負責人** | 透過 WebUI + SSE 監控任務全生命週期——從派發到審核到交付物驗收。 |
| **多 Agent 個人開發者** | 運行輕量 PM 大腦中樞，讓多 Agent 工作流保持有序，無需從零搭建編排系統。 |
| **維運 & 平台團隊** | 單台 VPS 上用 Docker Compose 或 systemd 部署。SQLite 單一真相源，無需外部資料庫。 |

---

## 🖼️ 工作流全景

*任務如何從建立到交付驗證，在 Nexus Dispatch 中流轉。*

![Nexus Dispatch 使用流程](./docs/assets/nexus-usage-flow.png)

1. **PM 建立任務**，指定泳道、依賴和審核策略。
2. **PM 大腦中樞派發**到對應的專業 Worker。
3. **Worker 執行並回傳證據**——run、交付物和完成負載透過同一 API 邊界回傳。
4. **審核門控裁決**——根據策略和證據品質決定通過或退回。高風險任務需要人工審核；常規任務在機器驗證交付物後自動推進。
5. **Telegram + WebUI 展示結果**——以人類可讀的形式呈現，不暴露內部 ID 或敏感資訊。

---

## 🏗️ 架構

*單一大腦中樞、多個啞終端、API-only 資料流。*

![Nexus Dispatch 架構](./docs/assets/nexus-architecture.png)

```
┌─────────────────────────────────────────────────────────┐
│                     人類層                               │
│  Telegram (每 Agent 獨立 bot)  ·  WebUI (唯讀 SSE)       │
└──────────┬──────────────────────────┬───────────────────┘
           │ 通知                      │ 可觀測
           ▼                          ▼
┌─────────────────────────────────────────────────────────┐
│              Runtime API (Express :8000)                 │
│  ┌─────────┐ ┌──────────┐ ┌──────────┐ ┌────────────┐  │
│  │ Tasks   │ │ Runs     │ │ Reports  │ │ Blueprints │  │
│  │ Agents  │ │ Cronjobs │ │ Artifacts│ │ Review     │  │
│  └─────────┘ └──────────┘ └──────────┘ └────────────┘  │
│              Bearer Token Auth · /api/v1/runtime/*       │
└──────────┬──────────────────────────────────┬───────────┘
           │ Tick Loop                        │ 註冊
           ▼                                  ▼
┌────────────────────┐            ┌───────────────────────┐
│  PM Daemon         │  派發      │  Worker Agents        │
│  · DAG 解析        │ ────────▶  │  · claim → run        │
│  · 優先級評估      │  ◀──────── │  · 提交證據           │
│  · 審核門控        │  交付物    │  · POST 結果          │
└────────────────────┘            └───────────────────────┘
           │
           ▼
┌────────────────────┐
│  SQLite (SSoT)     │  ← 僅 API 行程內部可見
│  Prisma DAL        │    外部無任何存取途徑
└────────────────────┘
```

**核心不變量：** SQLite 僅在 API Server 行程內可見。Worker、Daemon 和 WebUI 絕不直接操作資料庫——全部透過 Runtime API 存取。

---

## ⚡ 核心能力

### 🔄 狀態機驅動的任務生命週期

每個任務嚴格遵循有限狀態機：`created → dispatched → running → completion_pending → review_pending → completed`，並包含 retry、blocked、dead_letter 和 cancelled 分支。沒有捷徑——任何 Agent 都不能跳過狀態或自行標記完成。

### 🔗 DAG 依賴解析

任務聲明依賴關係。PM 大腦中樞的 DAG 引擎執行拓樸排序並偵測環路——循環依賴在派發前就被攔截，而不是懸置後才暴露。

### 🛡️ 動態審核與證據門控

任務攜帶 `review_policy`（`group_only`、`pm_audit` 等）。高風險任務需要審核人確認後才能解鎖下游。常規任務在機器驗證交付物後自動推進——保持流水線順暢，不製造瓶頸。

### 📋 藍圖 & 階段管理

凍結專案藍圖、解凍階段、推進里程碑——全部透過 Runtime API 完成。藍圖 JSON Schema 在凍結時校驗，確保每個階段有明確範圍。

### ⏰ Cron Registry 適配器隔離

`project_cronjobs` 是專案級註冊表。排程適配器從 API 讀取符合條件的 job 並管理外部執行。Daemon 絕不直接啟停 cronjob——嚴格的關注點分離。

### 📨 Telegram 通知（每 Agent 獨立 Bot）

每個 Agent 用自己的 bot token 發送通知。Daemon 只從 `AGENT_NOTIFICATIONS` 讀取 `bot_token` 與 `chat_id`；可見正文語言來自專案級 Runtime setting `visible_language`（預設 `zh-CN`，支援 `en-US`）。無中心化 bot，憑證不洩露到群聊。

### 📊 WebUI 可觀測性

輕量儀表板讀取 API 和 SSE 串流。檢視任務狀態、DAG 階段進度、交付物畫廊和 run 歷史——永遠不寫資料庫。

---

## 🚀 快速開始

### 前置條件

- Node.js 18+
- Docker & Docker Compose（容器化部署）或裸機 VPS

### Docker Compose（推薦）

```bash
git clone https://github.com/zcweah1981/Nexus-Dispatch.git
cd Nexus-Dispatch
cp .env.example .env
# 編輯 .env — 設定 API_AUTH_TOKEN 和專案參數。絕不要提交 .env。

docker compose up -d --build

# 驗證：無認證請求應回傳 401
curl -i "http://localhost:8000/api/v1/runtime/tasks/pending?project_id=nexus-dispatch"

# 驗證：已認證請求應回傳 JSON
curl -sS \
  -H "Authorization: Bearer YOUR_TOKEN" \
  "http://localhost:8000/api/v1/runtime/tasks/pending?project_id=nexus-dispatch"
```

### 本地開發

```bash
npm install
cp .env.example .env
npx prisma generate
npx prisma migrate deploy
npm run build
npm start        # API server 運行在 :8000

# 另一個終端：
npm run daemon   # PM Daemon Tick Loop

# WebUI（可選）：
npm --prefix src/webui install
npm --prefix src/webui run dev
```

### 註冊你的第一個 Worker

```bash
curl -sS -X POST \
  "http://localhost:8000/api/v1/runtime/projects/nexus-dispatch/agents" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "agent_id": "my-worker-1",
    "endpoint": "http://worker-host:8647/v1/runs",
    "lane": "DEV",
    "dialect": "openclaw",
    "max_concurrency": 1,
    "status": "online"
  }'
```

👉 **完整部署指南、systemd 設定和故障排查：** [docs/install.zh-TW.md](./docs/install.zh-TW.md)

---

## 🔐 安全邊界

Nexus Dispatch 在憑證和資料周圍執行嚴格邊界：

- **儲存庫不含真實密鑰。** README、docker-compose 和 systemd 範例均使用 `$VARIABLE` 佔位符。從 `.env.example` 複製後在本地填寫。
- **API-only 資料存取。** SQLite 僅在 API Server 內部可見。任何模組、Worker 或 UI 都不直接存取資料庫。
- **每次請求 Bearer Token。** 所有 `/api/v1/*` 端點要求 `Authorization: Bearer <token>`。未認證請求回傳 `401`。
- **每 Agent 獨立 Telegram Bot。** 每個 Agent 用自己的 bot token 發送通知。Daemon 從不使用共享 bot 或中心化 token。
- **聊天不含敏感 ID。** Task、Run、Dispatch 和 Trace ID 留在資料庫和 Runtime Proof 中。群聊訊息僅為人類可讀的摘要。
- **公網端點必須 TLS。** API 暴露到 localhost 以外時，必須透過反向代理（Nginx、Caddy、Cloudflare Tunnel）強制 HTTPS。

---

## 📁 專案結構

```
Nexus-Dispatch/
├── src/
│   ├── api/           # Express Server，V8 Runtime API 路由
│   ├── daemon/        # PM Daemon Tick Loop
│   ├── dal/           # Prisma 資料存取層
│   └── webui/         # WebUI 儀表板 (React/Vite)
├── prisma/            # Schema 和遷移
├── tests/             # 單元 + 整合測試 (Vitest)
├── scripts/           # health-check.sh，systemd 服務單元
├── docs/
│   ├── install.md     # 完整安裝與部署指南（英文）
│   ├── install.zh-CN.md  # 簡體中文部署導覽
│   ├── install.zh-TW.md  # 繁體中文部署導覽
│   ├── assets/        # Hero 圖和架構圖 (SVG + PNG)
│   └── v8/            # Runtime Proof 文件和 API 契約
├── docker-compose.yml
├── .env.example
└── README.md          # 英文主文件
```

---

## 📚 文件導航

| 文件 | 說明 |
| --- | --- |
| [docs/install.md](./docs/install.md) | 英文完整部署指南：Docker Compose、systemd、冒煙測試、故障排查 |
| [docs/install.zh-CN.md](./docs/install.zh-CN.md) | 簡體中文部署導覽：三語素材說明、架構/部署配圖、導航 |
| [docs/install.zh-TW.md](./docs/install.zh-TW.md) | 繁體中文部署導覽：三語素材說明、架構/部署配圖、導航 |
| [docs/TRILINGUAL-STRATEGY.md](./docs/TRILINGUAL-STRATEGY.md) | 三語文件策略、命名規範與在地化規則 |
| [docs/v8/](./docs/v8/) | Runtime Proof 文件、API 契約、Schema 規範 |
| [docs/assets/](./docs/assets/) | 產品視覺資產：Hero、架構圖與使用說明圖 |
| [docs/assets/guide/](./docs/assets/guide/) | 使用說明配圖：部署流程、Hermes/OpenClaw 接入、Proof 渲染圖 |
| [README.zh-CN.md](./README.zh-CN.md) | 简体中文版 README |

---

## ✅ 驗證指令

```bash
npm run build                                    # 編譯 TypeScript
npx prisma validate                              # 校驗 Schema
npm test -- --runInBand                          # 執行測試套件
npm --prefix src/webui run build                 # 建構 WebUI
git diff --check                                 # 檢查空白問題
npm run validate:api-deploy -- --skip-health     # Prisma + V8 部署檢查
./scripts/health-check.sh --quick || true        # 部署健康檢查（開發環境 warning 正常）
```

---

## 📄 授權

本專案基於 [MIT 授權條款](./LICENSE) 開源。

Copyright (c) 2026 Nexus Dispatch contributors
