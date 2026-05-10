# Nexus Dispatch

[**中文文档**](./README.zh-CN.md)

![Nexus Dispatch hero](./docs/assets/nexus-hero.png)

**One brain. Many hands. Zero trust.**

Nexus Dispatch is a multi-agent orchestration control plane that gives you a single PM-style brain to dispatch, track, and verify work across any number of heterogeneous AI agents — with an API-only, SQLite-backed, state-machine-driven runtime that never trusts a worker to self-certify completion.

---

## Why Nexus Dispatch?

Shipping AI agents at scale hits the same wall every time: you have ten agents, but no brain coordinating them. Tasks get lost, duplicated, or "completed" without proof. Chat channels become noise. Nobody knows what actually shipped.

Nexus Dispatch solves this by being **the control plane your agents don't have**:

- **Single PM brain** — one Daemon evaluates priorities, resolves dependencies (DAG), and fans out work to the right agent at the right time.
- **Zero-trust verification** — workers submit proof, runs, and artifacts through the Runtime API. Nothing is "done" until the state machine says so.
- **API-only boundary** — every state transition goes through REST. No shared database, no SSH tunnels, no agent with direct DB access.
- **Human-visible delivery** — Telegram notifications are sent by each agent's own bot, not by the Daemon. Tracking IDs stay in the database, not in chat.

---

## Who Is This For?

| Role | How You Use It |
| --- | --- |
| **AI Agent Teams** | Dispatch coding, design, content, and review tasks to specialized agents with lane-based routing and concurrency control. |
| **Engineering Leads** | Monitor the full task lifecycle via WebUI + SSE — from dispatch through review to completion with artifact proof. |
| **Solo Builders with Agents** | Run a lightweight PM Daemon that keeps your multi-agent workflow honest without building orchestration from scratch. |
| **Ops & Platform Teams** | Deploy via Docker Compose or systemd on a single VPS. SQLite SSoT means no external database to manage. |

---

## Core Capabilities

### State-Machine Task Lifecycle

Every task follows a strict finite-state machine: `created → dispatched → claimed → running → completed | failed | dead-lettered`. No shortcuts. No agent can skip states or self-mark "done."

### DAG-Based Dependency Resolution

Tasks declare dependencies. The Daemon's DAG engine performs topological ordering with cycle detection — circular dependencies are rejected before dispatch, not after a mysterious hang.

### Dynamic Review & Proof Gate

Tasks carry a `review_policy` (`group_only`, `pm_audit`, etc.). High-risk work requires reviewer proof before the state machine unlocks downstream tasks. Routine work can auto-advance after machine-verified artifact submission.

### Blueprint & Phase Management

Freeze a project blueprint, thaw phases, and advance through milestones — all through the Runtime API. The blueprint JSON schema is validated at freeze time so every phase has a clear scope.

### Cron Registry with Adapter Isolation

`project_cronjobs` is a project-scoped registry. A scheduler adapter reads eligible jobs from the API and manages external execution. The Daemon never directly starts or stops cronjobs — strict separation of concerns.

### Telegram Delivery (Per-Agent Bot)

Each agent sends its own notifications via its own bot token. The Daemon looks up `AGENT_NOTIFICATIONS` only for `bot_token` and `chat_id`; the visible body language comes from the project `visible_language` Runtime setting (`zh-CN` default, `en-US` supported). No centralized bot. No leaked credentials in group chat.

### WebUI Observability

A lightweight dashboard reads the API and SSE stream. View task states, DAG phase progress, artifact galleries, and run history — without ever writing to the database.

---

## Architecture

![Nexus Dispatch architecture](./docs/assets/nexus-architecture.png)

```
┌─────────────────────────────────────────────────────────┐
│                     Human Layer                         │
│  Telegram (per-agent bots)  ·  WebUI (read-only SSE)    │
└──────────┬──────────────────────────┬───────────────────┘
           │ notifications            │ observability
           ▼                          ▼
┌─────────────────────────────────────────────────────────┐
│              Runtime API (Express :8000)                 │
│  ┌─────────┐ ┌──────────┐ ┌──────────┐ ┌────────────┐  │
│  │ Tasks   │ │ Runs     │ │ Reports  │ │ Blueprints │  │
│  │ Agents  │ │ Cronjobs │ │ Artifacts│ │ Review     │  │
│  └─────────┘ └──────────┘ └──────────┘ └────────────┘  │
│              Bearer Token Auth · /api/v1/runtime/*       │
└──────────┬──────────────────────────────────┬───────────┘
           │ tick loop                        │ register
           ▼                                  ▼
┌────────────────────┐            ┌───────────────────────┐
│  PM Daemon         │  dispatch  │  Worker Agents        │
│  · DAG resolution  │ ────────▶  │  · claim → run        │
│  · Priority eval   │  ◀──────── │  · submit proof       │
│  · Review gating   │  artifact  │  · POST results       │
└────────────────────┘            └───────────────────────┘
           │
           ▼
┌────────────────────┐
│  SQLite (SSoT)     │  ← API-internal only
│  Prisma DAL        │    No external access
└────────────────────┘
```

**Key invariant:** SQLite is visible only inside the API server process. Workers, Daemon, and WebUI never touch the database directly — they go through the Runtime API exclusively.

---

## Runtime Model

The Daemon runs a configurable tick loop (default `TICK_INTERVAL`). Each tick:

1. **Fetch pending tasks** — queries `/api/v1/runtime/tasks/pending` filtered by project and lane.
2. **Resolve DAG** — topological sort with cycle detection. Tasks with unmet dependencies stay queued.
3. **Evaluate priority & lane** — matches task lane to online agents. Respects `max_concurrency` per agent.
4. **Dispatch** — POSTs to the worker's registered `endpoint`. State transitions to `dispatched`.
5. **Await proof** — workers call back via Runtime API with runs, reports, and artifacts.
6. **Review gate** — if `review_policy` requires it, a dynamic review task is created. Otherwise, machine proof unlocks downstream.

```
created → dispatched → claimed → running → completed
                              ↘ failed → retry / dead-letter
```

---

## Quick Start

### Prerequisites

- Node.js 18+
- Docker & Docker Compose (for containerized deploy) OR a bare-metal VPS

### Docker Compose (recommended)

```bash
git clone https://github.com/zcweah1981/Nexus-Dispatch.git
cd Nexus-Dispatch
cp .env.example .env
# Edit .env — set API_AUTH_TOKEN and project settings. Never commit .env.

docker compose up -d --build

# Verify: unauthenticated request should return 401
curl -i "http://localhost:8000/api/v1/runtime/tasks/pending?project_id=nexus-dispatch"

# Verify: authenticated request should return JSON
curl -sS \
  -H "Authorization: Bearer $API_AUTH_TOKEN" \
  "http://localhost:8000/api/v1/runtime/tasks/pending?project_id=nexus-dispatch"
```

### Local Development

```bash
npm install
cp .env.example .env
npx prisma generate
npx prisma migrate deploy
npm run build
npm start        # API server on :8000

# In another terminal:
npm run daemon   # PM Daemon tick loop

# WebUI (optional):
npm --prefix src/webui install
npm --prefix src/webui run dev
```

### Register Your First Worker

```bash
curl -sS -X POST \
  "http://localhost:8000/api/v1/runtime/projects/nexus-dispatch/agents" \
  -H "Authorization: Bearer $API_AUTH_TOKEN" \
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

👉 **Full deployment guide, systemd setup, and troubleshooting:** [docs/install.md](./docs/install.md)

---

## Security & Secrets Boundary

Nexus Dispatch enforces strict boundaries around credentials and data:

- **No real secrets in the repo.** README, docker-compose, and systemd examples use `$VARIABLE` placeholders. Copy `.env.example` and fill values locally.
- **API-only data access.** SQLite is internal to the API server. No module, worker, or UI gets direct DB access.
- **Bearer token on every request.** All `/api/v1/*` endpoints require `Authorization: Bearer <token>`. Unauthenticated requests return `401`.
- **Per-agent Telegram bots.** Each agent sends notifications via its own bot token. The Daemon never uses a shared bot or central token.
- **No sensitive IDs in chat.** Task, run, dispatch, and trace IDs stay in the database and runtime proof. Group chat messages are human-readable summaries only.
- **TLS for public endpoints.** If the API is exposed beyond localhost, enforce HTTPS via reverse proxy (Nginx, Caddy, Cloudflare Tunnel).

---

## Project Structure

```
Nexus-Dispatch/
├── src/
│   ├── api/           # Express server, V8 Runtime API routes
│   ├── daemon/        # PM Daemon tick loop
│   ├── dal/           # Prisma data access layer
│   └── webui/         # WebUI dashboard (React/Vite)
├── prisma/            # Schema and migrations
├── tests/             # Unit + integration tests (Vitest)
├── scripts/           # health-check.sh, systemd service units
├── docs/
│   ├── install.md     # Full installation & deployment guide
│   ├── assets/        # Hero and architecture images (SVG + PNG)
│   └── v8/            # Runtime proof documents and contracts
├── docker-compose.yml
├── .env.example
└── README.md          # ← You are here
```

---

## Documentation Index

| Document | Description |
| --- | --- |
| [docs/install.md](./docs/install.md) | Full deployment guide: Docker Compose, systemd, smoke tests, troubleshooting |
| [docs/v8/](./docs/v8/) | Runtime proof documents, API contracts, and schema specs |
| [docs/assets/](./docs/assets/) | Product visuals: hero and architecture diagrams (SVG + PNG) |
| [README.zh-CN.md](./README.zh-CN.md) | 中文版 README |

---

## Verification Commands

```bash
npm run build                                    # Compile TypeScript
npx prisma validate                              # Validate schema
npm test -- --runInBand                          # Run test suite
npm --prefix src/webui run build                 # Build WebUI
git diff --check                                 # Catch whitespace issues
./scripts/health-check.sh --quick || true        # Deployment health (warnings OK on dev)
```

---

## License

Private repository. All rights reserved.
