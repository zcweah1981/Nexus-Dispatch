# Installation & Deployment Guide

<p align="center">
  <b>English</b> · <a href="./install.zh-CN.md">简体中文</a> · <a href="./install.zh-TW.md">繁體中文</a>
</p>

> This guide walks you through installing and running **Nexus Dispatch** — a single-brain, multi-worker task dispatch system. By the end, you'll have a running API Server, a Daemon scheduler, and a WebUI dashboard.
>
> R13_API_SERVER_DEPLOY_GUIDE_CONTRACT
>
> For the product overview, see [README.md](../README.md).

![Guide cover](./assets/guide/nexus-guide-cover.jpg)

---

## What You'll Get

Nexus Dispatch runs three services that work together:

| Service | What it does | Exposed to the network? |
| --- | --- | --- |
| **API Server** | The brain — accepts tasks, manages state, enforces auth | Yes, on port `8000` |
| **Daemon** | A tick-loop scheduler — dispatches tasks to registered workers | No public port (internal only) |
| **WebUI** | Read-only dashboard — shows tasks, agents, and run history | Yes, on port `3030` |

All data lives in a single **SQLite** file — no external database server required.

---

## Ports & Environment Variables at a Glance

Before you start, here's the full port and config map:

| Component | Default Port | Override Variable | Notes |
| --- | --- | --- | --- |
| API Server | `PORT=8000` / published `8000` | `NEXUS_API_PORT` | Express + V8 Runtime. All routes require Bearer token auth. |
| WebUI | `3030` | `NEXUS_WEBUI_PORT` | Nginx-served SPA (Docker) or Vite dev server (local). |
| Daemon | — (none) | — | Polls the API internally. No HTTP port exposed. |
| SQLite | — | `DATABASE_URL` | Default: `file:/data/nexus.db`. In Docker, this is a persistent volume. |

**Docker Compose volume**: key `nexus-sqlite-data` (`name: nexus-dispatch-sqlite`) → mounted at `/data` inside the API and Daemon containers.

**Key environment variables** (set in `.env`):

| Variable | Required | Purpose |
| --- | --- | --- |
| `API_AUTH_TOKEN` | ✅ | Shared secret for API authentication. |
| `PM_API_TOKEN` | ✅ | Token the Daemon uses to call the API. Usually matches `API_AUTH_TOKEN`. |
| `NEXUS_PROJECT_ID` | ✅ | Project scope (default: `nexus-dispatch`). |
| `DATABASE_URL` | — | SQLite path. Default: `file:/data/nexus.db`. |
| `TICK_INTERVAL` | — | Daemon polling interval in ms. Default: `5000`. |
| `AGENT_NOTIFICATIONS` | — | Per-agent Telegram bot config. See [Telegram Delivery](#telegram-delivery-configuration). |

---

## Deployment Topology

![Dual-system architecture](./assets/guide/dual-system-architecture.png)

**How it fits together**: The PM (you) creates tasks via the API or through an agent. The Daemon polls for pending tasks and dispatches them to registered Workers. Workers execute tasks and submit proof back through the same API. The WebUI reads everything via API/SSE — it never writes to the database directly.

---

## Option 1: Docker Compose (Recommended)

The fastest path to a running system. One command builds and starts everything.

### Step 1 — Clone and configure

```bash
git clone https://github.com/zcweah1981/Nexus-Dispatch.git /opt/projects/nexus-dispatch
cd /opt/projects/nexus-dispatch
cp .env.example .env
```

Now edit `.env` and set **at minimum**:
- `API_AUTH_TOKEN` — a long random string (e.g. `openssl rand -hex 32`)
- `PM_API_TOKEN` — set this to the **same value** as `API_AUTH_TOKEN`

> ⚠️ Never commit `.env` to Git. Real tokens and chat IDs belong on the target machine only.

### Step 2 — Build and start

```bash
docker compose up -d --build
```

**What this starts** (in dependency order):

| Container | Built from | What it runs |
| --- | --- | --- |
| `nexus-api` | `Dockerfile` (target: `api`) | Builds TypeScript, runs `prisma migrate deploy`, then `node dist/index.js` on port 8000 |
| `nexus-daemon` | Same image as API | Waits for API health check, then runs `node dist/daemon/main.js` |
| `nexus-webui` | `Dockerfile` (target: `webui`) | Builds the SPA, served by Nginx on port 3030 |

The API container includes a health check that pings its own `/api/v1/runtime/tasks/pending` endpoint every 30 seconds. The Daemon waits for this health check to pass before starting.

### Step 3 — Verify everything works

Run these commands to confirm all services are healthy:

```bash
# Check container status — all three should show "Up" or "healthy"
docker compose ps
```

```bash
# Test auth boundary — should return 401 (no token provided)
curl -i "http://localhost:8000/api/v1/runtime/tasks/pending?project_id=nexus-dispatch"
# Expected: HTTP/1.1 401 Unauthorized
```

```bash
# Test authenticated request — should return JSON (empty list is normal on a fresh install)
curl -sS \
  -H "Authorization: Bearer $API_AUTH_TOKEN" \
  "http://localhost:8000/api/v1/runtime/tasks/pending?project_id=nexus-dispatch"
# Expected: {"tasks":[],"total":0}
```

```bash
# Test WebUI — should return 200
curl -I "http://localhost:3030/"
# Expected: HTTP/1.1 200 OK
```

```bash
# Run the built-in health check script (warnings on first start are expected)
./scripts/health-check.sh --quick
```

![Deployment flow](./assets/guide/deployment-flow.png)

---

## Option 2: Dockerfile / Manual Container

If you prefer to build and run containers individually (no Compose), here's how.

### Build the images

The Dockerfile has two targets:

```bash
# Build API image
docker build --target api -t nexus-dispatch-api:local .

# Build WebUI image
docker build --target webui -t nexus-dispatch-webui:local .
```

### Run the API container

```bash
docker run -d --name nexus-api \
  -p 8000:8000 \
  -v nexus-sqlite-data:/data \
  -e DATABASE_URL="file:/data/nexus.db" \
  -e API_AUTH_TOKEN="$API_AUTH_TOKEN" \
  -e PM_API_TOKEN="$API_AUTH_TOKEN" \
  -e NEXUS_PROJECT_ID="nexus-dispatch" \
  --restart unless-stopped \
  nexus-dispatch-api:local
```

The entrypoint (`scripts/docker-entrypoint.sh`) runs `prisma migrate deploy` automatically unless `SKIP_PRISMA_MIGRATE=1` is set. It then starts the API server on port 8000.

### Run the Daemon container

```bash
docker run -d --name nexus-daemon \
  -v nexus-sqlite-data:/data \
  -e DATABASE_URL="file:/data/nexus.db" \
  -e PM_API_URL="http://<API_HOST>:8000/api/v1" \
  -e PM_API_TOKEN="$API_AUTH_TOKEN" \
  -e NEXUS_PROJECT_ID="nexus-dispatch" \
  --restart unless-stopped \
  nexus-dispatch-api:local daemon
```

> Note: The Daemon uses the **same image** as the API — it just runs a different command (`daemon` instead of `api`).

### Run the WebUI container

```bash
docker run -d --name nexus-webui \
  -p 3030:80 \
  --restart unless-stopped \
  nexus-dispatch-webui:local
```

---

## Option 3: Local Development / Source Development

For development, contributing, or running without Docker.

### Prerequisites

- **Node.js** 20+ (LTS recommended)
- **npm** 10+
- **OpenSSL** (required by Prisma)

### Start the API and Daemon

```bash
cd /opt/projects/nexus-dispatch
npm install
cp .env.example .env
# Edit .env with your tokens
npx prisma generate
npx prisma migrate deploy
npm run build
npm start
```

> After `npm start`, the API listens on `http://localhost:8000`.

In a **separate terminal**, start the Daemon:

```bash
npm run daemon
```

### Start the WebUI (dev mode)

```bash
npm --prefix src/webui install
npm --prefix src/webui run dev
# Or build for production: npm --prefix src/webui run build
```

> The Vite dev server is configured in `src/webui/vite.config.ts` to run on `http://localhost:3000`. Docker publishes the Nginx-served production build on `http://localhost:3030` by default.

---

## Going Further: Clone to First Completed Task

The shortest path from a clean install to your first completed task:

### 1. Create the project

```bash
curl -sS -X POST "http://localhost:8000/api/v1/runtime/projects" \
  -H "Authorization: Bearer $API_AUTH_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"id":"nexus-dispatch","name":"nexus-dispatch"}'
# Expected: {"project":{"id":"nexus-dispatch",...}}
```

### 2. Register a worker

Workers are **external** execution nodes — they are not bundled in the Nexus containers. Register one via the API:

```bash
curl -sS -X POST "http://localhost:8000/api/v1/runtime/projects/nexus-dispatch/agents" \
  -H "Authorization: Bearer $API_AUTH_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "agent_id": "long-coder-1",
    "endpoint": "http://worker-host:8647/v1/runs",
    "lane": "DEV",
    "dialect": "openclaw",
    "soul_prompt": "Execute assigned DEV tasks and return structured proof.",
    "tools_allowed": ["terminal", "file", "web"],
    "status": "online"
  }'
# Expected: {"agent":{"agent_id":"long-coder-1",...}}
```

### 3. Create a task

```bash
curl -sS -X POST "http://localhost:8000/api/v1/runtime/tasks" \
  -H "Authorization: Bearer $API_AUTH_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "project_id": "nexus-dispatch",
    "id": "first-task",
    "title": "First task",
    "objective": "Verify the API Server lifecycle",
    "lane_required": "DEV",
    "acceptance_mode": "group_only",
    "acceptance_criteria": ["task reaches completed through Runtime API transitions"]
  }'
# Expected: {"task":{"id":"first-task","status":"created",...}}
```

### 4. Drive the lifecycle

Endpoint: `POST /api/v1/runtime/tasks/transition`.

```bash
for event in dispatch start submit_completion request_review review_pass; do
  curl -sS -X POST "http://localhost:8000/api/v1/runtime/tasks/transition" \
    -H "Authorization: Bearer $API_AUTH_TOKEN" \
    -H "Content-Type: application/json" \
    -d "{\"project_id\":\"nexus-dispatch\",\"task_id\":\"first-task\",\"event\":\"${event}\",\"proof\":{\"source\":\"install-guide-smoke\"}}"
done
```

### 5. Verify

```bash
curl -sS "http://localhost:8000/api/v1/runtime/tasks/first-task?project_id=nexus-dispatch" \
  -H "Authorization: Bearer $API_AUTH_TOKEN"
# Expected: task.status == "completed"
```

> For real production use, start the Daemon (`npm run daemon` or the Docker Daemon container). It automatically dispatches tasks to registered workers. Workers submit proof back through the same Runtime API.

![API server verification proof](./assets/guide/api-server-verification-proof.png)

---

## Worker Agent Integration

![OpenClaw integration](./assets/guide/openclaw-integration.png)

Workers are separate processes that accept HTTP POST dispatches from the Daemon. When registering a worker:

- **`endpoint`** must be reachable from the Daemon container (or host).
- **`lane`** must match the task's `lane_required` field.
- **`status`** controls whether the Daemon considers the worker for dispatch (`online` | `offline`).
- **`dialect`** defines the wire format (e.g., `openclaw`, `hermes`).

The Daemon schedules based on `status`, `lane`, and `endpoint`. Whether a worker also exposes `/health` is implementation-specific.

---

## Hermes Integration

![Hermes integration](./assets/guide/hermes-integration.png)

Hermes Agent instances connect as workers. They poll the Runtime API for pending tasks, execute them, and submit proof back. The integration is API-only — Hermes never touches SQLite directly.

---

## Bare-Metal Deployment with systemd

For VPS machines without Docker. Example service units are in `scripts/`.

### Setup

```bash
# Create a dedicated system user
sudo useradd --system --home /opt/projects/nexus-dispatch --shell /usr/sbin/nologin nexus || true
sudo mkdir -p /opt/projects/nexus-dispatch/data /opt/projects/nexus-dispatch/logs
sudo chown -R nexus:nexus /opt/projects/nexus-dispatch

# Build as the nexus user
cd /opt/projects/nexus-dispatch
sudo -u nexus npm ci
sudo -u nexus npm --prefix src/webui ci
sudo -u nexus npm --prefix src/webui run build
sudo -u nexus npx prisma migrate deploy
sudo -u nexus npm run build

# Install and start services
sudo cp scripts/nexus-dispatch-api.service /etc/systemd/system/
sudo cp scripts/nexus-dispatch-daemon.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now nexus-dispatch-api.service
sudo systemctl enable --now nexus-dispatch-daemon.service
```

### Verify

```bash
systemctl status nexus-dispatch-api.service --no-pager
systemctl status nexus-dispatch-daemon.service --no-pager
```

### Restart order

Always stop the Daemon before restarting the API to avoid mid-tick failures:

```bash
sudo systemctl stop nexus-dispatch-daemon.service
sudo systemctl restart nexus-dispatch-api.service
sudo systemctl start nexus-dispatch-daemon.service
```

---

## Telegram Delivery Configuration

Nexus follows a strict notification boundary: **each agent sends via its own bot** — the Daemon never sends on behalf of an agent.

Configure per-agent delivery in `AGENT_NOTIFICATIONS`:

```bash
AGENT_NOTIFICATIONS='{
  "long-coder-1": {"bot_token": "BOT_TOKEN_FOR_LONG", "chat_id": "GROUP_CHAT_ID"},
  "shun-designer-1": {"bot_token": "BOT_TOKEN_FOR_SHUN", "chat_id": "GROUP_CHAT_ID"}
}'
```

**Rules**:
1. Inject real values via systemd `EnvironmentFile`, Docker secrets, or environment variables.
2. Never print real tokens or chat IDs in README, compose files, or logs.
3. Language is project-scoped (not per-agent). Set it after project creation:

```bash
curl -sS -X PATCH "$PM_API_URL/runtime/projects/nexus-dispatch/settings/visible-language" \
  -H "Authorization: Bearer $API_AUTH_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"visible_language":"en-US"}'
```

4. If no bot config exists for an agent, the Daemon silently skips the notification — proof still lands in the database.
5. Visible messages are human-readable only. Full task/run/trace IDs stay in DB artifacts.

---

## Cron Scheduler Adapter

The `project_cronjobs` table is a **registry** — having a row does not mean an external cronjob is running.

- The Runtime API handles bind, query, and status updates (`active` | `paused` | `disabled`).
- `enabled_policy` controls adapter filtering: `always_on` | `manual` | `project_active` | `maintenance_only`.
- A Telegram session only selects the current project — it does not auto-start/stop cronjobs.
- The Daemon tick must **not** directly call `cronjob.start/stop/pause/resume`.

Pause a cronjob via the registry (this does NOT kill the external process):

```bash
curl -sS -X PATCH \
  "http://localhost:8000/api/v1/runtime/projects/nexus-dispatch/cronjobs/<cronjob_id>/status" \
  -H "Authorization: Bearer $API_AUTH_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"status":"paused"}'
```

---

## Logs & Operations

### View logs

**Docker Compose**:

```bash
docker compose logs -f --tail=100 nexus-api
docker compose logs -f --tail=100 nexus-daemon
docker compose logs -f --tail=100 nexus-webui
```

**systemd**:

```bash
journalctl -u nexus-dispatch-api -f
journalctl -u nexus-dispatch-daemon -f --since "10 minutes ago"
```

### Database migrations

The API Server owns SQLite/Prisma. Workers, WebUI, and the Daemon must not open SQLite directly.

```bash
npx prisma validate
npx prisma migrate deploy
npm run validate:api-deploy -- --skip-health
```

The Docker entrypoint runs `prisma migrate deploy` automatically unless `SKIP_PRISMA_MIGRATE=1` is set.

### Validation script

```bash
# Source/Prisma/test validation only (no live API probe)
npm run validate:api-deploy -- --skip-health

# Full validation including live API health check
API_AUTH_TOKEN="$API_AUTH_TOKEN" npm run validate:api-deploy

# JSON output
npm run validate:api-deploy -- --json --skip-health
```

---

## Troubleshooting

| Symptom | Check Command | Likely Cause & Fix |
| --- | --- | --- |
| API won't start | `docker compose logs nexus-api` | Missing `DATABASE_URL`, migration failure, or port conflict. |
| Requests return 401 | Verify token in env and `Authorization` header | Bearer token missing or mismatched between `API_AUTH_TOKEN` and `PM_API_TOKEN`. |
| Daemon doesn't dispatch | `docker compose logs nexus-daemon --since=10m` | No pending tasks, agent not `online`, lane mismatch, or worker endpoint unreachable. |
| SQLite not updating | `docker compose exec nexus-api npx prisma validate` | Volume permissions or stale `data/nexus.db` path. |
| WebUI blank | `curl -I http://localhost:3030/` | WebUI not built, API/SSE URL unreachable, or reverse proxy not forwarding SSE. |
| Telegram silent | Check `AGENT_NOTIFICATIONS` JSON | Missing bot config for the agent, bad token/chat_id, or bot lacks group permissions. |
| Cron not executing | Query `/runtime/projects/:pid/cronjobs?eligible=true` | Registry paused/disabled, policy mismatch, or external adapter not running. |

---

## Production Checklist

Before going live, verify every item:

- [ ] `.env` is copied from `.env.example`. Real tokens exist only on the target machine — never in Git.
- [ ] `DATABASE_URL=file:/data/nexus.db` is confirmed. The SQLite directory is writable and backed up.
- [ ] `PM_API_TOKEN` matches `API_AUTH_TOKEN`, or is explicitly set per your gateway policy.
- [ ] `NEXUS_PROJECT_ID` points to the current project.
- [ ] `npx prisma validate && npx prisma migrate deploy && npm run build` passes cleanly.
- [ ] API is exposed only via internal network, Tailscale, or reverse proxy with TLS.
- [ ] WebUI does not display raw tokens, chat IDs, run IDs, or other sensitive identifiers.
- [ ] Daemon only drives task state through the Runtime API. Cron start/stop goes through the `project_cronjobs` registry.
- [ ] Log rotation, SQLite backup, disk alerts, and process auto-restart are configured.
- [ ] Smoke/health commands have been run and output saved to the deployment record.

---

## V8 Runtime API Quick Reference

All `/api/v1/*` requests require:

```
Authorization: Bearer <YOUR_RUNTIME_TOKEN>
```

| Method | Endpoint | Purpose |
| --- | --- | --- |
| GET | `/api/v1/events/stream` | SSE event stream |
| GET | `/api/v1/runtime/tasks/pending?project_id=...` | List pending tasks |
| POST | `/api/v1/runtime/tasks/:taskId/claim` | Claim a task |
| POST | `/api/v1/runtime/tasks/transition` | Transition task state |
| POST | `/api/v1/runtime/runs` | Create a run |
| PATCH | `/api/v1/runtime/runs/:runId/status` | Update run status |
| POST | `/api/v1/runtime/reports` | Submit a report |
| PATCH | `/api/v1/runtime/reports/:reportId/status` | Update report status |
| POST | `/api/v1/runtime/artifacts` | Upload an artifact |
| POST | `/api/v1/runtime/projects/:projectId/agents` | Register an agent |
| GET | `/api/v1/runtime/projects/:projectId/agents` | List registered agents |
| GET | `/api/v1/runtime/projects/:projectId/review-policies` | Get review policies |
| POST | `/api/v1/runtime/projects/cronjobs` | Register a cronjob |
| GET | `/api/v1/runtime/projects/:projectId/cronjobs` | List cronjobs |
| PATCH | `/api/v1/runtime/projects/:projectId/cronjobs/:cronjobId/status` | Update cronjob status |
| POST | `/api/v1/runtime/blueprints/freeze` | Freeze current phase |
| POST | `/api/v1/runtime/blueprints/thaw-current-phase` | Thaw current phase |
| POST | `/api/v1/runtime/blueprints/advance-phase` | Advance to next phase |

> Legacy paths (`/api/v1/agents/register`, `/api/v1/tasks/*`) may exist in historical code but should not be used in production.

---

## Verification Commands

Run these to validate a complete deployment:

```bash
npm run validate:api-deploy -- --skip-health
npm run build
npm test -- --runInBand tests/v8/v8_api_server_deploy_guide.test.ts tests/v8/v8_retire_legacy_routes.test.ts tests/v8/v8_runtime_api_route_boundary.test.ts
npx prisma validate
npm --prefix src/webui run build
docker compose config --quiet
git diff --check
./scripts/health-check.sh --quick || true
```

> `validate-api-deploy.js` is source/test-oriented and safe on developer machines. `health-check.sh` is a deployment-machine inspection tool — warnings on non-Docker environments are expected.

---

*Visual assets under `docs/assets/guide/` are shared across English / 简体中文 / 繁體中文 docs. Screenshots and diagrams are reused to avoid duplicate maintenance.*
