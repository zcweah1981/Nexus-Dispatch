     1|# Installation & Deployment Guide
     2|
     3|<p align="center">
     4|  <b>English</b> · <a href="./install.zh-CN.md">简体中文</a> · <a href="./install.zh-TW.md">繁體中文</a>
     5|</p>
     6|
     7|> R13_API_SERVER_DEPLOY_GUIDE_CONTRACT
     8|>
     9|> This guide is the API Server deployment runbook. For the product overview, see [README.md](../README.md).
    10|>
    11|> Visual assets under `docs/assets/guide/` are shared across the three language versions. If an image contains product/UI text, prefer the localized caption and section notes in each language doc instead of relying on the embedded English text alone.
    12|
    13|![Guide cover](./assets/guide/nexus-guide-cover.jpg)
    14|
    15|## Visual Map
    16|
    17|> Shared asset note: screenshots/diagrams are reused across English / 简体中文 / 繁體中文 docs. When embedded labels remain in English, the surrounding caption and explanatory text define the localized reading context.
    18|
    19|
    20|### Deployment flow
    21|
    22|![Deployment flow](./assets/guide/deployment-flow.png)
    23|
    24|### Hermes integration
    25|
    26|![Hermes integration](./assets/guide/hermes-integration.png)
    27|
    28|### OpenClaw worker integration
    29|
    30|![OpenClaw integration](./assets/guide/openclaw-integration.png)
    31|
    32|### Dual-system architecture
    33|
    34|![Dual-system architecture](./assets/guide/dual-system-architecture.png)
    35|
    36|### API server verification proof
    37|
    38|![API server verification proof](./assets/guide/api-server-verification-proof.png)
    39|
    40|---
    41|
    42|---
    43|
    44|## 1. Ports & Endpoints
    45|
    46|| Component | Default Port / Entry | Description |
    47|| --- | --- | --- |
    48|| API Server | `PORT=8000` via `npm start` or `node dist/index.js` | Express + V8 Runtime API. All `/api/v1/*` routes require Bearer token auth. |
    49|| Daemon | `npm run daemon` / `node dist/daemon/main.js` | Tick-loop polling the Runtime API. No HTTP port exposed. |
    50|| WebUI | `3030` (Docker Nginx) or Vite dev server port | Read-only observability dashboard via API/SSE. Never writes to the database. |
    51|| SQLite | Docker volume `nexus-sqlite-data:/data` | `DATABASE_URL=file:/data/nexus.db`, managed by Prisma inside the API process. |
    52|
    53|There is no `install.sh` one-click script or Swagger UI page. Use the smoke-test commands below to verify the live API.
    54|
    55|---
    56|
    57|## 2. V8 Runtime API Quick Reference
    58|
    59|All `/api/v1/*` requests require:
    60|
    61|```bash
    62|  -H "Authorization: Bearer $API_AUTH_TOKEN" \
    63|```
    64|
    65|Key endpoints:
    66|
    67|```text
    68|GET  /api/v1/events/stream
    69|GET  /api/v1/runtime/tasks/pending?project_id=nexus-dispatch
    70|POST /api/v1/runtime/tasks/:taskId/claim
    71|POST /api/v1/runtime/tasks/transition
    72|POST /api/v1/runtime/runs
    73|PATCH /api/v1/runtime/runs/:runId/status
    74|POST /api/v1/runtime/reports
    75|PATCH /api/v1/runtime/reports/:reportId/status
    76|POST /api/v1/runtime/artifacts
    77|POST /api/v1/runtime/projects/:projectId/agents
    78|GET  /api/v1/runtime/projects/:projectId/agents
    79|GET  /api/v1/runtime/projects/:projectId/review-policies
    80|POST /api/v1/runtime/projects/cronjobs
    81|GET  /api/v1/runtime/projects/:projectId/cronjobs
    82|PATCH /api/v1/runtime/projects/:projectId/cronjobs/:cronjobId/status
    83|POST /api/v1/runtime/blueprints/freeze
    84|POST /api/v1/runtime/blueprints/thaw-current-phase
    85|POST /api/v1/runtime/blueprints/advance-phase
    86|```
    87|
    88|Legacy paths (`/api/v1/agents/register`, `/api/v1/tasks/*`) may still exist in historical code but should not be used in production.
    89|
    90|---
    91|
    92|## 3. Docker Compose Deployment
    93|
    94|### 3.1 Prepare
    95|
    96|```bash
    97|git clone https://github.com/zcweah1981/Nexus-Dispatch.git /opt/projects/nexus-dispatch
    98|cd /opt/projects/nexus-dispatch
    99|cp .env.example .env
   100|# Edit .env: at minimum set the shared API/Daemon auth token. Never commit .env.
   101|```
   102|
   103|### 3.2 Build & Start
   104|
   105|```bash
   106|docker compose up -d --build
   107|```
   108|
   109|Compose starts:
   110|
   111|- **nexus-api** — builds TypeScript, runs `prisma migrate deploy`, listens on container port `8000`. Host port defaults to `${NEXUS_API_PORT:-8000}`.
   112|- **nexus-daemon** — waits for API health, then runs `node dist/daemon/main.js`.
   113|- **nexus-webui** — builds the WebUI, served by Nginx on host port `${NEXUS_WEBUI_PORT:-3030}`.
   114|- **nexus-sqlite-data** — persistent volume at `/data/nexus.db`.
   115|
   116|### 3.3 Smoke Tests
   117|
   118|```bash
   119|# Container status
   120|docker compose ps
   121|
   122|# Auth boundary: no token should return 401
   123|curl -i "http://localhost:${NEXUS_API_PORT:-8000}/api/v1/runtime/tasks/pending?project_id=nexus-dispatch"
   124|
   125|# Authenticated request: should return JSON (empty tasks is normal)
   126|curl -sS \
   127|  -H "Authorization: Bearer $API_AUTH_TOKEN" \
   128|  "http://localhost:${NEXUS_API_PORT:-8000}/api/v1/runtime/tasks/pending?project_id=${NEXUS_PROJECT_ID:-nexus-dispatch}"
   129|
   130|# SSE stream: should show connected/ping (timeout prevents blocking the terminal)
   131|timeout 5 curl -N -H "Authorization: Bearer $API_AUTH_TOKEN" "http://localhost:${NEXUS_API_PORT:-8000}/api/v1/events/stream"
   132|
   133|# WebUI
   134|curl -I "http://localhost:${NEXUS_WEBUI_PORT:-3030}/"
   135|
   136|# Comprehensive health script (warnings on first start are expected)
   137|./scripts/health-check.sh --quick
   138|```
   139|
   140|### 3.4 Clone to first completed task
   141|
   142|The shortest end-to-end path from a clean clone to the first task reaching `completed` is:
   143|
   144|1. **Clone and configure**
   145|   ```bash
   146|   git clone https://github.com/zcweah1981/Nexus-Dispatch.git /opt/projects/nexus-dispatch
   147|   cd /opt/projects/nexus-dispatch
   148|   cp .env.example .env
   149|   # Fill API_AUTH_TOKEN and PM_API_TOKEN with the same local secret.
   150|   ```
   151|2. **Apply database migrations and start the API**
   152|   ```bash
   153|   npm ci
   154|   npx prisma generate
   155|   npx prisma migrate deploy
   156|   npm run build
   157|   npm start
   158|   ```
   159|3. **In another terminal, create a project, register one worker, and create one task**
   160|   ```bash
   161|   export API_AUTH_TOKEN="***"
   162|   export NEXUS_PROJECT_ID="nexus-dispatch"
   163|
   164|   curl -sS -X POST "http://localhost:8000/api/v1/runtime/projects" \
   165|     -H "Authorization: Bearer $API_AUTH_TOKEN" \
   166|     -H "Content-Type: application/json" \
   167|     -d '{"id":"nexus-dispatch","name":"nexus-dispatch"}'
   168|
   169|   curl -sS -X POST "http://localhost:8000/api/v1/runtime/projects/nexus-dispatch/agents" \
   170|     -H "Authorization: Bearer $API_AUTH_TOKEN" \
   171|     -H "Content-Type: application/json" \
   172|     -d '{"agent_id":"long-coder-1","endpoint":"http://worker-host:8647/v1/runs","lane":"DEV","dialect":"openclaw","max_concurrency":1,"status":"online"}'
   173|
   174|   curl -sS -X POST "http://localhost:8000/api/v1/runtime/tasks" \
   175|     -H "Authorization: Bearer $API_AUTH_TOKEN" \
   176|     -H "Content-Type: application/json" \
   177|     -d '{"project_id":"nexus-dispatch","id":"first-task","title":"First task","objective":"Verify the API Server lifecycle","lane_required":"DEV","acceptance_mode":"group_only","acceptance_criteria":["task reaches completed through Runtime API transitions"]}'
   178|   ```
   179|4. **Drive the minimal V8 lifecycle through the Runtime API**
   180|   ```bash
   181|   for event in dispatch start submit_completion request_review review_pass; do
   182|     curl -sS -X POST "http://localhost:8000/api/v1/runtime/tasks/transition" \
   183|       -H "Authorization: Bearer $API_AUTH_TOKEN" \
   184|       -H "Content-Type: application/json" \
   185|       -d "{\"project_id\":\"nexus-dispatch\",\"task_id\":\"first-task\",\"event\":\"${event}\",\"proof\":{\"source\":\"install-guide-smoke\"}}"
   186|   done
   187|   ```
   188|5. **Verify the first task**
   189|   ```bash
   190|   curl -sS "http://localhost:8000/api/v1/runtime/tasks/first-task?project_id=nexus-dispatch" \
   191|     -H "Authorization: Bearer $API_AUTH_TOKEN" \
   192|   # Expected: task.status == "completed"
   193|   ```
   194|
   195|For real worker operation, start `npm run daemon` after worker registration; the daemon dispatches through registered worker endpoints and workers submit proof back through the same Runtime API boundary.
   196|
   197|---
   198|
   199|## 4. Local Development
   200|
   201|```bash
   202|npm install
   203|cp .env.example .env
   204|npx prisma generate
   205|npx prisma migrate deploy
   206|npm run build
   207|npm start
   208|```
   209|
   210|In a separate terminal, start the Daemon:
   211|
   212|```bash
   213|npm run daemon
   214|```
   215|
   216|WebUI:
   217|
   218|```bash
   219|npm --prefix src/webui install
   220|npm --prefix src/webui run build
   221|# Dev mode: npm --prefix src/webui run dev
   222|```
   223|
   224|---
   225|
   226|## 5. Worker Agent Registration
   227|
   228|Workers are external execution nodes — they are **not** bundled inside the Nexus control-plane container. Register via the Runtime API:
   229|
   230|```bash
   231|curl -sS -X POST \
   232|  "http://localhost:${NEXUS_API_PORT:-8000}/api/v1/runtime/projects/${NEXUS_PROJECT_ID:-nexus-dispatch}/agents" \
   233|  -H "Authorization: Bearer $API_AUTH_TOKEN" \
   234|  -H "Content-Type: application/json" \
   235|  -d '{
   236|    "agent_id": "long-coder-1",
   237|    "endpoint": "http://worker-host:8647/v1/runs",
   238|    "lane": "DEV",
   239|    "dialect": "openclaw",
   240|    "max_concurrency": 1,
   241|    "status": "online"
   242|  }'
   243|```
   244|
   245|The worker endpoint must accept HTTP POST dispatches from the Daemon. Whether it also exposes `/health` depends on the specific worker implementation — Nexus schedules based on the `status`, `lane`, and `endpoint` fields registered in the Runtime API.
   246|
   247|---
   248|
   249|## 6. Production Deployment Checklist
   250|
   251|Before going live, verify every item:
   252|
   253|- [ ] `.env` is copied from `.env.example`. Real tokens and chat IDs exist only on the target machine — never in Git.
   254|- [ ] `DATABASE_URL=file:/data/nexus.db` (or equivalent absolute path) is confirmed. The SQLite directory is writable and backed up.
   255|- [ ] `PM_API_TOKEN` matches `API_AUTH_TOKEN`, or is explicitly set per your gateway policy.
   256|- [ ] `NEXUS_PROJECT_ID` points to the current project (e.g., `nexus-dispatch`).
   257|- [ ] `npx prisma validate && npx prisma migrate deploy && npm run build` passes cleanly.
   258|- [ ] API is exposed only via internal network, Tailscale, or reverse proxy. Public endpoints must enforce Bearer token auth and TLS.
   259|- [ ] WebUI does not display raw proof, tokens, chat IDs, run IDs, or other runtime-sensitive identifiers.
   260|- [ ] Daemon only drives task state through the Runtime API. Cron start/stop goes through the `project_cronjobs` registry — reviewed and executed by the external scheduler adapter only.
   261|- [ ] Log rotation, SQLite backup, disk alerts, and process auto-restart (Docker restart policy or systemd) are configured.
   262|- [ ] Smoke/health commands have been run and output saved to the deployment record.
   263|
   264|---
   265|
   266|## 7. Bare-Metal Deployment with systemd
   267|
   268|For VPS machines without Docker. Example service units live in `scripts/nexus-dispatch-api.service` and `scripts/nexus-dispatch-daemon.service`.
   269|
   270|```bash
   271|sudo useradd --system --home /opt/projects/nexus-dispatch --shell /usr/sbin/nologin nexus || true
   272|sudo mkdir -p /opt/projects/nexus-dispatch/data /opt/projects/nexus-dispatch/logs
   273|sudo chown -R nexus:nexus /opt/projects/nexus-dispatch
   274|
   275|cd /opt/projects/nexus-dispatch
   276|sudo -u nexus npm ci
   277|sudo -u nexus npm --prefix src/webui ci
   278|sudo -u nexus npm --prefix src/webui run build
   279|sudo -u nexus npx prisma migrate deploy
   280|sudo -u nexus npm run build
   281|
   282|sudo cp scripts/nexus-dispatch-api.service /etc/systemd/system/
   283|sudo cp scripts/nexus-dispatch-daemon.service /etc/systemd/system/
   284|sudo systemctl daemon-reload
   285|sudo systemctl enable --now nexus-dispatch-api.service
   286|sudo systemctl enable --now nexus-dispatch-daemon.service
   287|
   288|systemctl status nexus-dispatch-api.service --no-pager
   289|systemctl status nexus-dispatch-daemon.service --no-pager
   290|journalctl -u nexus-dispatch-daemon -n 80 --no-pager
   291|```
   292|
   293|Start/stop order: API first, Daemon second. When restarting, stop Daemon before API to avoid mid-tick failures.
   294|
   295|```bash
   296|sudo systemctl stop nexus-dispatch-daemon.service
   297|sudo systemctl restart nexus-dispatch-api.service
   298|sudo systemctl start nexus-dispatch-daemon.service
   299|```
   300|
   301|---
   302|
   303|## 8. Telegram Delivery Configuration
   304|
   305|Nexus follows a strict notification boundary: **each dispatched agent sends via its own bot** — the Daemon and PM never send on an agent's behalf. The Daemon reads `AGENT_NOTIFICATIONS` and looks up only the bot/chat config per `agent_id`; visible language is not configured on the agent. Telegram body language is resolved from the project Runtime setting `visible_language` (`zh-CN` default, `en-US` supported). The example below uses environment variable placeholders:
   306|
   307|```bash
   308|AGENT_NOTIFICATIONS='{
   309|  "long-coder-1": {"bot_token": "${LONG_CODER_BOT_TOKEN}", "chat_id": "${NEXUS_GROUP_CHAT_ID}"},
   310|  "shun-designer-1": {"bot_token": "${SHUN_DESIGNER_BOT_TOKEN}", "chat_id": "${NEXUS_GROUP_CHAT_ID}"}
   311|}'
   312|```
   313|
   314|Set project visible language through the Runtime API after the project exists:
   315|
   316|```bash
   317|curl -sS -X PATCH "$PM_API_URL/runtime/projects/nexus-dispatch/settings/visible-language" \
   318|  -H "Authorization: Bearer $API_AUTH_TOKEN" \
   319|  -H "Content-Type: application/json" \
   320|  -d '{"visible_language":"en-US"}'
   321|```
   322|
   323|Production guidelines:
   324|
   325|1. Inject real bot/chat values via systemd `EnvironmentFile`, Docker secrets, or environment variables.
   326|2. Never print real tokens or chat IDs in README, compose files, Git-tracked files, or logs.
   327|3. `AGENT_NOTIFICATIONS` stays credential-only (`bot_token`, `chat_id`). Do not add language fields there; language is project-scoped via `visible_language`.
   328|4. Each agent uses its own bot token. If no config exists for an agent, the Daemon silently skips the visible notification — Runtime proof and report still land in the database.
   329|5. Visible messages are human-readable only. Full task/run/dispatch/trace identifiers stay in DB artifacts and reports — never in group chat text.
   330|
   331|---
   332|
   333|## 9. Cron Scheduler Adapter Boundary
   334|
   335|The `project_cronjobs` table is a project-level registry — having a row does **not** mean an external cronjob is running. Current boundary:
   336|
   337|- The Runtime API handles bind, query, and status updates: `active | paused | disabled`.
   338|- `enabled_policy` controls adapter filtering: `always_on | manual | project_active | maintenance_only`.
   339|- A Telegram session only selects the current project — it does not auto-start/stop cronjobs.
   340|- The Daemon tick must **not** directly call `cronjob.start/stop/pause/resume`.
   341|- A real scheduler adapter must first read `/api/v1/runtime/projects/:projectId/cronjobs?eligible=true`, then decide whether to launch the external Hermes cronjob based on the project-validated registry.
   342|
   343|Recommended pause flow:
   344|
   345|```bash
   346|# Pause the registry (does NOT kill the external process — adapter converges on next read)
   347|curl -sS -X PATCH \
   348|  "http://localhost:${NEXUS_API_PORT:-8000}/api/v1/runtime/projects/${NEXUS_PROJECT_ID:-nexus-dispatch}/cronjobs/<cronjob_id>/status" \
   349|  -H "Authorization: Bearer $API_AUTH_TOKEN" \
   350|  -H "Content-Type: application/json" \
   351|  -d '{"status":"paused"}'
   352|```
   353|
   354|---
   355|
   356|## 10. Logs, migrations, and operational controls
   357|
   358|### 10.1 Logs
   359|
   360|Docker Compose:
   361|
   362|```bash
   363|docker compose logs -f --tail=100 nexus-api
   364|docker compose logs -f --tail=100 nexus-daemon
   365|docker compose logs -f --tail=100 nexus-webui
   366|```
   367|
   368|systemd:
   369|
   370|```bash
   371|journalctl -u nexus-dispatch-api -f
   372|journalctl -u nexus-dispatch-daemon -f --since "10 minutes ago"
   373|journalctl -u nexus-dispatch-api -n 100 --no-pager
   374|```
   375|
   376|Keep visible Telegram text short and human-readable; full runtime IDs and raw proof remain in Runtime DB artifacts/reports.
   377|
   378|### 10.2 Database migrations
   379|
   380|The API Server owns SQLite/Prisma. Workers, WebUI, and the PM Daemon must not open SQLite directly.
   381|
   382|```bash
   383|npx prisma validate
   384|npx prisma migrate deploy
   385|npm run validate:api-deploy -- --skip-health
   386|```
   387|
   388|Docker entrypoint runs `npx prisma migrate deploy` before `node dist/index.js` unless `SKIP_PRISMA_MIGRATE=1` is explicitly set for controlled recovery.
   389|
   390|### 10.3 PM daemon start/stop
   391|
   392|Local:
   393|
   394|```bash
   395|npm run daemon
   396|```
   397|
   398|systemd:
   399|
   400|```bash
   401|sudo systemctl stop nexus-dispatch-daemon.service
   402|sudo systemctl start nexus-dispatch-daemon.service
   403|sudo systemctl restart nexus-dispatch-daemon.service
   404|```
   405|
   406|Restart order: stop daemon first, restart/migrate API, then start daemon. This avoids daemon ticks during API migration/restart windows.
   407|
   408|### 10.4 Validation script
   409|
   410|`npm run validate:api-deploy` runs Prisma validation, the R13 deploy-guide contract, and the V8 Runtime API boundary subset. By default it also probes the live API if `API_AUTH_TOKEN` or `PM_API_TOKEN` is exported.
   411|
   412|```bash
   413|npm run validate:api-deploy -- --skip-health     # source/Prisma/test validation only
   414|API_AUTH_TOKEN="***" npm run validate:api-deploy
   415|npm run validate:api-deploy -- --json --skip-health
   416|```
   417|
   418|---
   419|
   420|## 11. Troubleshooting
   421|
   422|| Symptom | Check Command | Common Cause / Fix |
   423|| --- | --- | --- |
   424|| API won't start | `docker compose logs nexus-api` / `journalctl -u nexus-dispatch-api -n 100` | Missing `DATABASE_URL`, migration failure, port conflict. |
   425|| Requests return 401 | Verify the shared auth token in the runtime environment and check the header | Bearer token missing or mismatched. |
   426|| Daemon doesn't dispatch | `docker compose logs nexus-daemon --since=10m` | No pending tasks, agent not online, lane mismatch, worker endpoint unreachable. |
   427|| SQLite not updating | `docker compose exec nexus-api npx prisma validate` | Volume permissions, stale `data/nexus.db` path. |
   428|| WebUI blank | `curl -I http://localhost:3030/` / browser console | WebUI not built, API/SSE URL unreachable, reverse proxy not forwarding SSE. |
   429|| Telegram silent | Check `AGENT_NOTIFICATIONS` JSON parsing | Missing bot config for agent, bad token/chat_id, bot lacks group permissions. |
   430|| Cron not executing | Query `/runtime/projects/:projectId/cronjobs?eligible=true` | Registry paused/disabled, policy mismatch, external adapter not running. |
   431|
   432|---
   433|
   434|## 12. Verification Commands
   435|
   436|```bash
   437|npm run validate:api-deploy -- --skip-health
   438|npm run build
   439|npm test -- --runInBand tests/v8/v8_api_server_deploy_guide.test.ts tests/v8/v8_retire_legacy_routes.test.ts tests/v8/v8_runtime_api_route_boundary.test.ts
   440|npx prisma validate
   441|npm --prefix src/webui run build
   442|docker compose config --quiet
   443|git diff --check
   444|./scripts/health-check.sh --quick || true
   445|```
   446|
   447|`validate-api-deploy.js` is source/test oriented and safe to run on developer machines. `health-check.sh` may return warnings or critical status on an empty or non-Docker/systemd environment. It is a deployment-machine inspection tool — source-level delivery is validated by build, test, prisma, and diff-check.
   448|