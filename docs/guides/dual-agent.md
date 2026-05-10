     1|# Dual-Agent Integration Guide: Hermes + OpenClaw
     2|
     3|[English](./dual-agent.md) · [简体中文](./dual-agent.zh-CN.md) · [繁體中文](./dual-agent.zh-TW.md)
     4|
     5|---
     6|
     7|## Overview
     8|
     9|This guide shows you how to run **both Hermes and OpenClaw workers** on the same Nexus Dispatch instance. The PM Daemon routes tasks to the correct worker based on each agent's **lane** and **dialect**, so you can have coding tasks go to OpenClaw while content tasks go to Hermes — all under one control plane.
    10|
    11|**Who this is for:** Teams that use multiple agent types and want a unified dispatch, tracking, and verification system.
    12|
    13|![Dual-system architecture](../assets/guide/dual-system-architecture.png)
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
    25|| Hermes Agent installed and gateway configured | `hermes --version` and `hermes gateway status` |
    26|| OpenClaw installed and endpoint reachable | `curl -I http://your-openclaw-host:8647/v1/runs` |
    27|| PM Daemon running | `docker compose ps nexus-daemon` or `systemctl status nexus-dispatch-daemon` |
    28|| A project created in Nexus | See [Installation Guide](../install.md) §3.4 |
    29|
    30|---
    31|
    32|## How It Works
    33|
    34|Nexus Dispatch uses two routing dimensions to send tasks to the right agent:
    35|
    36|| Dimension | What it does | Example |
    37|| --- | --- | --- |
    38|| **Lane** | Categorizes the work type. Tasks and agents must share the same lane to match. | `DEV`, `CONTENT`, `DESIGN` |
    39|| **Dialect** | Determines the wire format for dispatching. The Daemon picks the right adapter. | `hermes` → HermesMCPAdapter, `openclaw` → OpenClawAdapter |
    40|
    41|```
    42|PM Daemon (tick loop)
    43|  │
    44|  │ 1. Fetch pending tasks
    45|  │ 2. For each task, find online agents with matching lane
    46|  │ 3. Select agent (priority + concurrency)
    47|  │ 4. Look up agent.dialect → pick adapter
    48|  │
    49|  ├─ dialect: "hermes" ──→ HermesMCPAdapter ──→ POST to Hermes endpoint
    50|  │                                              (MCP intent format)
    51|  │
    52|  └─ dialect: "openclaw" ─→ OpenClawAdapter ──→ POST to OpenClaw endpoint
    53|                                               (OpenAI messages format)
    54|```
    55|
    56|**Result:** A single Nexus instance can dispatch coding tasks to OpenClaw and content tasks to Hermes simultaneously. Each agent processes tasks in its native format.
    57|
    58|---
    59|
    60|## Step 1: Register Both Agents
    61|
    62|Register a Hermes worker (for content tasks) and an OpenClaw worker (for coding tasks):
    63|
    64|### 1a. Register Hermes Worker (CONTENT lane)
    65|
    66|```bash
    67|curl -sS -X POST \
    68|  "http://localhost:${NEXUS_API_PORT:-8000}/api/v1/runtime/projects/${NEXUS_PROJECT_ID:-nexus-dispatch}/agents" \
    69|  -H "Authorization: Bearer ${API_AUTH_TOKEN}" \
    70|  -H "Content-Type: application/json" \
    71|  -d '{
    72|    "agent_id": "hermes-content-1",
    73|    "endpoint": "http://your-hermes-host:8080/intent",
    74|    "lane": "CONTENT",
    75|    "dialect": "hermes",
    76|    "soul_prompt": "You are a content production agent. Write high-quality copy and submit proof.",
    77|    "tools_allowed": ["web", "browser", "file", "terminal"],
    78|    "max_concurrency": 1,
    79|    "status": "online"
    80|  }'
    81|```
    82|
    83|### 1b. Register OpenClaw Worker (DEV lane)
    84|
    85|```bash
    86|curl -sS -X POST \
    87|  "http://localhost:${NEXUS_API_PORT:-8000}/api/v1/runtime/projects/${NEXUS_PROJECT_ID:-nexus-dispatch}/agents" \
    88|  -H "Authorization: Bearer ${API_AUTH_TOKEN}" \
    89|  -H "Content-Type: application/json" \
    90|  -d '{
    91|    "agent_id": "long-coder-1",
    92|    "endpoint": "http://your-openclaw-host:8647/v1/runs",
    93|    "lane": "DEV",
    94|    "dialect": "openclaw",
    95|    "soul_prompt": "You are a coding agent. Execute tasks precisely, write clean code, and submit proof of completion.",
    96|    "tools_allowed": ["terminal", "file", "web"],
    97|    "max_concurrency": 1,
    98|    "status": "online"
    99|  }'
   100|```
   101|
   102|> ⚠️ **OpenClaw version note:** The default port `8647` and path `/v1/runs` are based on the Nexus Dispatch reference configuration. Verify with your installed OpenClaw version via command.
   103|
   104|---
   105|
   106|## Step 2: Verify Both Agents Are Registered
   107|
   108|```bash
   109|curl -sS \
   110|  "http://localhost:${NEXUS_API_PORT:-8000}/api/v1/runtime/projects/${NEXUS_PROJECT_ID:-nexus-dispatch}/agents" \
   111|  -H "Authorization: Bearer ${API_AUTH_TOKEN}"
   112|```
   113|
   114|**Expected response** should show both agents:
   115|
   116|```json
   117|{
   118|  "agents": [
   119|    {
   120|      "id": "hermes-content-1",
   121|      "lane": "CONTENT",
   122|      "dialect": "hermes",
   123|      "status": "online",
   124|      "endpoint": "http://your-hermes-host:8080/intent"
   125|    },
   126|    {
   127|      "id": "long-coder-1",
   128|      "lane": "DEV",
   129|      "dialect": "openclaw",
   130|      "status": "online",
   131|      "endpoint": "http://your-openclaw-host:8647/v1/runs"
   132|    }
   133|  ]
   134|}
   135|```
   136|
   137|Verify both agents show `"status": "online"` and the correct `dialect` values.
   138|
   139|---
   140|
   141|## Step 3: Create Tasks for Each Lane
   142|
   143|### 3a. Content task → routed to Hermes
   144|
   145|```bash
   146|curl -sS -X POST \
   147|  "http://localhost:${NEXUS_API_PORT:-8000}/api/v1/runtime/tasks" \
   148|  -H "Authorization: Bearer ${API_AUTH_TOKEN}" \
   149|  -H "Content-Type: application/json" \
   150|  -d '{
   151|    "project_id": "nexus-dispatch",
   152|    "id": "content-task-001",
   153|    "title": "Write Landing Page Copy",
   154|    "objective": "Produce trilingual landing page copy for the new feature release.",
   155|    "lane_required": "CONTENT",
   156|    "acceptance_mode": "group_only",
   157|    "acceptance_criteria": [
   158|      "Three language versions delivered",
   159|      "Each version is under 200 words",
   160|      "CTA is clear and actionable"
   161|    ]
   162|  }'
   163|```
   164|
   165|### 3b. Coding task → routed to OpenClaw
   166|
   167|```bash
   168|curl -sS -X POST \
   169|  "http://localhost:${NEXUS_API_PORT:-8000}/api/v1/runtime/tasks" \
   170|  -H "Authorization: Bearer ${API_AUTH_TOKEN}" \
   171|  -H "Content-Type: application/json" \
   172|  -d '{
   173|    "project_id": "nexus-dispatch",
   174|    "id": "dev-task-001",
   175|    "title": "Fix Authentication Bug",
   176|    "objective": "The login endpoint returns 500 on empty password. Fix and add test coverage.",
   177|    "lane_required": "DEV",
   178|    "acceptance_mode": "group_only",
   179|    "acceptance_criteria": [
   180|      "Login endpoint returns 400 on empty password",
   181|      "Unit test added for edge case",
   182|      "No regression in existing auth tests"
   183|    ]
   184|  }'
   185|```
   186|
   187|---
   188|
   189|## Step 4: Verify Routing
   190|
   191|With the PM Daemon running, it will automatically:
   192|1. Pick up both pending tasks
   193|2. Match `content-task-001` (lane: CONTENT) → `hermes-content-1` (dialect: hermes)
   194|3. Match `dev-task-001` (lane: DEV) → `long-coder-1` (dialect: openclaw)
   195|4. Dispatch each using the correct adapter
   196|
   197|Check task statuses:
   198|
   199|```bash
   200|# Check content task
   201|curl -sS \
   202|  "http://localhost:${NEXUS_API_PORT:-8000}/api/v1/runtime/tasks/content-task-001?project_id=nexus-dispatch" \
   203|  -H "Authorization: Bearer ${API_AUTH_TOKEN}"
   204|
   205|# Check dev task
   206|curl -sS \
   207|  "http://localhost:${NEXUS_API_PORT:-8000}/api/v1/runtime/tasks/dev-task-001?project_id=nexus-dispatch" \
   208|  -H "Authorization: Bearer ${API_AUTH_TOKEN}"
   209|```
   210|
   211|Both tasks should progress through the state machine: `created` → `dispatched` → `in_progress` → `completed`.
   212|
   213|### Manual lifecycle (without Daemon)
   214|
   215|If testing without the Daemon, drive each task through the lifecycle:
   216|
   217|```bash
   218|# Content task
   219|for event in dispatch start submit_completion request_review review_pass; do
   220|  curl -sS -X POST \
   221|    "http://localhost:${NEXUS_API_PORT:-8000}/api/v1/runtime/tasks/transition" \
   222|    -H "Authorization: Bearer ${API_AUTH_TOKEN}" \
   223|    -H "Content-Type: application/json" \
   224|    -d "{
   225|      \"project_id\": \"nexus-dispatch\",
   226|      \"task_id\": \"content-task-001\",
   227|      \"event\": \"${event}\",
   228|      \"proof\": { \"source\": \"hermes-content-1\", \"type\": \"dual-agent-test\" }
   229|    }"
   230|done
   231|
   232|# Dev task
   233|for event in dispatch start submit_completion request_review review_pass; do
   234|  curl -sS -X POST \
   235|    "http://localhost:${NEXUS_API_PORT:-8000}/api/v1/runtime/tasks/transition" \
   236|    -H "Authorization: Bearer ${API_AUTH_TOKEN}" \
   237|    -H "Content-Type: application/json" \
   238|    -d "{
   239|      \"project_id\": \"nexus-dispatch\",
   240|      \"task_id\": \"dev-task-001\",
   241|      \"event\": \"${event}\",
   242|      \"proof\": { \"source\": \"long-coder-1\", \"type\": \"dual-agent-test\" }
   243|    }"
   244|done
   245|```
   246|
   247|---
   248|
   249|## Step 5: Verify Completion
   250|
   251|```bash
   252|curl -sS \
   253|  "http://localhost:${NEXUS_API_PORT:-8000}/api/v1/runtime/tasks/content-task-001?project_id=nexus-dispatch" \
   254|  -H "Authorization: Bearer ${API_AUTH_TOKEN}" | python3 -c "import sys,json; print(json.load(sys.stdin).get('status'))"
   255|
   256|curl -sS \
   257|  "http://localhost:${NEXUS_API_PORT:-8000}/api/v1/runtime/tasks/dev-task-001?project_id=nexus-dispatch" \
   258|  -H "Authorization: Bearer ${API_AUTH_TOKEN}" | python3 -c "import sys,json; print(json.load(sys.stdin).get('status'))"
   259|```
   260|
   261|**Expected:** Both should return `"completed"`.
   262|
   263|---
   264|
   265|## Telegram Notification Configuration
   266|
   267|Each agent must have its **own** Telegram bot configured. The Daemon never sends on behalf of an agent.
   268|
   269|```bash
   270|AGENT_NOTIFICATIONS='{
   271|  "hermes-content-1": {
   272|    "bot_token": "${HERMES_CONTENT_BOT_TOKEN}",
   273|    "chat_id": "${NEXUS_GROUP_CHAT_ID}"
   274|  },
   275|  "long-coder-1": {
   276|    "bot_token": "${LONG_CODER_BOT_TOKEN}",
   277|    "chat_id": "${NEXUS_GROUP_CHAT_ID}"
   278|  }
   279|}'
   280|```
   281|
   282|**Rules:**
   283|- Each agent_id maps to its own bot_token. Never share bot tokens between agents.
   284|- Both agents can send to the same group chat (same `chat_id`) or different groups.
   285|- Visible messages are human-readable — no raw JSON, task IDs, or tokens in chat.
   286|- Full tracking data stays in the database and runtime proof.
   287|
   288|---
   289|
   290|## Concurrency & Scheduling
   291|
   292|| Scenario | Behavior |
   293|| --- | --- |
   294|| Two tasks, different lanes | Dispatched simultaneously to different agents. |
   295|| Two tasks, same lane, one agent with `max_concurrency: 1` | Processed sequentially. |
   296|| Two tasks, same lane, agent with `max_concurrency: 2` | Processed in parallel by the same agent. |
   297|| No agent matches a task's lane | Task stays in `pending` until a matching agent comes online. |
   298|
   299|---
   300|
   301|## Troubleshooting
   302|
   303|| Symptom | Check Command | Common Cause / Fix |
   304|| --- | --- | --- |
   305|| Task stuck in `pending` | `curl -sS .../agents` — verify at least one agent matches the task's lane | No online agent with matching lane, or all matching agents at max concurrency. |
   306|| Wrong agent picks up task | Check task `lane_required` vs agent `lane` fields | Lane mismatch — ensure task lane matches the intended agent's lane. |
   307|| One agent receives all tasks | Check registered agents' `lane` values | Multiple agents registered with the same lane. Use distinct lanes for routing. |
   308|| Hermes task sent as OpenAI format | Verify `dialect` field in agent registration | Agent registered with wrong `dialect`. Hermes agents must use `"hermes"`, OpenClaw must use `"openclaw"`. |
   309|| OpenClaw task sent as MCP format | Same as above | Same fix — verify `dialect` field matches the agent type. |
   310|| 401 on API calls | Verify `Authorization: Bearer` header | Token missing or mismatched. |
   311|| Daemon not dispatching | `docker compose logs nexus-daemon --since=10m` | No pending tasks, all agents offline, or Daemon not running. |
   312|| Telegram notifications missing for one agent | Check `AGENT_NOTIFICATIONS` for the specific `agent_id` | Missing or misconfigured bot config for that agent. |
   313|
   314|---
   315|
   316|## Next Steps
   317|
   318|- [Hermes Agent Integration Guide](./hermes-agent.md) — detailed Hermes setup
   319|- [OpenClaw Agent Integration Guide](./openclaw-agent.md) — detailed OpenClaw setup
   320|- [Installation & Deployment Guide](../install.md) — full deployment reference
   321|