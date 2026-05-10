# OpenClaw Agent Integration Guide

[English](./openclaw-agent.md) · [简体中文](./openclaw-agent.zh-CN.md) · [繁體中文](./openclaw-agent.zh-TW.md)

---

## Overview

This guide shows you how to connect an **OpenClaw Agent** as a Worker to the Nexus Dispatch control plane. After integration, the PM Daemon will automatically dispatch tasks to your OpenClaw instance using the OpenAI-compatible messages format, and the worker submits proof back through the Runtime API.

**Who this is for:** Developers and operators running OpenClaw (or any OpenAI-compatible coding agent) who want it to receive and execute tasks from Nexus Dispatch automatically.

![OpenClaw integration](../assets/guide/openclaw-integration.png)

---

## Prerequisites

Before you begin, make sure you have:

| Requirement | How to verify |
| --- | --- |
| Nexus Dispatch API Server running | `curl -I http://localhost:8000/api/v1/events/stream` |
| `API_AUTH_TOKEN` set in environment | `echo $API_AUTH_TOKEN` (must not be empty) |
| OpenClaw installed and configured | Verify with your installation method |
| OpenClaw worker endpoint reachable | `curl -I http://your-openclaw-host:8647/v1/runs` |
| A project created in Nexus | See [Installation Guide](../install.md) §3.4 |

> ⚠️ **Version note:** OpenClaw CLI flags, default ports, and endpoint paths may vary between versions. Verify with your installed version via command. The endpoint path `/v1/runs` shown in this guide is based on the Nexus Dispatch default configuration — adjust if your OpenClaw instance uses a different route.

---

## Architecture

When the Daemon dispatches a task to an OpenClaw-type worker:

```
PM Daemon
  │
  │ selects task + matches agent (dialect: "openclaw")
  │
  ▼
OpenClawAdapter.adapt()
  │
  │ transforms task into OpenAI messages payload:
  │ {
  │   "messages": [
  │     { "role": "system", "content": "You are an OpenClaw Agent..." },
  │     { "role": "user", "content": "Execute Task: ...\nDescription: ..." }
  │   ],
  │   "tools": [
  │     { "type": "function", "function": { "name": "submit_proof", ... } }
  │   ]
  │ }
  │
  ▼
POST → OpenClaw Worker Endpoint (/v1/runs)
  │
  │ OpenClaw receives messages, executes task,
  │ submits proof back via Runtime API
  │
  ▼
POST /api/v1/runtime/reports  (proof + artifacts)
POST /api/v1/runtime/tasks/transition  (state change)
```

**Key point:** The OpenClaw worker receives OpenAI-compatible chat messages with tool definitions. Your endpoint must accept the `{ messages, tools }` format and handle the `submit_proof` tool call.

---

## Step 1: Register the OpenClaw Agent

Register your OpenClaw instance as a Worker in Nexus Dispatch:

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

**Field reference:**

| Field | Description |
| --- | --- |
| `agent_id` | Unique identifier for this worker. Use a descriptive name like `long-coder-1`. |
| `endpoint` | URL where your OpenClaw instance accepts dispatch payloads. Default: `http://host:8647/v1/runs`. |
| `lane` | Work type this agent handles: `DEV`, `CONTENT`, `DESIGN`, etc. |
| `dialect` | Must be `"openclaw"` for OpenClaw-type workers. |
| `soul_prompt` | System-level instructions injected into the messages payload when the agent processes tasks. |
| `tools_allowed` | Toolsets the agent is permitted to use. |
| `max_concurrency` | Max parallel tasks. `1` is recommended for most setups. |
| `status` | `"online"` to start receiving tasks immediately. |

> ⚠️ **Verify with your version:** The default port `8647` and endpoint path `/v1/runs` are based on the Nexus Dispatch reference configuration. Your OpenClaw version may use a different port or path — verify with your installed version via command.

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
      "id": "long-coder-1",
      "lane": "DEV",
      "dialect": "openclaw",
      "status": "online",
      "endpoint": "http://your-openclaw-host:8647/v1/runs"
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
    "id": "openclaw-test-001",
    "title": "OpenClaw Integration Test",
    "objective": "Verify that the OpenClaw worker receives and processes a dispatched task correctly.",
    "lane_required": "DEV",
    "acceptance_mode": "group_only",
    "acceptance_criteria": [
      "Task reaches completed through Runtime API transitions",
      "Proof artifact is submitted by the OpenClaw worker"
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
      \"task_id\": \"openclaw-test-001\",
      \"event\": \"${event}\",
      \"proof\": { \"source\": \"long-coder-1\", \"type\": \"integration-test\" }
    }"
done
```

If the PM Daemon is running, it will handle dispatch automatically. The OpenClaw worker should:
1. Receive the OpenAI messages payload at its endpoint
2. Execute the task using the `submit_proof` tool and other available tools
3. Submit proof via `POST /api/v1/runtime/reports`
4. Transition the task state via `POST /api/v1/runtime/tasks/transition`

---

## Step 5: Verify Task Completion

```bash
curl -sS \
  "http://localhost:${NEXUS_API_PORT:-8000}/api/v1/runtime/tasks/openclaw-test-001?project_id=nexus-dispatch" \
  -H "Authorization: Bearer ${API_AUTH_TOKEN}"
```

**Expected:** `status` field should be `"completed"`.

---

## OpenClaw Worker Endpoint Requirements

Your OpenClaw instance must expose an HTTP endpoint that:

1. **Accepts POST** with JSON body in OpenAI messages format:
   ```json
   {
     "messages": [
       {
         "role": "system",
         "content": "You are an OpenClaw Agent executing a task. You must return tool calls to perform actions."
       },
       {
         "role": "user",
         "content": "Execute Task: Fix the authentication bug\nDescription: The login endpoint returns 500..."
       }
     ],
     "tools": [
       {
         "type": "function",
         "function": {
           "name": "submit_proof",
           "description": "Submit task completion proof",
           "parameters": {
             "type": "object",
             "properties": {
               "proof": { "type": "string" }
             },
             "required": ["proof"]
           }
         }
       }
     ]
   }
   ```

2. **Returns a response** containing tool calls, including `submit_proof` with the execution results.

3. **Submits proof** back to the Nexus Runtime API:
   ```bash
   curl -sS -X POST \
     "http://localhost:8000/api/v1/runtime/reports" \
     -H "Authorization: Bearer ${API_AUTH_TOKEN}" \
     -H "Content-Type: application/json" \
     -d '{
       "project_id": "nexus-dispatch",
       "task_id": "openclaw-test-001",
       "run_id": "run-001",
       "type": "completion",
       "content": { "summary": "Task completed successfully", "files_changed": ["src/auth.ts"] }
     }'
   ```

> ⚠️ **以实际版本为准 / verify with command:** The exact request/response format depends on your OpenClaw version. Check the OpenClaw documentation for your specific version's API contract.

---

## Telegram Notification Setup

Each agent sends notifications via its **own** Telegram bot. Configure in your environment:

```bash
AGENT_NOTIFICATIONS='{
  "long-coder-1": {
    "bot_token": "${LONG_CODER_BOT_TOKEN}",
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
| Agent not receiving tasks | `curl -sS .../agents` — verify `status: "online"` and `dialect: "openclaw"` | Agent status is offline, or lane doesn't match any pending task. |
| Daemon not dispatching | Check Daemon logs: `docker compose logs nexus-daemon --since=10m` | No pending tasks, agent not online, lane mismatch, or worker endpoint unreachable. |
| Worker endpoint returns error | `curl -X POST http://your-openclaw-host:8647/v1/runs -d '{}'` | OpenClaw not running, wrong port, firewall blocking. |
| 401 on API calls | Verify `Authorization: Bearer` header matches `API_AUTH_TOKEN` | Token missing, mismatched, or not set in environment. |
| Proof not accepted | Check task state: `GET /api/v1/runtime/tasks/{id}?project_id=...` | Task may already be in a terminal state, or transition sequence is wrong. |
| Adapter payload mismatch | Check Daemon logs for adapter errors | OpenClaw version may expect a different message format. Verify with your installed version. |
| Telegram silent | Verify `AGENT_NOTIFICATIONS` JSON and bot permissions | Missing bot config for agent, bad token/chat_id, bot lacks group permissions. |

---

## Next Steps

- [Hermes Agent Integration Guide](./hermes-agent.md) — connect a Hermes worker
- [Dual-Agent Guide](./dual-agent.md) — run Hermes and OpenClaw workers together
- [Installation & Deployment Guide](../install.md) — full deployment reference
