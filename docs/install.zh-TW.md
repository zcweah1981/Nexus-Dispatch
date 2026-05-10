     1|# 安裝與部署指南
     2|
     3|<p align="center">
     4|  <a href="./install.md">English</a> · <a href="./install.zh-CN.md">简体中文</a> · <b>繁體中文</b>
     5|</p>
     6|
     7|> R13_API_SERVER_DEPLOY_GUIDE_CONTRACT
     8|>
     9|> 本文是 API Server 的完整安裝與部署指南。產品概覽請參閱 [README.zh-TW.md](../README.zh-TW.md)。
    10|>
    11|> `docs/assets/guide/` 下的圖片資源由三語文件共用；若圖片內仍有英文標籤，以本頁繁體中文標題、說明和上下文為準。
    12|
    13|![Guide cover](./assets/guide/nexus-guide-cover.jpg)
    14|
    15|## 視覺化導覽
    16|
    17|> 共用素材說明：以下部署流程圖、整合圖和驗證截圖在 English / 简体中文 / 繁體中文 三個版本中複用，避免重複維護多套截圖資產。
    18|
    19|### 部署流程
    20|
    21|![Deployment flow](./assets/guide/deployment-flow.png)
    22|
    23|**說明**：展示從克隆儲存庫、設定環境變數、建構 API/Daemon/WebUI 到完成基礎驗證的整體路徑。
    24|
    25|### Hermes 整合
    26|
    27|![Hermes integration](./assets/guide/hermes-integration.png)
    28|
    29|**說明**：展示 Hermes Agent 如何作為執行端與 Nexus Dispatch Runtime API 協同。
    30|
    31|### OpenClaw Worker 整合
    32|
    33|![OpenClaw integration](./assets/guide/openclaw-integration.png)
    34|
    35|**說明**：展示 OpenClaw 風格 Worker 的註冊、派單與回傳 proof 閉環。
    36|
    37|### 雙系統架構圖
    38|
    39|![Dual-system architecture](./assets/guide/dual-system-architecture.png)
    40|
    41|**說明**：強調「單 PM 大腦 + 多異構 Worker 啞執行」和 API-only 邊界。
    42|
    43|### API Server 驗證截圖
    44|
    45|![API server verification proof](./assets/guide/api-server-verification-proof.png)
    46|
    47|**說明**：該圖展示部署驗證形態。公開文件中不會暴露 token、chat_id 或其他敏感欄位。
    48|
    49|---
    50|
    51|## 1. 埠號與端點
    52|
    53|| 元件 | 預設埠號 / 入口 | 說明 |
    54|| --- | --- | --- |
    55|| API Server | `PORT=8000`，透過 `npm start` 或 `node dist/index.js` | Express + V8 Runtime API。所有 `/api/v1/*` 路由要求 Bearer token 驗證。 |
    56|| Daemon | `npm run daemon` / `node dist/daemon/main.js` | Tick-loop 輪詢 Runtime API。不暴露 HTTP 埠號。 |
    57|| WebUI | `3030`（Docker Nginx）或 Vite 開發伺服器埠號 | 唯讀可觀測性儀表板，透過 API/SSE 讀取資料，永不直接寫入資料庫。 |
    58|| SQLite | Docker Volume `nexus-sqlite-data:/data` | `DATABASE_URL=file:/data/nexus.db`，由 API 行程內的 Prisma 管理。 |
    59|
    60|系統沒有一鍵安裝指令碼（`install.sh`）或 Swagger UI 頁面。請使用下文的冒煙測試命令驗證 API 狀態。
    61|
    62|---
    63|
    64|## 2. V8 Runtime API 快速參考
    65|
    66|所有 `/api/v1/*` 請求必須攜帶：
    67|
    68|```bash
    69|  -H "Authorization: Bearer $API_AUTH_TOKEN" \
    70|```
    71|
    72|核心端點：
    73|
    74|```text
    75|GET  /api/v1/events/stream
    76|GET  /api/v1/runtime/tasks/pending?project_id=nexus-dispatch
    77|POST /api/v1/runtime/tasks/:taskId/claim
    78|POST /api/v1/runtime/tasks/transition
    79|POST /api/v1/runtime/runs
    80|PATCH /api/v1/runtime/runs/:runId/status
    81|POST /api/v1/runtime/reports
    82|PATCH /api/v1/runtime/reports/:reportId/status
    83|POST /api/v1/runtime/artifacts
    84|POST /api/v1/runtime/projects/:projectId/agents
    85|GET  /api/v1/runtime/projects/:projectId/agents
    86|GET  /api/v1/runtime/projects/:projectId/review-policies
    87|POST /api/v1/runtime/projects/cronjobs
    88|GET  /api/v1/runtime/projects/:projectId/cronjobs
    89|PATCH /api/v1/runtime/projects/:projectId/cronjobs/:cronjobId/status
    90|POST /api/v1/runtime/blueprints/freeze
    91|POST /api/v1/runtime/blueprints/thaw-current-phase
    92|POST /api/v1/runtime/blueprints/advance-phase
    93|```
    94|
    95|舊版路徑（`/api/v1/agents/register`、`/api/v1/tasks/*`）可能仍存在於歷史程式碼中，但不應在正式環境使用。
    96|
    97|---
    98|
    99|## 3. Docker Compose 部署
   100|
   101|### 3.1 準備
   102|
   103|**目的**：克隆儲存庫並建立環境設定檔。
   104|
   105|```bash
   106|git clone https://github.com/zcweah1981/Nexus-Dispatch.git /opt/projects/nexus-dispatch
   107|cd /opt/projects/nexus-dispatch
   108|cp .env.example .env
   109|# 編輯 .env：至少填寫 API/Daemon 共用驗證 token。絕不要將 .env 提交到 Git。
   110|```
   111|
   112|**預期結果**：專案目錄就緒，`.env` 檔案已建立。
   113|**常見問題**：如果 `git clone` 失敗，檢查網路連線和 Git 認證；確保 `/opt/projects/` 目錄存在且有寫入權限。
   114|
   115|### 3.2 建構與啟動
   116|
   117|**目的**：使用 Docker Compose 一鍵建構並啟動所有服務。
   118|
   119|```bash
   120|docker compose up -d --build
   121|```
   122|
   123|**預期結果**：Compose 啟動以下服務：
   124|
   125|- **nexus-api** — 編譯 TypeScript，執行 `prisma migrate deploy`，監聽容器埠號 `8000`。主機埠號預設為 `${NEXUS_API_PORT:-8000}`。
   126|- **nexus-daemon** — 等待 API 健康檢查通過後，執行 `node dist/daemon/main.js`。
   127|- **nexus-webui** — 建構 WebUI，由 Nginx 在主機埠號 `${NEXUS_WEBUI_PORT:-3030}` 上提供服務。
   128|- **nexus-sqlite-data** — 持久化 Volume，儲存 `/data/nexus.db`。
   129|
   130|**成功標誌**：所有容器狀態為 `running` / `healthy`。
   131|
   132|**常見問題**：
   133|- 埠號衝突：確認 8000 和 3030 埠號未被佔用，或在 `.env` 中修改 `NEXUS_API_PORT` / `NEXUS_WEBUI_PORT`。
   134|- 建構失敗：檢查 Node.js 版本和相依套件安裝日誌。
   135|
   136|### 3.3 冒煙測試
   137|
   138|**目的**：驗證各服務已正常運作且驗證生效。
   139|
   140|```bash
   141|# 檢查容器狀態
   142|docker compose ps
   143|
   144|# 驗證邊界測試：無 token 應返回 401
   145|curl -i "http://localhost:${NEXUS_API_PORT:-8000}/api/v1/runtime/tasks/pending?project_id=nexus-dispatch"
   146|
   147|# 驗證請求：應返回 JSON（空任務列表為正常）
   148|curl -sS \
   149|  -H "Authorization: Bearer $API_AUTH_TOKEN" \
   150|  "http://localhost:${NEXUS_API_PORT:-8000}/api/v1/runtime/tasks/pending?project_id=${NEXUS_PROJECT_ID:-nexus-dispatch}"
   151|
   152|# SSE 串流：應顯示 connected/ping（timeout 防止終端機阻塞）
   153|timeout 5 curl -N -H "Authorization: Bearer $API_AUTH_TOKEN" "http://localhost:${NEXUS_API_PORT:-8000}/api/v1/events/stream"
   154|
   155|# WebUI
   156|curl -I "http://localhost:${NEXUS_WEBUI_PORT:-3030}/"
   157|
   158|# 綜合健康檢查指令碼（首次啟動時出現 warning 為正常）
   159|./scripts/health-check.sh --quick
   160|```
   161|
   162|**成功標誌**：
   163|- `docker compose ps` 顯示所有服務 `running`
   164|- 無 token 請求返回 `401`
   165|- 有 token 請求返回 `200` + JSON
   166|- WebUI 返回 `200`
   167|
   168|**常見問題**：
   169|- 持續返回 `401`：檢查 `.env` 中 `API_AUTH_TOKEN` 是否與 curl 中使用的 token 一致
   170|- 連線被拒絕：確認容器已完全啟動，等待 `start_period`（30 秒）後再試
   171|
   172|### 3.4 從克隆到完成第一個任務
   173|
   174|**目的**：從全新克隆到第一個任務達到 `completed` 狀態的最短端到端路徑。
   175|
   176|1. **克隆並設定**
   177|
   178|   ```bash
   179|   git clone https://github.com/zcweah1981/Nexus-Dispatch.git /opt/projects/nexus-dispatch
   180|   cd /opt/projects/nexus-dispatch
   181|   cp .env.example .env
   182|   # 填寫 API_AUTH_TOKEN 和 PM_API_TOKEN 為相同的本地密鑰
   183|   ```
   184|
   185|2. **執行資料庫遷移並啟動 API**
   186|
   187|   ```bash
   188|   npm ci
   189|   npx prisma generate
   190|   npx prisma migrate deploy
   191|   npm run build
   192|   npm start
   193|   ```
   194|
   195|   **預期結果**：API Server 在埠號 8000 上監聽，Prisma migration 完成。
   196|   **常見問題**：`prisma migrate deploy` 失敗時檢查 `DATABASE_URL` 是否正確，確保 data 目錄可寫。
   197|
   198|3. **在另一個終端機，建立專案、註冊 Worker、建立任務**
   199|
   200|   ```bash
   201|   export API_AUTH_TOKEN="***"
   202|   export NEXUS_PROJECT_ID="nexus-dispatch"
   203|
   204|   curl -sS -X POST "http://localhost:8000/api/v1/runtime/projects" \
   205|     -H "Authorization: Bearer $API_AUTH_TOKEN" \
   206|     -H "Content-Type: application/json" \
   207|     -d '{"id":"nexus-dispatch","name":"nexus-dispatch"}'
   208|
   209|   curl -sS -X POST "http://localhost:8000/api/v1/runtime/projects/nexus-dispatch/agents" \
   210|     -H "Authorization: Bearer $API_AUTH_TOKEN" \
   211|     -H "Content-Type: application/json" \
   212|     -d '{"agent_id":"long-coder-1","endpoint":"http://worker-host:8647/v1/runs","lane":"DEV","dialect":"openclaw","max_concurrency":1,"status":"online"}'
   213|
   214|   curl -sS -X POST "http://localhost:8000/api/v1/runtime/tasks" \
   215|     -H "Authorization: Bearer $API_AUTH_TOKEN" \
   216|     -H "Content-Type: application/json" \
   217|     -d '{"project_id":"nexus-dispatch","id":"first-task","title":"First task","objective":"Verify the API Server lifecycle","lane_required":"DEV","acceptance_mode":"group_only","acceptance_criteria":["task reaches completed through Runtime API transitions"]}'
   218|   ```
   219|
   220|   **預期結果**：每個 curl 返回 `200` / `201` + JSON。
   221|   **常見問題**：返回 `401` 檢查 token；返回 `409` 表示專案/Agent 已存在。
   222|
   223|4. **透過 Runtime API 驅動最小 V8 生命週期**
   224|
   225|   ```bash
   226|   for event in dispatch start submit_completion request_review review_pass; do
   227|     curl -sS -X POST "http://localhost:8000/api/v1/runtime/tasks/transition" \
   228|       -H "Authorization: Bearer $API_AUTH_TOKEN" \
   229|       -H "Content-Type: application/json" \
   230|       -d "{\"project_id\":\"nexus-dispatch\",\"task_id\":\"first-task\",\"event\":\"${event}\",\"proof\":{\"source\":\"install-guide-smoke\"}}"
   231|   done
   232|   ```
   233|
   234|   **預期結果**：每次 transition 返回 `200`，任務狀態逐步推進。
   235|
   236|5. **驗證第一個任務**
   237|
   238|   ```bash
   239|   curl -sS "http://localhost:8000/api/v1/runtime/tasks/first-task?project_id=nexus-dispatch" \
   240|     -H "Authorization: Bearer $API_AUTH_TOKEN" \
   241|   # 預期：task.status == "completed"
   242|   ```
   243|
   244|   **成功標誌**：返回的 JSON 中 `status` 欄位為 `"completed"`。
   245|
   246|進入真實 Worker 操作時，需在註冊 Worker 後啟動 `npm run daemon`；Daemon 透過已註冊的 Worker 端點進行派單，Worker 透過同一 Runtime API 邊界提交 proof。
   247|
   248|---
   249|
   250|## 4. 本地開發
   251|
   252|**目的**：搭建本地開發環境。
   253|
   254|```bash
   255|npm install
   256|cp .env.example .env
   257|npx prisma generate
   258|npx prisma migrate deploy
   259|npm run build
   260|npm start
   261|```
   262|
   263|在另一個終端機啟動 Daemon：
   264|
   265|```bash
   266|npm run daemon
   267|```
   268|
   269|WebUI 開發：
   270|
   271|```bash
   272|npm --prefix src/webui install
   273|npm --prefix src/webui run build
   274|# 開發模式：npm --prefix src/webui run dev
   275|```
   276|
   277|**預期結果**：API 在 8000 埠號監聽，Daemon 在另一終端機輪詢。
   278|**常見問題**：`npm install` 失敗時檢查 Node.js 版本（需要 Node 20+）。
   279|
   280|---
   281|
   282|## 5. Worker Agent 註冊
   283|
   284|**目的**：註冊外部執行節點到 Nexus 控制面。
   285|
   286|Worker 是外部執行節點——**不**包含在 Nexus 控制面容器內。透過 Runtime API 註冊：
   287|
   288|```bash
   289|curl -sS -X POST \
   290|  "http://localhost:${NEXUS_API_PORT:-8000}/api/v1/runtime/projects/${NEXUS_PROJECT_ID:-nexus-dispatch}/agents" \
   291|  -H "Authorization: Bearer $API_AUTH_TOKEN" \
   292|  -H "Content-Type: application/json" \
   293|  -d '{
   294|    "agent_id": "long-coder-1",
   295|    "endpoint": "http://worker-host:8647/v1/runs",
   296|    "lane": "DEV",
   297|    "dialect": "openclaw",
   298|    "max_concurrency": 1,
   299|    "status": "online"
   300|  }'
   301|```
   302|
   303|**預期結果**：返回 `200` 或 `201` + Agent 資訊 JSON。
   304|
   305|Worker 端點必須接受來自 Daemon 的 HTTP POST 派單請求。是否暴露 `/health` 端點取決於具體 Worker 實作——Nexus 根據 Runtime API 中註冊的 `status`、`lane` 和 `endpoint` 欄位進行排程。
   306|
   307|**常見問題**：
   308|- 返回 `409`：Agent ID 已存在，可先刪除或更換 ID
   309|- Worker 端點不可達：檢查網路連通性和防火牆規則
   310|
   311|---
   312|
   313|## 6. 正式環境部署檢查清單
   314|
   315|上線前，逐一確認以下每一項：
   316|
   317|- [ ] `.env` 已從 `.env.example` 複製。真實 token 和 chat_id 僅存在於目標機器——絕不進入 Git。
   318|- [ ] `DATABASE_URL=file:/data/nexus.db`（或等效絕對路徑）已確認。SQLite 目錄可寫且已備份。
   319|- [ ] `PM_API_TOKEN` 與 `API_AUTH_TOKEN` 一致，或按閘道策略顯式設定不同值。
   320|- [ ] `NEXUS_PROJECT_ID` 指向當前專案（如 `nexus-dispatch`）。
   321|- [ ] `npx prisma validate && npx prisma migrate deploy && npm run build` 全部通過。
   322|- [ ] API 僅透過內網、Tailscale 或反向代理暴露。公開端點必須強制 Bearer token 驗證 + TLS。
   323|- [ ] WebUI 不展示原始 proof、token、chat_id、run ID 或其他執行時敏感識別碼。
   324|- [ ] Daemon 僅透過 Runtime API 驅動任務狀態。Cron 啟停透過 `project_cronjobs` 註冊表——由外部排程器配接器審查和執行。
   325|- [ ] 日誌輪替、SQLite 備份、磁碟警示、行程自動重啟（Docker restart 策略或 systemd）已設定。
   326|- [ ] 冒煙/健康檢查命令已執行，輸出已儲存到部署記錄。
   327|
   328|---
   329|
   330|## 7. systemd 裸機部署
   331|
   332|**目的**：在無 Docker 的 VPS 上直接部署。範例服務單元檔案位於 `scripts/nexus-dispatch-api.service` 和 `scripts/nexus-dispatch-daemon.service`。
   333|
   334|```bash
   335|sudo useradd --system --home /opt/projects/nexus-dispatch --shell /usr/sbin/nologin nexus || true
   336|sudo mkdir -p /opt/projects/nexus-dispatch/data /opt/projects/nexus-dispatch/logs
   337|sudo chown -R nexus:nexus /opt/projects/nexus-dispatch
   338|
   339|cd /opt/projects/nexus-dispatch
   340|sudo -u nexus npm ci
   341|sudo -u nexus npm --prefix src/webui ci
   342|sudo -u nexus npm --prefix src/webui run build
   343|sudo -u nexus npx prisma migrate deploy
   344|sudo -u nexus npm run build
   345|
   346|sudo cp scripts/nexus-dispatch-api.service /etc/systemd/system/
   347|sudo cp scripts/nexus-dispatch-daemon.service /etc/systemd/system/
   348|sudo systemctl daemon-reload
   349|sudo systemctl enable --now nexus-dispatch-api.service
   350|sudo systemctl enable --now nexus-dispatch-daemon.service
   351|
   352|systemctl status nexus-dispatch-api.service --no-pager
   353|systemctl status nexus-dispatch-daemon.service --no-pager
   354|journalctl -u nexus-dispatch-daemon -n 80 --no-pager
   355|```
   356|
   357|**預期結果**：
   358|- 兩個服務均顯示 `active (running)`
   359|- API 日誌顯示 Express 在 8000 埠號啟動
   360|- Daemon 日誌顯示 tick loop 正常運作
   361|
   362|**成功標誌**：`systemctl status` 顯示 `active (running)`，`journalctl` 無 error。
   363|
   364|**常見問題**：
   365|- `nexus` 使用者權限不足：確認 data/ 和 logs/ 目錄歸屬
   366|- migration 失敗：在服務啟動前手動執行 `sudo -u nexus npx prisma migrate deploy`
   367|- 埠號衝突：確認 8000 埠號未被其他行程佔用
   368|
   369|啟動/停止順序：先 API，後 Daemon。重啟時，先停 Daemon 再停 API，避免 tick 中途失敗。
   370|
   371|```bash
   372|sudo systemctl stop nexus-dispatch-daemon.service
   373|sudo systemctl restart nexus-dispatch-api.service
   374|sudo systemctl start nexus-dispatch-daemon.service
   375|```
   376|
   377|---
   378|
   379|## 8. Telegram 投遞設定
   380|
   381|Nexus 遵循嚴格的通知邊界：**每個被派單的 Agent 透過自己的 Bot 發送通知**——Daemon 和 PM 絕不代發。Daemon 讀取 `AGENT_NOTIFICATIONS` 並按 `agent_id` 查找 bot/chat 設定；可見語言不是在 Agent 上設定的。Telegram 正文語言從專案的 Runtime 設定 `visible_language` 中解析（預設 `zh-CN`，支援 `en-US`）。以下範例使用環境變數佔位符：
   382|
   383|```bash
   384|AGENT_NOTIFICATIONS='{
   385|  "long-coder-1": {"bot_token": "${LONG_CODER_BOT_TOKEN}", "chat_id": "${NEXUS_GROUP_CHAT_ID}"},
   386|  "shun-designer-1": {"bot_token": "${SHUN_DESIGNER_BOT_TOKEN}", "chat_id": "${NEXUS_GROUP_CHAT_ID}"}
   387|}'
   388|```
   389|
   390|專案建立後，透過 Runtime API 設定專案可見語言：
   391|
   392|```bash
   393|curl -sS -X PATCH "$PM_API_URL/runtime/projects/nexus-dispatch/settings/visible-language" \
   394|  -H "Authorization: Bearer $API_AUTH_TOKEN" \
   395|  -H "Content-Type: application/json" \
   396|  -d '{"visible_language":"en-US"}'
   397|```
   398|
   399|正式環境指南：
   400|
   401|1. 透過 systemd `EnvironmentFile`、Docker secrets 或環境變數注入真實 bot/chat 值。
   402|2. 絕不在 README、compose 檔案、Git 追蹤檔案或日誌中列印真實 token 或 chat_id。
   403|3. `AGENT_NOTIFICATIONS` 僅包含憑證（`bot_token`、`chat_id`）。不要在此加入語言欄位；語言透過 `visible_language` 在專案維度設定。
   404|4. 每個 Agent 使用自己的 bot token。如果某個 Agent 沒有設定，Daemon 靜默跳過可見通知——Runtime proof 和 report 仍然會寫入資料庫。
   405|5. 可見訊息僅供人類閱讀。完整的 task/run/dispatch/trace 識別碼留在 DB 的 artifact 和 report 中——絕不進入群組聊天文字。
   406|
   407|---
   408|
   409|## 9. Cron 排程器配接器邊界
   410|
   411|`project_cronjobs` 表是專案級註冊表——表中有一行**不代表**外部 cronjob 正在執行。當前邊界：
   412|
   413|- Runtime API 處理綁定、查詢和狀態更新：`active | paused | disabled`。
   414|- `enabled_policy` 控制配接器過濾：`always_on | manual | project_active | maintenance_only`。
   415|- Telegram session 只選擇當前專案——不自動啟停 cronjob。
   416|- Daemon tick **不得**直接呼叫 `cronjob.start/stop/pause/resume`。
   417|- 真實的排程器配接器必須先讀取 `/api/v1/runtime/projects/:projectId/cronjobs?eligible=true`，再根據專案驗證後的註冊表決定是否啟動外部 Hermes cronjob。
   418|
   419|推薦的暫停流程：
   420|
   421|```bash
   422|# 暫停註冊（不會終止外部行程——配接器在下次讀取時收斂）
   423|curl -sS -X PATCH \
   424|  "http://localhost:${NEXUS_API_PORT:-8000}/api/v1/runtime/projects/${NEXUS_PROJECT_ID:-nexus-dispatch}/cronjobs/<cronjob_id>/status" \
   425|  -H "Authorization: Bearer $API_AUTH_TOKEN" \
   426|  -H "Content-Type: application/json" \
   427|  -d '{"status":"paused"}'
   428|```
   429|
   430|---
   431|
   432|## 10. 日誌、遷移與維運操作
   433|
   434|### 10.1 日誌
   435|
   436|Docker Compose：
   437|
   438|```bash
   439|docker compose logs -f --tail=100 nexus-api
   440|docker compose logs -f --tail=100 nexus-daemon
   441|docker compose logs -f --tail=100 nexus-webui
   442|```
   443|
   444|systemd：
   445|
   446|```bash
   447|journalctl -u nexus-dispatch-api -f
   448|journalctl -u nexus-dispatch-daemon -f --since "10 minutes ago"
   449|journalctl -u nexus-dispatch-api -n 100 --no-pager
   450|```
   451|
   452|Telegram 可見文字保持簡短且人類可讀；完整的執行時 ID 和原始 proof 留在 Runtime DB 的 artifact/report 中。
   453|
   454|### 10.2 資料庫遷移
   455|
   456|API Server 擁有 SQLite/Prisma 的唯一操作權。Worker、WebUI 和 PM Daemon 禁止直接開啟 SQLite。
   457|
   458|```bash
   459|npx prisma validate
   460|npx prisma migrate deploy
   461|npm run validate:api-deploy -- --skip-health
   462|```
   463|
   464|Docker entrypoint 在執行 `node dist/index.js` 之前執行 `npx prisma migrate deploy`，除非顯式設定 `SKIP_PRISMA_MIGRATE=1`（用於受控恢復情境）。
   465|
   466|**常見問題**：
   467|- 遷移失敗：檢查 `DATABASE_URL` 和 data 目錄權限
   468|- Schema 不匹配：執行 `npx prisma validate` 檢查 schema 檔案
   469|
   470|### 10.3 PM Daemon 啟停
   471|
   472|本地開發：
   473|
   474|```bash
   475|npm run daemon
   476|```
   477|
   478|systemd：
   479|
   480|```bash
   481|sudo systemctl stop nexus-dispatch-daemon.service
   482|sudo systemctl start nexus-dispatch-daemon.service
   483|sudo systemctl restart nexus-dispatch-daemon.service
   484|```
   485|
   486|重啟順序：先停 Daemon，再重啟/遷移 API，最後啟動 Daemon。避免 API 遷移/重啟期間 Daemon tick 導致異常。
   487|
   488|### 10.4 驗證指令碼
   489|
   490|`npm run validate:api-deploy` 執行 Prisma 驗證、R13 部署指南契約和 V8 Runtime API 邊界子集。預設情況下，如果匯出了 `API_AUTH_TOKEN` 或 `PM_API_TOKEN`，還會探測執行中的 API。
   491|
   492|```bash
   493|npm run validate:api-deploy -- --skip-health     # source/Prisma/test validation only
   494|API_AUTH_TOKEN="***" npm run validate:api-deploy
   495|npm run validate:api-deploy -- --json --skip-health
   496|```
   497|
   498|---
   499|
   500|## 11. 故障排除
   501|