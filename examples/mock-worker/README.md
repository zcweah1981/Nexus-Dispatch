# Minimal mock worker integration example

R34_MOCK_WORKER_EXAMPLE_CONTRACT

This example shows the smallest local Worker that can receive the daemon's OpenAI-compatible dispatch shape and return a structured `worker_run_id`. It has **No Telegram dependency**, no private agent dependency, and no direct SQLite access.

It complements [`examples/curl-smoke-test`](../curl-smoke-test/README.md):

- `curl-smoke-test` proves Runtime API project/agent/task endpoints.
- `mock-worker` proves the Worker HTTP endpoint contract and can optionally write run/artifact/transition proof through the real Runtime API.

## Worker contract demonstrated

The mock Worker exposes:

```http
POST /v1/runs
Content-Type: application/json
```

Expected request shape matches the daemon's `OpenAICompatibleWorkerClient` in `src/daemon/v8_tick_loop.ts`:

```json
{
  "model": "mock-worker",
  "messages": [
    { "role": "system", "content": "You are a Nexus Dispatch worker." },
    { "role": "user", "content": "{...serialized V8DaemonDispatchPayload...}" }
  ],
  "metadata": {
    "project_id": "nexus-dispatch-mock-worker-smoke",
    "task_id": "mock-worker-first-task",
    "run_id": "local-runtime-run",
    "agent_id": "mock-worker-local",
    "lease_token": "local-lease"
  }
}
```

Response:

```json
{
  "worker_run_id": "mock-worker-...",
  "status": "accepted",
  "message": "Mock worker received dispatch payload and produced smoke proof. It does not mark tasks complete by itself.",
  "metadata": {
    "project_id": "nexus-dispatch-mock-worker-smoke",
    "task_id": "mock-worker-first-task",
    "run_id": "local-runtime-run",
    "agent_id": "mock-worker-local",
    "lease_token": "local-lease"
  },
  "proof": {
    "contract": "openai-compatible-dispatch-smoke",
    "handled_task_title": "Mock worker integration smoke",
    "received_messages": 2,
    "no_private_dependencies": true
  }
}
```

## Environment variables

| Variable | Default | Meaning |
| --- | --- | --- |
| `MOCK_WORKER_HOST` | `127.0.0.1` | Bind address for `mock-worker.js`. |
| `MOCK_WORKER_PORT` | `18647` | Local Worker HTTP port. |
| `API_BASE_URL` | `http://localhost:8000/api/v1` | Runtime API base used by `smoke.sh`. |
| `API_AUTH_TOKEN` | `YOUR_RUNTIME_TOKEN` | Runtime API bearer token. Placeholder only; do not commit real tokens. |
| `PROJECT_ID` | `nexus-dispatch-mock-worker-smoke` | Smoke project scope. |
| `AGENT_ID` | `mock-worker-local` | Registered mock Worker agent. |
| `TASK_ID` | `mock-worker-first-task` | Smoke task id. |
| `RUN_API_PROOF` | `0` | When `1`, write run/artifact/transition proof through Runtime API. |
| `WORKER_RUN_ID` | `mock-worker-manual-proof` | Worker run id used by optional proof write. |

Header used for Runtime API requests:

```text
Authorization: Bearer YOUR_RUNTIME_TOKEN
```

## Run: worker-only smoke path

This path requires only Node.js and curl. It starts the mock Worker, sends one dispatch-shaped request to `POST /v1/runs`, and exits.

```bash
cd /opt/projects/nexus-dispatch
./examples/mock-worker/smoke.sh worker-only
```

Expected output:

```text
[worker-only] POST OpenAI-compatible dispatch payload to local mock worker
{
  "worker_run_id": "mock-worker-...",
  "status": "accepted",
  "metadata": {
    "project_id": "nexus-dispatch-mock-worker-smoke",
    "task_id": "mock-worker-first-task",
    "run_id": "local-run-1",
    "agent_id": "mock-worker-local",
    "lease_token": "local-lease"
  },
  "proof": {
    "contract": "openai-compatible-dispatch-smoke",
    "no_private_dependencies": true
  }
}
```

## Run: Runtime API smoke-only path

Prerequisite: start the API from [`docs/install.md`](../../docs/install.md), then set a local token.

```bash
export API_BASE_URL="http://localhost:8000/api/v1"
export API_AUTH_TOKEN="YOUR_RUNTIME_TOKEN"
./examples/mock-worker/smoke.sh
```

This default path calls real current endpoints:

1. `POST /api/v1/runtime/projects`
2. `POST /api/v1/runtime/projects/:projectId/agents`
3. `POST /api/v1/runtime/tasks`
4. Direct local Worker `POST /v1/runs`
5. `GET /api/v1/runtime/tasks/pending?project_id=...&lane=DEV`

Expected output is abbreviated:

```text
[1/7] start local mock worker endpoint
mock worker: http://127.0.0.1:18647/v1/runs

[2/7] create or update project: nexus-dispatch-mock-worker-smoke
{"project":{"id":"nexus-dispatch-mock-worker-smoke",...}}

[3/7] register mock worker agent: mock-worker-local
{"agent":{"agent_id":"mock-worker-local","endpoint":"http://127.0.0.1:8647/v1/runs",...}}

[4/7] create task for mock worker contract smoke: mock-worker-first-task
{"task":{"id":"mock-worker-first-task","status":"created",...}}

[5/7] direct worker contract call: POST /v1/runs
{"worker_run_id":"mock-worker-...","status":"accepted",...}

[6/7] pending DEV tasks still visible through Runtime API
{"tasks":[...],"total":1}

[7/7] smoke-only path complete.
RUN_API_PROOF is not enabled, so no completion or proof transition was forced.
```

## Optional Runtime API proof write

Set `RUN_API_PROOF=1` only for local integration proof:

```bash
API_AUTH_TOKEN="YOUR_RUNTIME_TOKEN" RUN_API_PROOF=1 ./examples/mock-worker/smoke.sh
```

This additionally calls:

- `POST /api/v1/runtime/runs`
- `POST /api/v1/runtime/artifacts`
- `POST /api/v1/runtime/tasks/transition` for `dispatch`, `start`, and `submit_completion`

## Honest limitation

This is a **smoke-only path**, not a full production completion loop:

- It does not start the PM daemon.
- It does not depend on Telegram or any private bot/session.
- It does not directly mark tasks completed.
- The default path stops before proof transitions.
- `RUN_API_PROOF=1` demonstrates real Runtime API writes, but does not replace the daemon + worker result ingestion + review lifecycle.

Use this example to validate that a Worker can receive and acknowledge the dispatch contract before wiring a real Worker implementation.
