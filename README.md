<div align="center">
  <img src="./docs/assets/nexus-hero.png" alt="Nexus Dispatch" width="720" />
  <h1>Nexus Dispatch</h1>
  <p><strong>One brain. Many hands. Zero trust.</strong></p>
  <p>
    <a href="./README.zh-CN.md">简体中文</a> ·
    <a href="./README.zh-TW.md">繁體中文</a>
  </p>
</div>

---

> **Multi-agent orchestration, finally under control.**
>
> Nexus Dispatch is the control plane your AI agents don't have — a single PM-style brain that dispatches, tracks, and verifies work across any number of heterogeneous agents, backed by an API-only, state-machine-driven runtime with zero-trust proof gates.

<p align="center">
  <img src="https://img.shields.io/badge/Runtime-API_only-blue" alt="API-only Runtime" />
  <img src="https://img.shields.io/badge/Storage-SQLite_SSoT-green" alt="SQLite SSoT" />
  <img src="https://img.shields.io/badge/Agents-Multi--Agent_Control_Plane-purple" alt="Multi-Agent Control Plane" />
  <img src="https://img.shields.io/badge/Security-Zero_Trust_Proof-red" alt="Zero-Trust Proof" />
  <img src="https://img.shields.io/badge/Brain-PM_Daemon-orange" alt="PM Daemon" />
  <img src="https://img.shields.io/badge/Interface-Telegram_·_WebUI-teal" alt="Telegram / WebUI" />
  <img src="https://img.shields.io/badge/Scheduler-Cron_Adapter-yellow" alt="Cron Adapter" />
  <img src="https://img.shields.io/badge/License-MIT-blue" alt="License: MIT" />
</p>

---

## The Problem

You have 5, 10, or 50 AI agents — but no brain coordinating them. Tasks get lost, duplicated, or "completed" without evidence. Chat channels drown in noise. Nobody can answer a simple question: *what actually shipped, and is it verified?*

Nexus Dispatch fixes this. It's not another chatbot framework or agent toolkit — it's the **mission control** that sits above your agents and makes sure the right work reaches the right agent, gets done, gets proved, and gets tracked. Every time.

---

## Who Is This For?

| Role | How You Use It |
| --- | --- |
| **AI Agent Teams** | Dispatch coding, design, content, and review tasks to specialized agents with lane-based routing and concurrency control. |
| **Engineering Leads** | Monitor the full task lifecycle via WebUI + SSE — from dispatch through review to completion with artifact proof. |
| **Solo Builders with Agents** | Run a lightweight PM Daemon that keeps your multi-agent workflow honest without building orchestration from scratch. |
| **Ops & Platform Teams** | Deploy via Docker Compose or systemd on a single VPS. SQLite SSoT means no external database to manage. |

---

## Why Nexus Dispatch?

| What You Get | How It Works |
| --- | --- |
| **No more lost tasks** | A PM Daemon evaluates priorities, resolves dependencies via DAG, and fans out work to the right agent at the right time. |
| **No more fake completions** | Workers submit proof, runs, and artifacts through the Runtime API. Nothing is "done" until the state machine says so. |
| **No shared database** | Every state transition goes through REST. No SSH tunnels, no agent with direct DB access. |
| **No credential leaks** | Telegram notifications are sent by each agent's own bot. Tracking IDs stay in the database, not in chat. |
| **No deployment complexity** | Single VPS, Docker Compose, or bare metal. One SQLite file. Zero external dependencies. |

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

## Core Capabilities

### 🔄 State-Machine Task Lifecycle

Every task follows a strict finite-state machine: `created → dispatched → running → completion_pending → review_pending → completed` with retry, blocked, dead-letter, and cancelled branches. No shortcuts. No agent can skip states or self-mark "done."

### 🔗 DAG-Based Dependency Resolution

Tasks declare dependencies. The Daemon's DAG engine performs topological ordering with cycle detection — circular dependencies are rejected before dispatch, not after a mysterious hang.

### 🛡️ Dynamic Review & Proof Gate

Tasks carry a `review_policy` (`group_only`, `pm_audit`, etc.). High-risk work requires reviewer proof before the state machine unlocks downstream tasks. Routine work can auto-advance after machine-verified artifact submission.

### 📋 Blueprint & Phase Management

Freeze a project blueprint, thaw phases, and advance through milestones — all through the Runtime API. The blueprint JSON schema is validated at freeze time so every phase has a clear scope.

### ⏰ Cron Registry with Adapter Isolation

`project_cronjobs` is a project-scoped registry. A scheduler adapter reads eligible jobs from the API and manages external execution. The Daemon never directly starts or stops cronjobs — strict separation of concerns.

### 📨 Telegram Delivery (Per-Agent Bot)

Each agent sends its own notifications via its own bot token. The Daemon looks up `AGENT_NOTIFICATIONS` only for `bot_token` and `chat_id`; the visible body language comes from the project `visible_language` Runtime setting (`zh-CN` default, `en-US` supported). No centralized bot. No leaked credentials in group chat.

### 📊 WebUI Observability

A lightweight dashboard reads the API and SSE stream. View task states, DAG phase progress, artifact galleries, and run history — without ever writing to the database.

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
created → dispatched → running → completion_pending → review_pending → completed
                              ↘ retry_ready / blocked / dead_letter / cancelled
```

## How Work Flows

![Nexus Dispatch usage flow](./docs/assets/nexus-usage-flow.png)

A typical delivery path is intentionally strict and visible:

1. **PM creates a task** with lane, dependencies, and review policy.
2. **Daemon dispatches it** to the right specialized worker over the Runtime API.
3. **Worker submits proof** — runs, artifacts, and completion payloads come back through the same API boundary.
4. **PM / review gate accepts or rejects** based on policy and proof quality.
5. **Telegram + WebUI reflect the result** in human-readable form without exposing internal IDs or raw secrets.

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
| [docs/install.md](./docs/install.md) | Full English deployment guide: Docker Compose, systemd, smoke tests, troubleshooting |
| [docs/install.zh-CN.md](./docs/install.zh-CN.md) | Simplified Chinese install guide: shared assets, localized captions, and navigation |
| [docs/install.zh-TW.md](./docs/install.zh-TW.md) | Traditional Chinese install guide: shared assets, localized captions, and navigation |
| [docs/TRILINGUAL-STRATEGY.md](./docs/TRILINGUAL-STRATEGY.md) | Trilingual docs map, naming convention, and localization rules |
| [docs/v8/](./docs/v8/) | Runtime proof documents, API contracts, and schema specs |
| [docs/assets/](./docs/assets/) | Product visuals: hero, architecture, and guide diagrams |
| [docs/assets/guide/](./docs/assets/guide/) | Guide visuals: deployment flow, Hermes/OpenClaw integration, proof render |
| [README.zh-CN.md](./README.zh-CN.md) | 简体中文版 README |
| [README.zh-TW.md](./README.zh-TW.md) | 繁體中文入口（佔位，翻譯規劃中） |

---

## Verification Commands

```bash
npm run build                                    # Compile TypeScript
npx prisma validate                              # Validate schema
npm test -- --runInBand                          # Run test suite
npm --prefix src/webui run build                 # Build WebUI
git diff --check                                 # Catch whitespace issues
npm run validate:api-deploy -- --skip-health     # Prisma + focused V8 deploy checks
./scripts/health-check.sh --quick || true        # Live deployment health (warnings OK on dev)
```

---

## License

This project is licensed under the [MIT License](./LICENSE).

Copyright (c) 2026 Nexus Dispatch contributors
