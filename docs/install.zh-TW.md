# 安裝與部署指南

<p align="center">
  <a href="./install.md">English</a> · <a href="./install.zh-CN.md">简体中文</a> · <b>繁體中文</b>
</p>

> R13_API_SERVER_DEPLOY_GUIDE_CONTRACT
>
> 本文是 API Server 的完整安裝與部署指南。產品概覽請參閱 [README.zh-TW.md](../README.zh-TW.md)。
>
> `docs/assets/guide/` 下的圖片資源由三語文件共用；若圖片內仍有英文標籤，以本頁繁體中文標題、說明和上下文為準。

![Guide cover](./assets/guide/nexus-guide-cover.jpg)

## 視覺化導覽

> 共用素材說明：以下部署流程圖、整合圖和驗證截圖在 English / 简体中文 / 繁體中文 三個版本中複用，避免重複維護多套截圖資產。

### 部署流程

![Deployment flow](./assets/guide/deployment-flow.png)

**說明**：展示從克隆儲存庫、設定環境變數、建構 API/Daemon/WebUI 到完成基礎驗證的整體路徑。

### Hermes 整合

![Hermes integration](./assets/guide/hermes-integration.png)

**說明**：展示 Hermes Agent 如何作為執行端與 Nexus Dispatch Runtime API 協同。

### OpenClaw Worker 整合

![OpenClaw integration](./assets/guide/openclaw-integration.png)

**說明**：展示 OpenClaw 風格 Worker 的註冊、派單與回傳 proof 閉環。

### 雙系統架構圖

![Dual-system architecture](./assets/guide/dual-system-architecture.png)

**說明**：強調「單 PM 大腦 + 多異構 Worker 啞執行」和 API-only 邊界。

### API Server 驗證截圖

![API server verification proof](./assets/guide/api-server-verification-proof.png)

**說明**：該圖展示部署驗證形態。公開文件中不會暴露 token、chat_id 或其他敏感欄位。

---

## 1. 埠號與端點

| 元件 | 預設埠號 / 入口 | 說明 |
| --- | --- | --- |
| API Server | `PORT=8000`，透過 `npm start` 或 `node dist/index.js` | Express + V8 Runtime API。所有 `/api/v1/*` 路由要求 Bearer token 驗證。 |
| Daemon | `npm run daemon` / `node dist/daemon/main.js` | Tick-loop 輪詢 Runtime API。不暴露 HTTP 埠號。 |
| WebUI | `3030`（Docker Nginx）或 `3000`（Vite 開發伺服器） | 唯讀可觀測性儀表板，透過 API/SSE 讀取資料，永不直接寫入資料庫。 |
| SQLite | Docker Compose volume key `nexus-sqlite-data` (`name: nexus-dispatch-sqlite`) mounted at `/data` | `DATABASE_URL=file:/data/nexus.db`，由 API 行程內的 Prisma 管理。 |

系統沒有一鍵安裝指令碼（`install.sh`）或 Swagger UI 頁面。請使用下文的冒煙測試命令驗證 API 狀態。

---

## 2. V8 Runtime API 快速參考

所有 `/api/v1/*` 請求必須攜帶：

```bash
  -H "Authorization: Bearer <YOUR_RUNTIME_TOKEN>" \
```

核心端點：

```text
GET  /api/v1/events/stream
GET  /api/v1/runtime/tasks/pending?project_id=nexus-dispatch
POST /api/v1/runtime/tasks/:taskId/claim
POST /api/v1/runtime/tasks/transition
POST /api/v1/runtime/runs
PATCH /api/v1/runtime/runs/:runId/status
POST /api/v1/runtime/reports
PATCH /api/v1/runtime/reports/:reportId/status
POST /api/v1/runtime/artifacts
POST /api/v1/runtime/projects/:projectId/agents
GET  /api/v1/runtime/projects/:projectId/agents
GET  /api/v1/runtime/projects/:projectId/review-policies
POST /api/v1/runtime/projects/cronjobs
GET  /api/v1/runtime/projects/:projectId/cronjobs
PATCH /api/v1/runtime/projects/:projectId/cronjobs/:cronjobId/status
POST /api/v1/runtime/blueprints/freeze
POST /api/v1/runtime/blueprints/thaw-current-phase
POST /api/v1/runtime/blueprints/advance-phase
```

舊版路徑（`/api/v1/agents/register`、`/api/v1/tasks/*`）可能仍存在於歷史程式碼中，但不應在正式環境使用。

---

## 3. Docker Compose 部署

### 3.1 準備

**目的**：克隆儲存庫並建立環境設定檔。

```bash
git clone https://github.com/zcweah1981/Nexus-Dispatch.git /opt/projects/nexus-dispatch
cd /opt/projects/nexus-dispatch
cp .env.example .env
# 編輯 .env：至少填寫 API/Daemon 共用驗證 token。絕不要將 .env 提交到 Git。
```

**預期結果**：專案目錄就緒，`.env` 檔案已建立。
**常見問題**：如果 `git clone` 失敗，檢查網路連線和 Git 認證；確保 `/opt/projects/` 目錄存在且有寫入權限。

### 3.2 建構與啟動

**目的**：使用 Docker Compose 一鍵建構並啟動所有服務。

```bash
docker compose up -d --build
```

**預期結果**：Compose 啟動以下服務：

- **nexus-api** — 編譯 TypeScript，執行 `prisma migrate deploy`，監聽容器埠號 `8000`。主機埠號預設為 `${NEXUS_API_PORT:-8000}`。
- **nexus-daemon** — 等待 API 健康檢查通過後，執行 `node dist/daemon/main.js`。
- **nexus-webui** — 建構 WebUI，由 Nginx 在主機埠號 `${NEXUS_WEBUI_PORT:-3030}` 上提供服務。
- **nexus-sqlite-data** — 持久化 Volume，儲存 `/data/nexus.db`。

**成功標誌**：所有容器狀態為 `running` / `healthy`。

**常見問題**：
- 埠號衝突：確認 8000 和 3030 埠號未被佔用，或在 `.env` 中修改 `NEXUS_API_PORT` / `NEXUS_WEBUI_PORT`。
- 建構失敗：檢查 Node.js 版本和相依套件安裝日誌。

### 3.3 冒煙測試

**目的**：驗證各服務已正常運作且驗證生效。

```bash
# 檢查容器狀態
docker compose ps

# 驗證邊界測試：無 token 應返回 401
curl -i "http://localhost:${NEXUS_API_PORT:-8000}/api/v1/runtime/tasks/pending?project_id=nexus-dispatch"

# 驗證請求：應返回 JSON（空任務列表為正常）
curl -sS \
  -H "Authorization: Bearer $API_AUTH_TOKEN" \
  "http://localhost:${NEXUS_API_PORT:-8000}/api/v1/runtime/tasks/pending?project_id=${NEXUS_PROJECT_ID:-nexus-dispatch}"

# SSE 串流：應顯示 connected/ping（timeout 防止終端機阻塞）
timeout 5 curl -N -H "Authorization: Bearer $API_AUTH_TOKEN" "http://localhost:${NEXUS_API_PORT:-8000}/api/v1/events/stream"

# WebUI
curl -I "http://localhost:${NEXUS_WEBUI_PORT:-3030}/"

# 綜合健康檢查指令碼（首次啟動時出現 warning 為正常）
./scripts/health-check.sh --quick
```

**成功標誌**：
- `docker compose ps` 顯示所有服務 `running`
- 無 token 請求返回 `401`
- 有 token 請求返回 `200` + JSON
- WebUI 返回 `200`

**常見問題**：
- 持續返回 `401`：檢查 `.env` 中 `API_AUTH_TOKEN` 是否與 curl 中使用的 token 一致
- 連線被拒絕：確認容器已完全啟動，等待 `start_period`（30 秒）後再試

### 3.4 從克隆到完成第一個任務

**目的**：從全新克隆到第一個任務達到 `completed` 狀態的最短端到端路徑。

1. **克隆並設定**

   ```bash
   git clone https://github.com/zcweah1981/Nexus-Dispatch.git /opt/projects/nexus-dispatch
   cd /opt/projects/nexus-dispatch
   cp .env.example .env
   # 填寫 API_AUTH_TOKEN 和 PM_API_TOKEN 為相同的本地密鑰
   ```

2. **執行資料庫遷移並啟動 API**

   ```bash
   npm ci
   npx prisma generate
   npx prisma migrate deploy
   npm run build
   npm start
   ```

   **預期結果**：API Server 在埠號 8000 上監聽，Prisma migration 完成。
   **常見問題**：`prisma migrate deploy` 失敗時檢查 `DATABASE_URL` 是否正確，確保 data 目錄可寫。

3. **在另一個終端機，建立專案、註冊 Worker、建立任務**

   ```bash
   export API_AUTH_TOKEN="***"
   export NEXUS_PROJECT_ID="nexus-dispatch"

   curl -sS -X POST "http://localhost:8000/api/v1/runtime/projects" \
     -H "Authorization: Bearer $API_AUTH_TOKEN" \
     -H "Content-Type: application/json" \
     -d '{"id":"nexus-dispatch","name":"nexus-dispatch"}'

   curl -sS -X POST "http://localhost:8000/api/v1/runtime/projects/nexus-dispatch/agents" \
     -H "Authorization: Bearer $API_AUTH_TOKEN" \
     -H "Content-Type: application/json" \
     -d '{"agent_id":"long-coder-1","endpoint":"http://worker-host:8647/v1/runs","lane":"DEV","dialect":"openclaw","soul_prompt":"Execute assigned DEV tasks and return structured proof.","tools_allowed":["terminal","file","web"],"status":"online"}'

   curl -sS -X POST "http://localhost:8000/api/v1/runtime/tasks" \
     -H "Authorization: Bearer $API_AUTH_TOKEN" \
     -H "Content-Type: application/json" \
     -d '{"project_id":"nexus-dispatch","id":"first-task","title":"First task","objective":"Verify the API Server lifecycle","lane_required":"DEV","acceptance_mode":"group_only","acceptance_criteria":["task reaches completed through Runtime API transitions"]}'
   ```

   **預期結果**：每個 curl 返回 `200` / `201` + JSON。
   **常見問題**：返回 `401` 檢查 token；返回 `409` 表示專案/Agent 已存在。

4. **透過 Runtime API 驅動最小 V8 生命週期**

   ```bash
   for event in dispatch start submit_completion request_review review_pass; do
     curl -sS -X POST "http://localhost:8000/api/v1/runtime/tasks/transition" \
       -H "Authorization: Bearer $API_AUTH_TOKEN" \
       -H "Content-Type: application/json" \
       -d "{\"project_id\":\"nexus-dispatch\",\"task_id\":\"first-task\",\"event\":\"${event}\",\"proof\":{\"source\":\"install-guide-smoke\"}}"
   done
   ```

   **預期結果**：每次 transition 返回 `200`，任務狀態逐步推進。

5. **驗證第一個任務**

   ```bash
   curl -sS "http://localhost:8000/api/v1/runtime/tasks/first-task?project_id=nexus-dispatch" \
     -H "Authorization: Bearer $API_AUTH_TOKEN" \
   # 預期：task.status == "completed"
   ```

   **成功標誌**：返回的 JSON 中 `status` 欄位為 `"completed"`。

進入真實 Worker 操作時，需在註冊 Worker 後啟動 `npm run daemon`；Daemon 透過已註冊的 Worker 端點進行派單，Worker 透過同一 Runtime API 邊界提交 proof。

---

## 4. 本地開發

**目的**：搭建本地開發環境。

```bash
npm install
cp .env.example .env
npx prisma generate
npx prisma migrate deploy
npm run build
npm start
```

在另一個終端機啟動 Daemon：

```bash
npm run daemon
```

WebUI 開發：

```bash
npm --prefix src/webui install
npm --prefix src/webui run build
# 開發模式：npm --prefix src/webui run dev
```

**預期結果**：API 在 8000 埠號監聽，Daemon 在另一終端機輪詢。
**常見問題**：`npm install` 失敗時檢查 Node.js 版本（需要 Node 20+）。

---

## 5. Worker Agent 註冊

**目的**：註冊外部執行節點到 Nexus 控制面。

Worker 是外部執行節點——**不**包含在 Nexus 控制面容器內。透過 Runtime API 註冊：

```bash
curl -sS -X POST \
  "http://localhost:${NEXUS_API_PORT:-8000}/api/v1/runtime/projects/${NEXUS_PROJECT_ID:-nexus-dispatch}/agents" \
  -H "Authorization: Bearer $API_AUTH_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "agent_id": "long-coder-1",
    "endpoint": "http://worker-host:8647/v1/runs",
    "lane": "DEV",
    "dialect": "openclaw",
    "status": 1,
    "status": "online"
  }'
```

**預期結果**：返回 `200` 或 `201` + Agent 資訊 JSON。

Worker 端點必須接受來自 Daemon 的 HTTP POST 派單請求。是否暴露 `/health` 端點取決於具體 Worker 實作——Nexus 根據 Runtime API 中註冊的 `status`、`lane` 和 `endpoint` 欄位進行排程。

**常見問題**：
- 返回 `409`：Agent ID 已存在，可先刪除或更換 ID
- Worker 端點不可達：檢查網路連通性和防火牆規則

---

## 6. 正式環境部署檢查清單

上線前，逐一確認以下每一項：

- [ ] `.env` 已從 `.env.example` 複製。真實 token 和 chat_id 僅存在於目標機器——絕不進入 Git。
- [ ] `DATABASE_URL=file:/data/nexus.db`（或等效絕對路徑）已確認。SQLite 目錄可寫且已備份。
- [ ] `PM_API_TOKEN` 與 `API_AUTH_TOKEN` 一致，或按閘道策略顯式設定不同值。
- [ ] `NEXUS_PROJECT_ID` 指向當前專案（如 `nexus-dispatch`）。
- [ ] `npx prisma validate && npx prisma migrate deploy && npm run build` 全部通過。
- [ ] API 僅透過內網、Tailscale 或反向代理暴露。公開端點必須強制 Bearer token 驗證 + TLS。
- [ ] WebUI 不展示原始 proof、token、chat_id、run ID 或其他執行時敏感識別碼。
- [ ] Daemon 僅透過 Runtime API 驅動任務狀態。Cron 啟停透過 `project_cronjobs` 註冊表——由外部排程器配接器審查和執行。
- [ ] 日誌輪替、SQLite 備份、磁碟警示、行程自動重啟（Docker restart 策略或 systemd）已設定。
- [ ] 冒煙/健康檢查命令已執行，輸出已儲存到部署記錄。

---

## 7. systemd 裸機部署

**目的**：在無 Docker 的 VPS 上直接部署。範例服務單元檔案位於 `scripts/nexus-dispatch-api.service` 和 `scripts/nexus-dispatch-daemon.service`。

```bash
sudo useradd --system --home /opt/projects/nexus-dispatch --shell /usr/sbin/nologin nexus || true
sudo mkdir -p /opt/projects/nexus-dispatch/data /opt/projects/nexus-dispatch/logs
sudo chown -R nexus:nexus /opt/projects/nexus-dispatch

cd /opt/projects/nexus-dispatch
sudo -u nexus npm ci
sudo -u nexus npm --prefix src/webui ci
sudo -u nexus npm --prefix src/webui run build
sudo -u nexus npx prisma migrate deploy
sudo -u nexus npm run build

sudo cp scripts/nexus-dispatch-api.service /etc/systemd/system/
sudo cp scripts/nexus-dispatch-daemon.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now nexus-dispatch-api.service
sudo systemctl enable --now nexus-dispatch-daemon.service

systemctl status nexus-dispatch-api.service --no-pager
systemctl status nexus-dispatch-daemon.service --no-pager
journalctl -u nexus-dispatch-daemon -n 80 --no-pager
```

**預期結果**：
- 兩個服務均顯示 `active (running)`
- API 日誌顯示 Express 在 8000 埠號啟動
- Daemon 日誌顯示 tick loop 正常運作

**成功標誌**：`systemctl status` 顯示 `active (running)`，`journalctl` 無 error。

**常見問題**：
- `nexus` 使用者權限不足：確認 data/ 和 logs/ 目錄歸屬
- migration 失敗：在服務啟動前手動執行 `sudo -u nexus npx prisma migrate deploy`
- 埠號衝突：確認 8000 埠號未被其他行程佔用

啟動/停止順序：先 API，後 Daemon。重啟時，先停 Daemon 再停 API，避免 tick 中途失敗。

```bash
sudo systemctl stop nexus-dispatch-daemon.service
sudo systemctl restart nexus-dispatch-api.service
sudo systemctl start nexus-dispatch-daemon.service
```

---

## 8. Telegram 投遞設定

Nexus 遵循嚴格的通知邊界：**每個被派單的 Agent 透過自己的 Bot 發送通知**——Daemon 和 PM 絕不代發。Daemon 讀取 `AGENT_NOTIFICATIONS` 並按 `agent_id` 查找 bot/chat 設定；可見語言不是在 Agent 上設定的。Telegram 正文語言從專案的 Runtime 設定 `visible_language` 中解析（預設 `zh-CN`，支援 `en-US`）。以下範例使用環境變數佔位符：

```bash
AGENT_NOTIFICATIONS='{
  "long-coder-1": {"bot_token": "${LONG_CODER_BOT_TOKEN}", "chat_id": "${NEXUS_GROUP_CHAT_ID}"},
  "shun-designer-1": {"bot_token": "${SHUN_DESIGNER_BOT_TOKEN}", "chat_id": "${NEXUS_GROUP_CHAT_ID}"}
}'
```

專案建立後，透過 Runtime API 設定專案可見語言：

```bash
curl -sS -X PATCH "$PM_API_URL/runtime/projects/nexus-dispatch/settings/visible-language" \
  -H "Authorization: Bearer $API_AUTH_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"visible_language":"en-US"}'
```

正式環境指南：

1. 透過 systemd `EnvironmentFile`、Docker secrets 或環境變數注入真實 bot/chat 值。
2. 絕不在 README、compose 檔案、Git 追蹤檔案或日誌中列印真實 token 或 chat_id。
3. `AGENT_NOTIFICATIONS` 僅包含憑證（`bot_token`、`chat_id`）。不要在此加入語言欄位；語言透過 `visible_language` 在專案維度設定。
4. 每個 Agent 使用自己的 bot token。如果某個 Agent 沒有設定，Daemon 靜默跳過可見通知——Runtime proof 和 report 仍然會寫入資料庫。
5. 可見訊息僅供人類閱讀。完整的 task/run/dispatch/trace 識別碼留在 DB 的 artifact 和 report 中——絕不進入群組聊天文字。

---

## 9. Cron 排程器配接器邊界

`project_cronjobs` 表是專案級註冊表——表中有一行**不代表**外部 cronjob 正在執行。當前邊界：

- Runtime API 處理綁定、查詢和狀態更新：`active | paused | disabled`。
- `enabled_policy` 控制配接器過濾：`always_on | manual | project_active | maintenance_only`。
- Telegram session 只選擇當前專案——不自動啟停 cronjob。
- Daemon tick **不得**直接呼叫 `cronjob.start/stop/pause/resume`。
- 真實的排程器配接器必須先讀取 `/api/v1/runtime/projects/:projectId/cronjobs?eligible=true`，再根據專案驗證後的註冊表決定是否啟動外部 Hermes cronjob。

推薦的暫停流程：

```bash
# 暫停註冊（不會終止外部行程——配接器在下次讀取時收斂）
curl -sS -X PATCH \
  "http://localhost:${NEXUS_API_PORT:-8000}/api/v1/runtime/projects/${NEXUS_PROJECT_ID:-nexus-dispatch}/cronjobs/<cronjob_id>/status" \
  -H "Authorization: Bearer $API_AUTH_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"status":"paused"}'
```

---

## 10. 日誌、遷移與維運操作

### 10.1 日誌

Docker Compose：

```bash
docker compose logs -f --tail=100 nexus-api
docker compose logs -f --tail=100 nexus-daemon
docker compose logs -f --tail=100 nexus-webui
```

systemd：

```bash
journalctl -u nexus-dispatch-api -f
journalctl -u nexus-dispatch-daemon -f --since "10 minutes ago"
journalctl -u nexus-dispatch-api -n 100 --no-pager
```

Telegram 可見文字保持簡短且人類可讀；完整的執行時 ID 和原始 proof 留在 Runtime DB 的 artifact/report 中。

### 10.2 資料庫遷移

API Server 擁有 SQLite/Prisma 的唯一操作權。Worker、WebUI 和 PM Daemon 禁止直接開啟 SQLite。

```bash
npx prisma validate
npx prisma migrate deploy
npm run validate:api-deploy -- --skip-health
```

Docker entrypoint 在執行 `node dist/index.js` 之前執行 `npx prisma migrate deploy`，除非顯式設定 `SKIP_PRISMA_MIGRATE=1`（用於受控恢復情境）。

**常見問題**：
- 遷移失敗：檢查 `DATABASE_URL` 和 data 目錄權限
- Schema 不匹配：執行 `npx prisma validate` 檢查 schema 檔案

### 10.3 PM Daemon 啟停

本地開發：

```bash
npm run daemon
```

systemd：

```bash
sudo systemctl stop nexus-dispatch-daemon.service
sudo systemctl start nexus-dispatch-daemon.service
sudo systemctl restart nexus-dispatch-daemon.service
```

重啟順序：先停 Daemon，再重啟/遷移 API，最後啟動 Daemon。避免 API 遷移/重啟期間 Daemon tick 導致異常。

### 10.4 驗證指令碼

`npm run validate:api-deploy` 執行 Prisma 驗證、R13 部署指南契約和 V8 Runtime API 邊界子集。預設情況下，如果匯出了 `API_AUTH_TOKEN` 或 `PM_API_TOKEN`，還會探測執行中的 API。

```bash
npm run validate:api-deploy -- --skip-health     # source/Prisma/test validation only
API_AUTH_TOKEN="$API_AUTH_TOKEN" npm run validate:api-deploy
npm run validate:api-deploy -- --json --skip-health
```

---

## 11. 故障排除
