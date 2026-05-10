     1|# OpenClaw Agent Integration Guide
     2|
     3|[English](./openclaw-agent.md) · [简体中文](./openclaw-agent.zh-CN.md) · [繁體中文](./openclaw-agent.zh-TW.md)
     4|
     5|---
     6|
     7|## Overview
     8|
     9|This guide shows you how to connect an **OpenClaw Agent** as a Worker to the Nexus Dispatch control plane. After integration, the PM Daemon will automatically dispatch tasks to your OpenClaw instance using the OpenAI-compatible messages format, and the worker submits proof back through the Runtime API.
    10|
    11|**Who this is for:** Developers and operators running OpenClaw (or any OpenAI-compatible coding agent) who want it to receive and execute tasks from Nexus Dispatch automatically.
    12|
    13|![OpenClaw integration](../assets/guide/openclaw-integration.png)
    14|
    15|---
    16|
    17|## Prerequisites
    18|
    19|Before you begin, make sure you have:
    20|
    21|| Requirement | How to verify |
    22|| --- | --- |
    23|| Nexus Dispatch API Server running | `curl -I http://localhost:8000/api/v1/events/stream` |
    24|| `API_AUTH_TOKEN` set in environment | `echo $API_AUTH_TOKEN` (must not be empty) |
    25|| OpenClaw installed and configured | Verify with your installation method |
    26|| OpenClaw worker endpoint reachable | `curl -I http://your-openclaw-host:8647/v1/runs` |
    27|| A project created in Nexus | See [Installation Guide](../install.md) §3.4 |
    28|
    29|> ⚠️ **Version note:** OpenClaw CLI flags, default ports, and endpoint paths may vary between versions. Verify with your installed version via command. The endpoint path `/v1/runs` shown in this guide is based on the Nexus Dispatch default configuration — adjust if your OpenClaw instance uses a different route.
    30|
    31|---
    32|
    33|## Architecture
    34|
    35|When the Daemon dispatches a task to an OpenClaw-type worker:
    36|
    37|```
    38|PM Daemon
    39|  │
    40|  │ selects task + matches agent (dialect: "openclaw")
    41|  │
    42|  ▼
    43|OpenClawAdapter.adapt()
    44|  │
    45|  │ transforms task into OpenAI messages payload:
    46|  │ {
    47|  │   "messages": [
    48|  │     { "role": "system", "content": "You are an OpenClaw Agent..." },
    49|  │     { "role": "user", "content": "Execute Task: ...\nDescription: ..." }
    50|  │   ],
    51|  │   "tools": [
    52|  │     { "type": "function", "function": { "name": "submit_proof", ... } }
    53|  │   ]
    54|  │ }
    55|  │
    56|  ▼
    57|POST → OpenClaw Worker Endpoint (/v1/runs)
    58|  │
    59|  │ OpenClaw receives messages, executes task,
    60|  │ submits proof back via Runtime API
    61|  │
    62|  ▼
    63|POST /api/v1/runtime/reports  (proof + artifacts)
    64|POST /api/v1/runtime/tasks/transition  (state change)
    65|```
    66|
    67|**Key point:** The OpenClaw worker receives OpenAI-compatible chat messages with tool definitions. Your endpoint must accept the `{ messages, tools }` format and handle the `submit_proof` tool call.
    68|
    69|---
    70|
    71|## Step 1: Register the OpenClaw Agent
    72|
    73|Register your OpenClaw instance as a Worker in Nexus Dispatch:
    74|
    75|```bash
    76|curl -sS -X POST \
    77|  "http://localhost:${NEXUS_API_PORT:-8000}/api/v1/runtime/projects/${NEXUS_PROJECT_ID:-nexus-dispatch}/agents" \
    78|  -H "Authorization: Bearer ${API_AUTH_TOKEN}" \
    79|  -H "Content-Type: application/json" \
    80|  -d '{
    81|    "agent_id": "long-coder-1",
    82|    "endpoint": "http://your-openclaw-host:8647/v1/runs",
    83|    "lane": "DEV",
    84|    "dialect": "openclaw",
    85|    "soul_prompt": "You are a coding agent. Execute tasks precisely, write clean code, and submit proof of completion.",
    86|    "tools_allowed": ["terminal", "file", "web"],
    87|    "max_concurrency": 1,
    88|    "status": "online"
    89|  }'
    90|```
    91|
    92|**Field reference:**
    93|
    94|| Field | Description |
    95|| --- | --- |
    96|| `agent_id` | Unique identifier for this worker. Use a descriptive name like `long-coder-1`. |
    97|| `endpoint` | URL where your OpenClaw instance accepts dispatch payloads. Default: `http://host:8647/v1/runs`. |
    98|| `lane` | Work type this agent handles: `DEV`, `CONTENT`, `DESIGN`, etc. |
    99|| `dialect` | Must be `"openclaw"` for OpenClaw-type workers. |
   100|| `soul_prompt` | System-level instructions injected into the messages payload when the agent processes tasks. |
   101|| `tools_allowed` | Toolsets the agent is permitted to use. |
   102|| `max_concurrency` | Max parallel tasks. `1` is recommended for most setups. |
   103|| `status` | `"online"` to start receiving tasks immediately. |
   104|
   105|> ⚠️ **Verify with your version:** The default port `8647` and endpoint path `/v1/runs` are based on the Nexus Dispatch reference configuration. Your OpenClaw version may use a different port or path — verify with your installed version via command.
   106|
   107|---
   108|
   109|## Step 2: Verify Registration
   110|
   111|Confirm the agent is registered:
   112|
   113|```bash
   114|curl -sS \
   115|  "http://localhost:${NEXUS_API_PORT:-8000}/api/v1/runtime/projects/${NEXUS_PROJECT_ID:-nexus-dispatch}/agents" \
   116|  -H "Authorization: Bearer ${API_AUTH_TOKEN}"
   117|```
   118|
   119|**Expected response** should include your agent:
   120|
   121|```json
   122|{
   123|  "agents": [
   124|    {
   125|      "id": "long-coder-1",
   126|      "lane": "DEV",
   127|      "dialect": "openclaw",
   128|      "status": "online",
   129|      "endpoint": "http://your-openclaw-host:8647/v1/runs"
   130|    }
   131|  ]
   132|}
   133|```
   134|
   135|---
   136|
   137|## Step 3: Create a Test Task
   138|
   139|Create a simple task to test the integration:
   140|
   141|```bash
   142|curl -sS -X POST \
   143|  "http://localhost:${NEXUS_API_PORT:-8000}/api/v1/runtime/tasks" \
   144|  -H "Authorization: Bearer ${API_AUTH_TOKEN}" \
   145|  -H "Content-Type: application/json" \
   146|  -d '{
   147|    "project_id": "nexus-dispatch",
   148|    "id": "openclaw-test-001",
   149|    "title": "OpenClaw Integration Test",
   150|    "objective": "Verify that the OpenClaw worker receives and processes a dispatched task correctly.",
   151|    "lane_required": "DEV",
   152|    "acceptance_mode": "group_only",
   153|    "acceptance_criteria": [
   154|      "Task reaches completed through Runtime API transitions",
   155|      "Proof artifact is submitted by the OpenClaw worker"
   156|    ]
   157|  }'
   158|```
   159|
   160|---
   161|
   162|## Step 4: Drive the Task Lifecycle
   163|
   164|If you're testing manually (without the Daemon running), drive the lifecycle with these transitions:
   165|
   166|```bash
   167|for event in dispatch start submit_completion request_review review_pass; do
   168|  curl -sS -X POST \
   169|    "http://localhost:${NEXUS_API_PORT:-8000}/api/v1/runtime/tasks/transition" \
   170|    -H "Authorization: Bearer ${API_AUTH_TOKEN}" \
   171|    -H "Content-Type: application/json" \
   172|    -d "{
   173|      \"project_id\": \"nexus-dispatch\",
   174|      \"task_id\": \"openclaw-test-001\",
   175|      \"event\": \"${event}\",
   176|      \"proof\": { \"source\": \"long-coder-1\", \"type\": \"integration-test\" }
   177|    }"
   178|done
   179|```
   180|
   181|If the PM Daemon is running, it will handle dispatch automatically. The OpenClaw worker should:
   182|1. Receive the OpenAI messages payload at its endpoint
   183|2. Execute the task using the `submit_proof` tool and other available tools
   184|3. Submit proof via `POST /api/v1/runtime/reports`
   185|4. Transition the task state via `POST /api/v1/runtime/tasks/transition`
   186|
   187|---
   188|
   189|## Step 5: Verify Task Completion
   190|
   191|```bash
   192|curl -sS \
   193|  "http://localhost:${NEXUS_API_PORT:-8000}/api/v1/runtime/tasks/openclaw-test-001?project_id=nexus-dispatch" \
   194|  -H "Authorization: Bearer ${API_AUTH_TOKEN}"
   195|```
   196|
   197|**Expected:** `status` field should be `"completed"`.
   198|
   199|---
   200|
   201|## OpenClaw Worker Endpoint Requirements
   202|
   203|Your OpenClaw instance must expose an HTTP endpoint that:
   204|
   205|1. **Accepts POST** with JSON body in OpenAI messages format:
   206|   ```json
   207|   {
   208|     "messages": [
   209|       {
   210|         "role": "system",
   211|         "content": "You are an OpenClaw Agent executing a task. You must return tool calls to perform actions."
   212|       },
   213|       {
   214|         "role": "user",
   215|         "content": "Execute Task: Fix the authentication bug\nDescription: The login endpoint returns 500..."
   216|       }
   217|     ],
   218|     "tools": [
   219|       {
   220|         "type": "function",
   221|         "function": {
   222|           "name": "submit_proof",
   223|           "description": "Submit task completion proof",
   224|           "parameters": {
   225|             "type": "object",
   226|             "properties": {
   227|               "proof": { "type": "string" }
   228|             },
   229|             "required": ["proof"]
   230|           }
   231|         }
   232|       }
   233|     ]
   234|   }
   235|   ```
   236|
   237|2. **Returns a response** containing tool calls, including `submit_proof` with the execution results.
   238|
   239|3. **Submits proof** back to the Nexus Runtime API:
   240|   ```bash
   241|   curl -sS -X POST \
   242|     "http://localhost:8000/api/v1/runtime/reports" \
   243|     -H "Authorization: Bearer ${API_AUTH_TOKEN}" \
   244|     -H "Content-Type: application/json" \
   245|     -d '{
   246|       "project_id": "nexus-dispatch",
   247|       "task_id": "openclaw-test-001",
   248|       "run_id": "run-001",
   249|       "type": "completion",
   250|       "content": { "summary": "Task completed successfully", "files_changed": ["src/auth.ts"] }
   251|     }'
   252|   ```
   253|
   254|> ⚠️ **以实际版本为准 / verify with command:** The exact request/response format depends on your OpenClaw version. Check the OpenClaw documentation for your specific version's API contract.
   255|
   256|---
   257|
   258|## Telegram Notification Setup
   259|
   260|Each agent sends notifications via its **own** Telegram bot. Configure in your environment:
   261|
   262|```bash
   263|AGENT_NOTIFICATIONS='{
   264|  "long-coder-1": {
   265|    "bot_token": "${LONG_CODER_BOT_TOKEN}",
   266|    "chat_id": "${NEXUS_GROUP_CHAT_ID}"
   267|  }
   268|}'
   269|```
   270|
   271|**Rules:**
   272|- Never use the Daemon bot or PM bot to send on behalf of the agent.
   273|- Visible messages are human-readable only — no raw JSON, task IDs, or tokens in chat.
   274|- Full tracking data stays in the database and runtime proof.
   275|
   276|---
   277|
   278|## Troubleshooting
   279|
   280|| Symptom | Check Command | Common Cause / Fix |
   281|| --- | --- | --- |
   282|| Agent not receiving tasks | `curl -sS .../agents` — verify `status: "online"` and `dialect: "openclaw"` | Agent status is offline, or lane doesn't match any pending task. |
   283|| Daemon not dispatching | Check Daemon logs: `docker compose logs nexus-daemon --since=10m` | No pending tasks, agent not online, lane mismatch, or worker endpoint unreachable. |
   284|| Worker endpoint returns error | `curl -X POST http://your-openclaw-host:8647/v1/runs -d '{}'` | OpenClaw not running, wrong port, firewall blocking. |
   285|| 401 on API calls | Verify `Authorization: Bearer` header matches `API_AUTH_TOKEN` | Token missing, mismatched, or not set in environment. |
   286|| Proof not accepted | Check task state: `GET /api/v1/runtime/tasks/{id}?project_id=...` | Task may already be in a terminal state, or transition sequence is wrong. |
   287|| Adapter payload mismatch | Check Daemon logs for adapter errors | OpenClaw version may expect a different message format. Verify with your installed version. |
   288|| Telegram silent | Verify `AGENT_NOTIFICATIONS` JSON and bot permissions | Missing bot config for agent, bad token/chat_id, bot lacks group permissions. |
   289|
   290|---
   291|
   292|## Next Steps
   293|
   294|- [Hermes Agent Integration Guide](./hermes-agent.md) — connect a Hermes worker
   295|- [Dual-Agent Guide](./dual-agent.md) — run Hermes and OpenClaw workers together
   296|- [Installation & Deployment Guide](../install.md) — full deployment reference
   297|