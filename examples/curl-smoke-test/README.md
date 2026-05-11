# Runnable curl smoke test

R34_CURL_SMOKE_EXAMPLE_CONTRACT

This example is a copy-paste runnable smoke path for the current Nexus Dispatch Runtime API. It is intentionally API-only and matches the deployment guide in [`docs/install.md`](../../docs/install.md).

It exercises only real current endpoints implemented in `src/api/routes.ts`:

1. `POST /api/v1/runtime/projects` — create a project scope.
2. `POST /api/v1/runtime/projects/:projectId/agents` — register a project-scoped worker agent.
3. `POST /api/v1/runtime/tasks` — create a task.
4. `GET /api/v1/runtime/tasks/pending?project_id=...&lane=DEV` — query pending tasks.
5. `GET /api/v1/runtime/tasks/:id?project_id=...` — fetch the created task.
6. Optional: `POST /api/v1/runtime/tasks/transition` — exercise the implemented FSM transition endpoint.

No fake completion claim: by default the script does **not** mark a task complete and does not claim that a real worker executed it. Completion requires either a real daemon + worker proof loop, or an explicit local smoke run with `RUN_TRANSITIONS=1` to call the implemented transition endpoint.

## Prerequisites

Start the API as described in `docs/install.md` and set a safe local token. The examples use a placeholder only:

```bash
export API_BASE_URL="http://localhost:8000/api/v1"
export API_AUTH_TOKEN="YOUR_RUNTIME_TOKEN"
```

The HTTP header used by every request is:

```text
Authorization: Bearer YOUR_RUNTIME_TOKEN
```

Replace `YOUR_RUNTIME_TOKEN` locally. Do not commit real tokens.

## Run

```bash
cd /opt/projects/nexus-dispatch
API_AUTH_TOKEN="your-dev-token" ./examples/curl-smoke-test/smoke.sh
```

From inside this example directory, the same runnable script is:

```bash
./smoke.sh
```

Optional project/task overrides:

```bash
PROJECT_ID="nexus-dispatch-smoke" \
AGENT_ID="long-coder-smoke" \
TASK_ID="curl-smoke-first-task" \
API_AUTH_TOKEN="your-dev-token" \
./examples/curl-smoke-test/smoke.sh
```

Optional transition smoke:

```bash
RUN_TRANSITIONS=1 API_AUTH_TOKEN="your-dev-token" ./examples/curl-smoke-test/smoke.sh
```

`RUN_TRANSITIONS=1` drives the legal V8 Runtime FSM path:

```text
dispatch -> start -> submit_completion -> request_review -> review_pass
```

Use it only for local deployment smoke. It is not a substitute for daemon dispatch or worker proof in production.

## Expected output

Fresh database output is abbreviated here; IDs and timestamps may differ:

```text
[1/5] create or update project: nexus-dispatch-smoke
{"project":{"id":"nexus-dispatch-smoke","name":"nexus-dispatch-smoke",...}}

[2/5] register worker agent: long-coder-smoke
{"agent":{"agent_id":"long-coder-smoke","lane":"DEV","status":"online",...}}

[3/5] create task: curl-smoke-first-task
{"task":{"id":"curl-smoke-first-task","project_id":"nexus-dispatch-smoke","status":"created",...}}

[4/5] query pending DEV tasks
{"tasks":[{"id":"curl-smoke-first-task","status":"created",...}],"total":1}

[5/5] fetch created task
{"task":{"id":"curl-smoke-first-task","status":"created",...}}

Smoke finished without forcing completion.
Set RUN_TRANSITIONS=1 only when you intentionally want to exercise the implemented FSM transition endpoint.
```

If `RUN_TRANSITIONS=1` is set, expected final state after the optional transition loop is `completed` and the output comes from `POST /api/v1/runtime/tasks/transition` plus the final task fetch. This is a Runtime API transition smoke only; it does not assert that an external worker ran.

## Endpoint validation notes

- Project creation, agent registration, task creation, pending query, task fetch, and transition endpoint names are grounded in `src/api/routes.ts`.
- Required fields are grounded in `src/api/schemas.ts`: agent registration includes `soul_prompt` and `tools_allowed`; task creation includes `project_id`, `title`, `objective`, and `lane_required`.
- Legacy direct routes such as `/api/v1/tasks/:id/submit_proof` are intentionally not used.
