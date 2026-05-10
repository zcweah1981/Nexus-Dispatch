     1|# Hermes Agent Integration Guide
     2|
     3|[English](./hermes-agent.md) · [简体中文](./hermes-agent.zh-CN.md) · [繁體中文](./hermes-agent.zh-TW.md)
     4|
     5|---
     6|
     7|## Overview
     8|
     9|This guide shows you how to connect a **Hermes Agent** as a Worker to the Nexus Dispatch control plane. After integration, the PM Daemon will automatically dispatch tasks to your Hermes instance, and Hermes will execute them and submit proof back through the Runtime API.
    10|
    11|**Who this is for:** Developers and operators running Hermes Agent who want it to receive and execute tasks from Nexus Dispatch automatically.
    12|
    13|![Hermes integration](../assets/guide/hermes-integration.png)
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
    25|| Hermes Agent installed | `hermes --version` |
    26|| Hermes gateway configured (for Telegram delivery) | `hermes gateway status` |
    27|| A project created in Nexus | See [Installation Guide](../install.md) §3.4 |
    28|
    29|---
    30|
    31|## Architecture
    32|
    33|When the Daemon dispatches a task to a Hermes-type worker:
    34|
    35|```
    36|PM Daemon
    37|  │
    38|  │ selects task + matches agent (dialect: "hermes")
    39|  │
    40|  ▼
    41|HermesMCPAdapter.adapt()
    42|  │
    43|  │ transforms task into MCP intent payload:
    44|  │ {
    45|  │   "mcp_intent": "execute_task",
    46|  │   "task_id": "...",
    47|  │   "parameters": { "title": "...", "description": "..." },
    48|  │   "expected_artifact": "mcp_tool_call"
    49|  │ }
    50|  │
    51|  ▼
    52|POST → Hermes Worker Endpoint
    53|  │
    54|  │ Hermes receives intent, executes task,
    55|  │ submits proof back via Runtime API
    56|  │
    57|  ▼
    58|POST /api/v1/runtime/reports  (proof + artifacts)
    59|POST /api/v1/runtime/tasks/transition  (state change)
    60|```
    61|
    62|**Key point:** The Hermes worker receives an MCP-style intent payload, NOT raw OpenAI messages. Your Hermes endpoint must understand the `{ mcp_intent, task_id, parameters }` format.
    63|
    64|---
    65|
    66|## Step 1: Register the Hermes Agent
    67|
    68|Register your Hermes instance as a Worker in Nexus Dispatch:
    69|
    70|```bash
    71|curl -sS -X POST \
    72|  "http://localhost:${NEXUS_API_PORT:-8000}/api/v1/runtime/projects/${NEXUS_PROJECT_ID:-nexus-dispatch}/agents" \
    73|  -H "Authorization: Bearer ${API_AUTH_TOKEN}" \
    74|  -H "Content-Type: application/json" \
    75|  -d '{
    76|    "agent_id": "hermes-worker-1",
    77|    "endpoint": "http://your-hermes-host:8080/intent",
    78|    "lane": "CONTENT",
    79|    "dialect": "hermes",
    80|    "soul_prompt": "You are a content production agent. Follow task instructions precisely and submit proof.",
    81|    "tools_allowed": ["web", "browser", "file", "terminal"],
    82|    "max_concurrency": 1,
    83|    "status": "online"
    84|  }'
    85|```
    86|
    87|**Field reference:**
    88|
    89|| Field | Description |
    90|| --- | --- |
    91|| `agent_id` | Unique identifier for this worker. Use a descriptive name like `hermes-content-1`. |
    92|| `endpoint` | URL where your Hermes instance accepts MCP intent payloads. |
    93|| `lane` | Work type this agent handles: `DEV`, `CONTENT`, `DESIGN`, etc. |
    94|| `dialect` | Must be `"hermes"` for Hermes-type workers. |
    95|| `soul_prompt` | System-level instructions injected when the agent processes tasks. |
    96|| `tools_allowed` | Toolsets the agent is permitted to use. |
    97|| `max_concurrency` | Max parallel tasks. `1` is recommended for most setups. |
    98|| `status` | `"online"` to start receiving tasks immediately. |
    99|
   100|---
   101|
   102|## Step 2: Verify Registration
   103|
   104|Confirm the agent is registered:
   105|
   106|```bash
   107|curl -sS \
   108|  "http://localhost:${NEXUS_API_PORT:-8000}/api/v1/runtime/projects/${NEXUS_PROJECT_ID:-nexus-dispatch}/agents" \
   109|  -H "Authorization: Bearer ${API_AUTH_TOKEN}"
   110|```
   111|
   112|**Expected response** should include your agent:
   113|
   114|```json
   115|{
   116|  "agents": [
   117|    {
   118|      "id": "hermes-worker-1",
   119|      "lane": "CONTENT",
   120|      "dialect": "hermes",
   121|      "status": "online",
   122|      "endpoint": "http://your-hermes-host:8080/intent"
   123|    }
   124|  ]
   125|}
   126|```
   127|
   128|---
   129|
   130|## Step 3: Create a Test Task
   131|
   132|Create a simple task to test the integration:
   133|
   134|```bash
   135|curl -sS -X POST \
   136|  "http://localhost:${NEXUS_API_PORT:-8000}/api/v1/runtime/tasks" \
   137|  -H "Authorization: Bearer ${API_AUTH_TOKEN}" \
   138|  -H "Content-Type: application/json" \
   139|  -d '{
   140|    "project_id": "nexus-dispatch",
   141|    "id": "hermes-test-001",
   142|    "title": "Hermes Integration Test",
   143|    "objective": "Verify that the Hermes worker receives and processes a dispatched task correctly.",
   144|    "lane_required": "CONTENT",
   145|    "acceptance_mode": "group_only",
   146|    "acceptance_criteria": [
   147|      "Task reaches completed through Runtime API transitions",
   148|      "Proof artifact is submitted by the Hermes worker"
   149|    ]
   150|  }'
   151|```
   152|
   153|---
   154|
   155|## Step 4: Drive the Task Lifecycle
   156|
   157|If you're testing manually (without the Daemon running), drive the lifecycle with these transitions:
   158|
   159|```bash
   160|for event in dispatch start submit_completion request_review review_pass; do
   161|  curl -sS -X POST \
   162|    "http://localhost:${NEXUS_API_PORT:-8000}/api/v1/runtime/tasks/transition" \
   163|    -H "Authorization: Bearer ${API_AUTH_TOKEN}" \
   164|    -H "Content-Type: application/json" \
   165|    -d "{
   166|      \"project_id\": \"nexus-dispatch\",
   167|      \"task_id\": \"hermes-test-001\",
   168|      \"event\": \"${event}\",
   169|      \"proof\": { \"source\": \"hermes-worker-1\", \"type\": \"integration-test\" }
   170|    }"
   171|done
   172|```
   173|
   174|If the PM Daemon is running, it will handle dispatch automatically. The Hermes worker should:
   175|1. Receive the MCP intent payload at its endpoint
   176|2. Execute the task using its configured tools
   177|3. Submit proof via `POST /api/v1/runtime/reports`
   178|4. Transition the task state via `POST /api/v1/runtime/tasks/transition`
   179|
   180|---
   181|
   182|## Step 5: Verify Task Completion
   183|
   184|```bash
   185|curl -sS \
   186|  "http://localhost:${NEXUS_API_PORT:-8000}/api/v1/runtime/tasks/hermes-test-001?project_id=nexus-dispatch" \
   187|  -H "Authorization: Bearer ${API_AUTH_TOKEN}"
   188|```
   189|
   190|**Expected:** `status` field should be `"completed"`.
   191|
   192|---
   193|
   194|## Hermes Worker Endpoint Requirements
   195|
   196|Your Hermes instance must expose an HTTP endpoint that:
   197|
   198|1. **Accepts POST** with JSON body in MCP intent format:
   199|   ```json
   200|   {
   201|     "mcp_intent": "execute_task",
   202|     "task_id": "some-task-id",
   203|     "parameters": {
   204|       "title": "Task Title",
   205|       "description": "Task description"
   206|     },
   207|     "expected_artifact": "mcp_tool_call"
   208|   }
   209|   ```
   210|
   211|2. **Returns a response** with proof of execution.
   212|
   213|3. **Submits proof** back to the Nexus Runtime API:
   214|   ```bash
   215|   curl -sS -X POST \
   216|     "http://localhost:8000/api/v1/runtime/reports" \
   217|     -H "Authorization: Bearer ${API_AUTH_TOKEN}" \
   218|     -H "Content-Type: application/json" \
   219|     -d '{
   220|       "project_id": "nexus-dispatch",
   221|       "task_id": "hermes-test-001",
   222|       "run_id": "run-001",
   223|       "type": "completion",
   224|       "content": { "summary": "Task completed successfully", "files_changed": ["..."] }
   225|     }'
   226|   ```
   227|
   228|### Setting up the endpoint with Hermes
   229|
   230|You can run Hermes in gateway mode and configure a webhook to handle incoming intents:
   231|
   232|```bash
   233|# Start Hermes gateway
   234|hermes gateway run
   235|
   236|# Or configure a specific webhook route
   237|hermes webhook subscribe nexus-intent
   238|```
   239|
   240|Alternatively, run Hermes with a custom script that listens on the endpoint and dispatches to `hermes chat -q`:
   241|
   242|```bash
   243|# One-shot execution mode
   244|hermes chat -q "Execute task: {task_title}. Description: {task_description}"
   245|```
   246|
   247|---
   248|
   249|## Telegram Notification Setup
   250|
   251|Each agent sends notifications via its **own** Telegram bot. Configure in your environment:
   252|
   253|```bash
   254|AGENT_NOTIFICATIONS='{
   255|  "hermes-worker-1": {
   256|    "bot_token": "${HERMES_WORKER_BOT_TOKEN}",
   257|    "chat_id": "${NEXUS_GROUP_CHAT_ID}"
   258|  }
   259|}'
   260|```
   261|
   262|**Rules:**
   263|- Never use the Daemon bot or PM bot to send on behalf of the agent.
   264|- Visible messages are human-readable only — no raw JSON, task IDs, or tokens in chat.
   265|- Full tracking data stays in the database and runtime proof.
   266|
   267|---
   268|
   269|## Troubleshooting
   270|
   271|| Symptom | Check Command | Common Cause / Fix |
   272|| --- | --- | --- |
   273|| Agent not receiving tasks | `curl -sS .../agents` — verify `status: "online"` and `dialect: "hermes"` | Agent status is offline, or lane doesn't match any pending task. |
   274|| Daemon not dispatching | Check Daemon logs: `docker compose logs nexus-daemon --since=10m` | No pending tasks, agent not online, lane mismatch, or worker endpoint unreachable. |
   275|| Worker endpoint returns error | `curl -X POST http://your-hermes-host:8080/intent -d '{}'` | Hermes gateway not running, wrong port, firewall blocking. |
   276|| 401 on API calls | Verify `Authorization: Bearer` header matches `API_AUTH_TOKEN` | Token missing, mismatched, or not set in environment. |
   277|| Proof not accepted | Check task state: `GET /api/v1/runtime/tasks/{id}?project_id=...` | Task may already be in a terminal state, or transition sequence is wrong. |
   278|| Hermes MCP errors | `hermes doctor` and check logs | Hermes not configured for MCP, or skill/plugin missing. |
   279|| Telegram silent | Verify `AGENT_NOTIFICATIONS` JSON and bot permissions | Missing bot config for agent, bad token/chat_id, bot lacks group permissions. |
   280|
   281|---
   282|
   283|## Next Steps
   284|
   285|- [OpenClaw Agent Integration Guide](./openclaw-agent.md) — connect an OpenClaw worker
   286|- [Dual-Agent Guide](./dual-agent.md) — run Hermes and OpenClaw workers together
   287|- [Installation & Deployment Guide](../install.md) — full deployment reference
   288|- [Hermes Agent Docs](https://hermes-agent.nousresearch.com/docs/) — official Hermes documentation
   289|