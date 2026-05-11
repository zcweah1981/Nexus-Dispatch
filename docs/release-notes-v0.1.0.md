# Nexus Dispatch v0.1.0 — Developer Preview

**Release Date:** May 2026  
**Status:** Developer Preview — single-node, API-first runtime  
**License:** MIT

---

## What Is Nexus Dispatch

Nexus Dispatch is a **PM-driven control plane for long-running multi-agent work**. It routes tasks to independent AI workers, tracks every state transition through a runtime state machine, and verifies completion through structured proof gates.

One PM brain. Many stateless workers. Everything through a REST API.

```
PM Brain ──dispatch──▶ Worker Fleet
    │                      │
    │   ◀──── proof ───────┘
    │
    ▼
SQLite SSoT (API-internal only)
```

### What It Is Not

- Not a general-purpose agent framework.
- Not a chat-based task bot.
- Not a distributed Kubernetes system.
- Not a plugin marketplace.

It runs on a **single VPS with a single SQLite file**. Workers are stateless HTTP endpoints that receive work and submit proof. The PM Daemon decides everything — dispatch, retry, review gates. Workers never self-assign or self-complete.

---

## What You Can Run Today

The v0.1.0 developer preview ships a working runtime with these capabilities:

### Runtime API (port 8000)

All state goes through `/api/v1/runtime/*`. Bearer token auth required on every request.

| Route | What it does |
| --- | --- |
| `POST /projects` | Create a project scope |
| `POST /projects/:id/agents` | Register a worker endpoint and lane |
| `POST /tasks` | Create a task |
| `GET /tasks/pending?project_id=...&lane=...` | Query dispatchable tasks |
| `GET /tasks/:id?project_id=...` | Fetch a specific task |
| `POST /runs` | Record a worker execution attempt |
| `POST /artifacts` | Store structured proof evidence |
| `POST /tasks/transition` | Request an FSM state transition with proof |
| `POST /reports` | Queue completion / report messages |
| `GET /projects/:id/cronjobs` | Read project cron registry |

### PM Daemon (headless tick loop)

- DAG dependency resolution — tasks with circular dependencies are rejected before dispatch.
- Lane-based routing — workers declare a lane (`DEV`, `DESIGN`, `OPS`, `CONTENT`), tasks declare which lane they need.
- Priority evaluation and lease-based worker claiming.
- Timeout recovery — stale workers lose their lease after a configurable period.
- OpenAI-compatible dispatch format — the Daemon sends an `OpenAI-compatible` messages payload to the worker endpoint.

### FSM State Machine

Legal transitions only. No agent can skip states or self-mark done.

```
created → dispatched → running → completion_pending → completed
                                                ↘ review_pending → completed
```

### Proof Gates

Completion requires structured evidence. The following proof types are enforced:

- `repo_proof` — Git commit SHA, repository state.
- `run_proof` — Worker execution reference.
- `review_proof` — Reviewer verdict for high-risk tasks.
- `report_proof` — Visible completion report.
- `ops_proof` — Operational / deployment evidence.

### Review Policies

- `pm_audit_immediate` — Human review gate before completion. For high-risk tasks.
- `group_only` — Machine proof auto-advances. For routine work.

### WebUI Dashboard (port 3030)

Read-only dashboard showing tasks, agents, run history, and proof summaries. No write capability — all writes go through the Runtime API.

### Telegram Notifications

Per-agent bot delivery. Human-readable summaries. No raw IDs, no tokens, no JSON dumps in group messages.

---

## Install Paths

### Docker Compose (recommended)

```bash
git clone https://github.com/zcweah1981/Nexus-Dispatch.git
cd Nexus-Dispatch
cp .env.example .env
# Edit .env — set API_AUTH_TOKEN and PM_API_TOKEN
docker compose up -d --build
```

Three containers come up: `nexus-api` (port 8000), `nexus-daemon` (internal), `nexus-webui` (port 3030). SQLite data persists in a named Docker volume.

### Bare Metal / systemd

```bash
npm install
npm run build
# Copy and edit the provided systemd unit files:
#   scripts/nexus-dispatch-api.service
#   scripts/nexus-dispatch-daemon.service
```

### One-Click Install

```bash
bash install.sh
```

Clones, configures, and launches Docker Compose automatically.

### Prerequisites

- Node.js 18+
- Docker & Docker Compose (for containerized deploy) OR bare-metal VPS

👉 **Full deployment guide with troubleshooting:** [docs/install.md](./install.md)

---

## Worker Contract & Examples

Workers interact with Nexus Dispatch through a simple HTTP contract. No SDK required.

### The Contract in 30 Seconds

1. **Register** your worker endpoint under a project and lane.
2. **Receive** a dispatch payload from the PM Daemon (OpenAI-compatible messages format).
3. **Execute** the task.
4. **Submit** runs, artifacts, and transition proof through the Runtime API.
5. **Never** access SQLite, make scheduling decisions, or mark tasks complete directly.

👉 **Full contract spec:** [docs/worker-contract.md](./worker-contract.md)

### Example 1: curl Smoke Test

Copy-paste runnable. Proves the Runtime API project / agent / task / query endpoints work.

```bash
API_AUTH_TOKEN="your-token" ./examples/curl-smoke-test/smoke.sh
```

👉 [examples/curl-smoke-test/README.md](../examples/curl-smoke-test/README.md)

### Example 2: Mock Worker

A minimal Node.js worker that receives the Daemon's dispatch shape and returns a structured `worker_run_id`. No Telegram dependency, no private agent dependency, no SQLite access.

```bash
API_AUTH_TOKEN="your-token" ./examples/mock-worker/smoke.sh
```

👉 [examples/mock-worker/README.md](../examples/mock-worker/README.md)

### Integration Guides

| Guide | Who it's for |
| --- | --- |
| [OpenClaw Agent](./guides/openclaw-agent.md) | OpenAI-compatible coding agents |
| [Hermes Agent](./guides/hermes-agent.md) | Telegram-native Hermes workers |
| [Dual Agent](./guides/dual-agent.md) | Mixed OpenClaw + Hermes setup |

All guides available in English, 简体中文, and 繁體中文.

---

## Documentation Links

| Entry | Purpose |
| --- | --- |
| [README](../README.md) | Product overview, 5-minute smoke test, core concepts |
| [README 简体中文](../README.zh-CN.md) | 简体中文版本 |
| [README 繁體中文](../README.zh-TW.md) | 繁體中文版本 |
| [Docs Index](./index.md) | All docs entry points in one place |
| [Installation Guide](./install.md) | Docker, systemd, ports, env vars, smoke tests |
| [Installation 简体中文](./install.zh-CN.md) | 简体中文部署指南 |
| [Installation 繁體中文](./install.zh-TW.md) | 繁體中文部署指南 |
| [Runtime API Reference](./runtime-api.md) | Tasks, runs, artifacts, transitions, review policies |
| [Worker Contract](./worker-contract.md) | Register, dispatch, proof submission |
| [Architecture](./architecture.md) | Runtime boundary, daemon, worker fleet, SQLite SSoT |
| [Contributing Guide](../CONTRIBUTING.md) | How to contribute code and docs |
| [Security Policy](../SECURITY.md) | Vulnerability reporting |

---

## Known Limits (v0.1.0)

This is a developer preview. Be aware of these limits:

| Limitation | Detail |
| --- | --- |
| **Single-node only** | One VPS, one SQLite file. No horizontal scaling. |
| **No multi-tenant isolation** | Project-scoped data, but no auth-level tenant separation. |
| **No built-in CI/CD** | No pipeline runner. Workers are expected to bring their own execution environment. |
| **Telegram notifications optional** | Requires per-agent bot tokens configured in `.env`. |
| **WebUI read-only** | Dashboard shows state but does not accept writes. All mutations through the Runtime API. |
| **No task cancel API** | Tasks can transition through the FSM, but there is no explicit cancel endpoint yet. |
| **Blueprint freeze/thaw is schema-only** | Phase gating is implemented in the data model and API, but the Daemon does not auto-thaw phases yet. |
| **Cron registry read-only** | `GET /projects/:id/cronjobs` reads the registry. Actual cron start/stop is not automated through the API. |
| **No WebSocket / SSE in production** | SSE event stream exists in the API but is not production-hardened. WebUI polling is the stable path. |
| **No rate limiting** | Bearer token auth only. No request rate limiting on the API. Use a reverse proxy in production. |

---

## Recommended Use Cases (Today)

✅ **Good fit:**
- Personal or small-team agent fleet on a single VPS
- Internal automation with a few specialized workers
- Prototyping multi-agent workflows with proof-gated delivery
- Learning / experimenting with PM-driven dispatch patterns

❌ **Not yet recommended:**
- Public multi-tenant SaaS
- Regulated workloads requiring audit-grade compliance
- High-scale distributed queue replacement (>100 concurrent workers)

---

## Next Milestone: v0.2.0

Planned focus areas:

- **Worker health & heartbeat protocol** — automatic offline detection and graceful deregistration.
- **Task cancel and rework APIs** — explicit lifecycle controls beyond the current FSM transitions.
- **Blueprint auto-thaw** — Daemon-driven phase advancement based on completion gates.
- **WebUI write capabilities** — task creation and review actions from the dashboard.
- **Rate limiting and request throttling** — protect the Runtime API from abuse.
- **Expanded E2E test coverage** — full dispatch → execution → proof → review → completion loop.

---

## Validation

```bash
npm run build              # TypeScript compilation
npm test                   # Jest test suite
npm run validate:api-deploy # Route boundary + deploy validation
```

---

*Nexus Dispatch v0.1.0 is a developer preview. APIs may change. Feedback and issues welcome at [GitHub Issues](https://github.com/zcweah1981/Nexus-Dispatch/issues).*
