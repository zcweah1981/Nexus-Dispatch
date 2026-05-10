# Dual-Agent Integration Guide: Hermes + OpenClaw

[English](./dual-agent.md) · [简体中文](./dual-agent.zh-CN.md) · [繁體中文](./dual-agent.zh-TW.md)

---

## Overview

This guide shows you how to run **both Hermes and OpenClaw workers** on the same Nexus Dispatch instance. The PM Daemon routes tasks to the correct worker based on each agent's **lane** and **dialect**, so you can have coding tasks go to OpenClaw while content tasks go to Hermes — all under one control plane.

**Who this is for:** Teams that use multiple agent types and want a unified dispatch, tracking, and verification system.

![Dual-system architecture](../assets/guide/dual-system-architecture.png)

---

## Prerequisites

Before you begin, make sure you have:

| Requirement | How to verify |
| --- | --- |
| Nexus Dispatch API Server running | `curl -I http://localhost:8000/api/v1/events/stream` |
| `API_AUTH_TOKEN` set in environment | `echo $API_AUTH_TOKEN` (must not be empty) |
| Hermes Agent installed and gateway configured | `hermes --version` and `hermes gateway status` |
| OpenClaw installed and endpoint reachable | `curl -I http://your-openclaw-host:8647/v1/runs` |
| PM Daemon running | `docker compose ps nexus-daemon` or `systemctl status nexus-dispatch-daemon` |
| A project created in Nexus | See [Installation Guide](../install.md) §3.4 |

---

## How It Works

Nexus Dispatch uses two routing dimensions to send tasks to the right agent:

| Dimension | What it does | Example |
| --- | --- | --- |
| **Lane** | Categorizes the work type. Tasks and agents must share the same lane to match. | `DEV`, `CONTENT`, `DESIGN` |
| **Dialect** | Determines the wire format for dispatching. The Daemon picks the right adapter. | `hermes` → HermesMCPAdapter, `openclaw` → OpenClawAdapter |

```
PM Daemon (tick loop)
  │
  │ 1. Fetch pending tasks
  │ 2. For each task, find online agents with matching lane
  │ 3. Select agent (priority + concurrency)
  │ 4. Look up agent.dialect → pick adapter
  │
  ├─ dialect: "hermes" ──→ HermesMCPAdapter ──→ POST to Hermes endpoint
  │                                              (MCP intent format)
  │
  └─ dialect: "openclaw" ─→ OpenClawAdapter ──→ POST to OpenClaw endpoint
                                               (OpenAI messages format)
```

**Result:** A single Nexus instance can dispatch coding tasks to OpenClaw and content tasks to Hermes simultaneously. Each agent processes tasks in its native format.

---

## Step 1: Register Both Agents

Register a Hermes worker (for content tasks) and an OpenClaw worker (for coding tasks):

### 1a. Register Hermes Worker (CONTENT lane)

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

### 1b. Register OpenClaw Worker (DEV lane)

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

> ⚠️ **OpenClaw version note:** The default port `8647` and path `/v1/runs` are based on the Nexus Dispatch reference configuration. Verify with your installed OpenClaw version via command.

---

## Step 2: Verify Both Agents Are Registered

```bash
curl -sS \
  "http://localhost:${NEXUS_API_PORT:-8000}/api/v1/runtime/projects/${NEXUS_PROJECT_ID:-nexus-dispatch}/agents" \
  -H "Authorization: Bearer ${API_AUTH_TOKEN}"
```

**Expected response** should show both agents:

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

Verify both agents show `"status": "online"` and the correct `dialect` values.

---

## Step 3: Create Tasks for Each Lane

### 3a. Content task → routed to Hermes

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

### 3b. Coding task → routed to OpenClaw

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

## Step 4: Verify Routing

With the PM Daemon running, it will automatically:
1. Pick up both pending tasks
2. Match `content-task-001` (lane: CONTENT) → `hermes-content-1` (dialect: hermes)
3. Match `dev-task-001` (lane: DEV) → `long-coder-1` (dialect: openclaw)
4. Dispatch each using the correct adapter

Check task statuses:

```bash
# Check content task
curl -sS \
  "http://localhost:${NEXUS_API_PORT:-8000}/api/v1/runtime/tasks/content-task-001?project_id=nexus-dispatch" \
  -H "Authorization: Bearer ${API_AUTH_TOKEN}"

# Check dev task
curl -sS \
  "http://localhost:${NEXUS_API_PORT:-8000}/api/v1/runtime/tasks/dev-task-001?project_id=nexus-dispatch" \
  -H "Authorization: Bearer ${API_AUTH_TOKEN}"
```

Both tasks should progress through the state machine: `created` → `dispatched` → `in_progress` → `completed`.

### Manual lifecycle (without Daemon)

If testing without the Daemon, drive each task through the lifecycle:

```bash
# Content task
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

# Dev task
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

## Step 5: Verify Completion

```bash
curl -sS \
  "http://localhost:${NEXUS_API_PORT:-8000}/api/v1/runtime/tasks/content-task-001?project_id=nexus-dispatch" \
  -H "Authorization: Bearer ${API_AUTH_TOKEN}" | python3 -c "import sys,json; print(json.load(sys.stdin).get('status'))"

curl -sS \
  "http://localhost:${NEXUS_API_PORT:-8000}/api/v1/runtime/tasks/dev-task-001?project_id=nexus-dispatch" \
  -H "Authorization: Bearer ${API_AUTH_TOKEN}" | python3 -c "import sys,json; print(json.load(sys.stdin).get('status'))"
```

**Expected:** Both should return `"completed"`.

---

## Telegram Notification Configuration

Each agent must have its **own** Telegram bot configured. The Daemon never sends on behalf of an agent.

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

**Rules:**
- Each agent_id maps to its own bot_token. Never share bot tokens between agents.
- Both agents can send to the same group chat (same `chat_id`) or different groups.
- Visible messages are human-readable — no raw JSON, task IDs, or tokens in chat.
- Full tracking data stays in the database and runtime proof.

---

## Concurrency & Scheduling

| Scenario | Behavior |
| --- | --- |
| Two tasks, different lanes | Dispatched simultaneously to different agents. |
| Two tasks, same lane, one agent with `max_concurrency: 1` | Processed sequentially. |
| Two tasks, same lane, agent with `max_concurrency: 2` | Processed in parallel by the same agent. |
| No agent matches a task's lane | Task stays in `pending` until a matching agent comes online. |

---

## Troubleshooting

| Symptom | Check Command | Common Cause / Fix |
| --- | --- | --- |
| Task stuck in `pending` | `curl -sS .../agents` — verify at least one agent matches the task's lane | No online agent with matching lane, or all matching agents at max concurrency. |
| Wrong agent picks up task | Check task `lane_required` vs agent `lane` fields | Lane mismatch — ensure task lane matches the intended agent's lane. |
| One agent receives all tasks | Check registered agents' `lane` values | Multiple agents registered with the same lane. Use distinct lanes for routing. |
| Hermes task sent as OpenAI format | Verify `dialect` field in agent registration | Agent registered with wrong `dialect`. Hermes agents must use `"hermes"`, OpenClaw must use `"openclaw"`. |
| OpenClaw task sent as MCP format | Same as above | Same fix — verify `dialect` field matches the agent type. |
| 401 on API calls | Verify `Authorization: Bearer` header | Token missing or mismatched. |
| Daemon not dispatching | `docker compose logs nexus-daemon --since=10m` | No pending tasks, all agents offline, or Daemon not running. |
| Telegram notifications missing for one agent | Check `AGENT_NOTIFICATIONS` for the specific `agent_id` | Missing or misconfigured bot config for that agent. |

---

## Next Steps

- [Hermes Agent Integration Guide](./hermes-agent.md) — detailed Hermes setup
- [OpenClaw Agent Integration Guide](./openclaw-agent.md) — detailed OpenClaw setup
- [Installation & Deployment Guide](../install.md) — full deployment reference
