# Hermes Agent Integration Guide

[English](./hermes-agent.md) · [简体中文](./hermes-agent.zh-CN.md) · [繁體中文](./hermes-agent.zh-TW.md)

---

## Overview

This guide shows you how to connect a **Hermes Agent** as a Worker to the Nexus Dispatch control plane. After integration, the PM Daemon will automatically dispatch tasks to your Hermes instance, and Hermes will execute them and submit proof back through the Runtime API.

**Who this is for:** Developers and operators running Hermes Agent who want it to receive and execute tasks from Nexus Dispatch automatically.

![Hermes integration](../assets/guide/hermes-integration.png)

---

## Prerequisites

Before you begin, make sure you have:

| Requirement | How to verify |
| --- | --- |
| Nexus Dispatch API Server running | `curl -I http://localhost:8000/api/v1/events/stream` |
| `API_AUTH_TOKEN` set in environment | `echo $API_AUTH_TOKEN` (must not be empty) |
| Hermes Agent installed | `hermes --version` |
| Hermes gateway configured (for Telegram delivery) | `hermes gateway status` |
| A project created in Nexus | See [Installation Guide](../install.md) §3.4 |

---

## Architecture

When the Daemon dispatches a task to a Hermes-type worker:

```
PM Daemon
  │
  │ selects task + matches agent (dialect: "hermes")
  │
  ▼
HermesMCPAdapter.adapt()
  │
  │ transforms task into MCP intent payload:
  │ {
  │   "mcp_intent": "execute_task",
  │   "task_id": "...",
  │   "parameters": { "title": "...", "description": "..." },
  │   "expected_artifact": "mcp_tool_call"
  │ }
  │
  ▼
POST → Hermes Worker Endpoint
  │
  │ Hermes receives intent, executes task,
  │ submits proof back via Runtime API
  │
  ▼
POST /api/v1/runtime/reports  (proof + artifacts)
POST /api/v1/runtime/tasks/transition  (state change)
```

**Key point:** The Hermes worker receives an MCP-style intent payload, NOT raw OpenAI messages. Your Hermes endpoint must understand the `{ mcp_intent, task_id, parameters }` format.

---

## Step 1: Register the Hermes Agent

Register your Hermes instance as a Worker in Nexus Dispatch:

```bash
curl -sS -X POST \
  "http://localhost:${NEXUS_API_PORT:-8000}/api/v1/runtime/projects/${NEXUS_PROJECT_ID:-nexus-dispatch}/agents" \
  -H "Authorization: Bearer ${API_AUTH_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{
    "agent_id": "hermes-worker-1",
    "endpoint": "http://your-hermes-host:8080/intent",
    "lane": "CONTENT",
    "dialect": "hermes",
    "soul_prompt": "You are a content production agent. Follow task instructions precisely and submit proof.",
    "tools_allowed": ["web", "browser", "file", "terminal"],
    "max_concurrency": 1,
    "status": "online"
  }'
```

**Field reference:**

| Field | Description |
| --- | --- |
| `agent_id` | Unique identifier for this worker. Use a descriptive name like `hermes-content-1`. |
| `endpoint` | URL where your Hermes instance accepts MCP intent payloads. |
| `lane` | Work type this agent handles: `DEV`, `CONTENT`, `DESIGN`, etc. |
| `dialect` | Must be `"hermes"` for Hermes-type workers. |
| `soul_prompt` | System-level instructions injected when the agent processes tasks. |
| `tools_allowed` | Toolsets the agent is permitted to use. |
| `max_concurrency` | Max parallel tasks. `1` is recommended for most setups. |
| `status` | `"online"` to start receiving tasks immediately. |

---

## Step 2: Verify Registration

Confirm the agent is registered:

```bash
curl -sS \
  "http://localhost:${NEXUS_API_PORT:-8000}/api/v1/runtime/projects/${NEXUS_PROJECT_ID:-nexus-dispatch}/agents" \
  -H "Authorization: Bearer ${API_AUTH_TOKEN}"
```

**Expected response** should include your agent:

```json
{
  "agents": [
    {
      "id": "hermes-worker-1",
      "lane": "CONTENT",
      "dialect": "hermes",
      "status": "online",
      "endpoint": "http://your-hermes-host:8080/intent"
    }
  ]
}
```

---

## Step 3: Create a Test Task

Create a simple task to test the integration:

```bash
curl -sS -X POST \
  "http://localhost:${NEXUS_API_PORT:-8000}/api/v1/runtime/tasks" \
  -H "Authorization: Bearer ${API_AUTH_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{
    "project_id": "nexus-dispatch",
    "id": "hermes-test-001",
    "title": "Hermes Integration Test",
    "objective": "Verify that the Hermes worker receives and processes a dispatched task correctly.",
    "lane_required": "CONTENT",
    "acceptance_mode": "group_only",
    "acceptance_criteria": [
      "Task reaches completed through Runtime API transitions",
      "Proof artifact is submitted by the Hermes worker"
    ]
  }'
```

---

## Step 4: Drive the Task Lifecycle

If you're testing manually (without the Daemon running), drive the lifecycle with these transitions:

```bash
for event in dispatch start submit_completion request_review review_pass; do
  curl -sS -X POST \
    "http://localhost:${NEXUS_API_PORT:-8000}/api/v1/runtime/tasks/transition" \
    -H "Authorization: Bearer ${API_AUTH_TOKEN}" \
    -H "Content-Type: application/json" \
    -d "{
      \"project_id\": \"nexus-dispatch\",
      \"task_id\": \"hermes-test-001\",
      \"event\": \"${event}\",
      \"proof\": { \"source\": \"hermes-worker-1\", \"type\": \"integration-test\" }
    }"
done
```

If the PM Daemon is running, it will handle dispatch automatically. The Hermes worker should:
1. Receive the MCP intent payload at its endpoint
2. Execute the task using its configured tools
3. Submit proof via `POST /api/v1/runtime/reports`
4. Transition the task state via `POST /api/v1/runtime/tasks/transition`

---

## Step 5: Verify Task Completion

```bash
curl -sS \
  "http://localhost:${NEXUS_API_PORT:-8000}/api/v1/runtime/tasks/hermes-test-001?project_id=nexus-dispatch" \
  -H "Authorization: Bearer ${API_AUTH_TOKEN}"
```

**Expected:** `status` field should be `"completed"`.

---

## Hermes Worker Endpoint Requirements

Your Hermes instance must expose an HTTP endpoint that:

1. **Accepts POST** with JSON body in MCP intent format:
   ```json
   {
     "mcp_intent": "execute_task",
     "task_id": "some-task-id",
     "parameters": {
       "title": "Task Title",
       "description": "Task description"
     },
     "expected_artifact": "mcp_tool_call"
   }
   ```

2. **Returns a response** with proof of execution.

3. **Submits proof** back to the Nexus Runtime API:
   ```bash
   curl -sS -X POST \
     "http://localhost:8000/api/v1/runtime/reports" \
     -H "Authorization: Bearer ${API_AUTH_TOKEN}" \
     -H "Content-Type: application/json" \
     -d '{
       "project_id": "nexus-dispatch",
       "task_id": "hermes-test-001",
       "run_id": "run-001",
       "type": "completion",
       "content": { "summary": "Task completed successfully", "files_changed": ["..."] }
     }'
   ```

### Setting up the endpoint with Hermes

You can run Hermes in gateway mode and configure a webhook to handle incoming intents:

```bash
# Start Hermes gateway
hermes gateway run

# Or configure a specific webhook route
hermes webhook subscribe nexus-intent
```

Alternatively, run Hermes with a custom script that listens on the endpoint and dispatches to `hermes chat -q`:

```bash
# One-shot execution mode
hermes chat -q "Execute task: {task_title}. Description: {task_description}"
```

---

## Telegram Notification Setup

Each agent sends notifications via its **own** Telegram bot. Configure in your environment:

```bash
AGENT_NOTIFICATIONS='{
  "hermes-worker-1": {
    "bot_token": "${HERMES_WORKER_BOT_TOKEN}",
    "chat_id": "${NEXUS_GROUP_CHAT_ID}"
  }
}'
```

**Rules:**
- Never use the Daemon bot or PM bot to send on behalf of the agent.
- Visible messages are human-readable only — no raw JSON, task IDs, or tokens in chat.
- Full tracking data stays in the database and runtime proof.

---

## Troubleshooting

| Symptom | Check Command | Common Cause / Fix |
| --- | --- | --- |
| Agent not receiving tasks | `curl -sS .../agents` — verify `status: "online"` and `dialect: "hermes"` | Agent status is offline, or lane doesn't match any pending task. |
| Daemon not dispatching | Check Daemon logs: `docker compose logs nexus-daemon --since=10m` | No pending tasks, agent not online, lane mismatch, or worker endpoint unreachable. |
| Worker endpoint returns error | `curl -X POST http://your-hermes-host:8080/intent -d '{}'` | Hermes gateway not running, wrong port, firewall blocking. |
| 401 on API calls | Verify `Authorization: Bearer` header matches `API_AUTH_TOKEN` | Token missing, mismatched, or not set in environment. |
| Proof not accepted | Check task state: `GET /api/v1/runtime/tasks/{id}?project_id=...` | Task may already be in a terminal state, or transition sequence is wrong. |
| Hermes MCP errors | `hermes doctor` and check logs | Hermes not configured for MCP, or skill/plugin missing. |
| Telegram silent | Verify `AGENT_NOTIFICATIONS` JSON and bot permissions | Missing bot config for agent, bad token/chat_id, bot lacks group permissions. |

---

## Next Steps

- [OpenClaw Agent Integration Guide](./openclaw-agent.md) — connect an OpenClaw worker
- [Dual-Agent Guide](./dual-agent.md) — run Hermes and OpenClaw workers together
- [Installation & Deployment Guide](../install.md) — full deployment reference
- [Hermes Agent Docs](https://hermes-agent.nousresearch.com/docs/) — official Hermes documentation
