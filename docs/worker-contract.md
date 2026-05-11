# Nexus Dispatch Worker Contract

This document is the detailed Worker integration contract. The README keeps only the short summary so new users can understand the boundary quickly.

## Contract Summary

A Worker is a stateless executor. It registers one HTTP endpoint, receives dispatch payloads from the PM Daemon, runs the assigned task, and writes structured proof back through the Runtime API.

Workers must not access SQLite, self-assign work, or mark tasks completed directly.

## 1. Register a Worker

Workers register under a project through the Runtime API:

```http
POST /api/v1/runtime/projects/:projectId/agents
Authorization: Bearer <API_AUTH_TOKEN>
Content-Type: application/json
```

```json
{
  "agent_id": "long-coder-1",
  "endpoint": "http://worker-host:8647/v1/runs",
  "lane": "DEV",
  "dialect": "openclaw",
  "soul_prompt": "Execute assigned DEV tasks only and return structured proof.",
  "tools_allowed": ["terminal", "file", "web"],
  "status": "online"
}
```

### Required registration fields

| Field | Meaning |
| --- | --- |
| `agent_id` | Stable worker identifier inside the project. |
| `endpoint` | HTTP endpoint that receives dispatch payloads. |
| `lane` | Worker specialization such as `DEV`, `DESIGN`, `OPS`, or `CONTENT`. |
| `dialect` | Dispatch protocol, for example `openclaw` for HTTP webhook workers. |
| `soul_prompt` | Short role instruction injected into dispatch context. |
| `tools_allowed` | Declared tool classes the Worker may use. |
| `status` | Registry status, typically `online` for dispatchable workers. |

## 2. Receive Dispatch

The PM Daemon POSTs a task payload to the registered `endpoint`.

```json
{
  "task_id": "uuid",
  "project_id": "nexus-dispatch",
  "title": "Implement X",
  "objective": "Build feature X with tests.",
  "lane_required": "DEV",
  "acceptance_criteria": ["Feature X passes tests", "Git SHA provided"],
  "acceptance_mode": "group_only",
  "reviewer": "seiya",
  "max_retries": 2
}
```

### Worker obligations on dispatch

- Treat dispatch as an execution request, not as permission to mutate task state directly.
- Preserve runtime identifiers in structured proof only; do not put raw identifiers in human-visible messages.
- Return a machine-readable result object to the caller when the worker endpoint contract requires synchronous acknowledgement.
- If execution is asynchronous, ensure the eventual result still writes Run/Artifact/Transition proof through the Runtime API.

## 3. Submit Result and Proof

Workers complete the loop through Runtime API writes. The exact route payloads can evolve, but the three-step boundary remains stable:

| Step | Endpoint | Purpose |
| --- | --- | --- |
| Create run | `POST /api/v1/runtime/runs` | Record a worker execution attempt. |
| Submit artifact | `POST /api/v1/runtime/artifacts` | Attach structured proof, files, logs, image evidence, or repository evidence. |
| Transition task | `POST /api/v1/runtime/tasks/transition` | Request a legal lifecycle transition with proof. |

A typical proof bundle includes:

```json
{
  "summary": "Feature X implemented with tests.",
  "repo_proof": {
    "git_sha": "abc1234",
    "branch": "feat/x"
  },
  "run_proof": {
    "tests_passed": 12,
    "tests_failed": 0
  },
  "artifacts": [
    {
      "artifact_type": "repo_proof",
      "path": "https://example.invalid/proof/abc1234"
    }
  ]
}
```

## 4. Key Rules

1. **No direct DB access.** Workers never read or write SQLite files.
2. **No scheduling decisions.** Workers do not pick tasks, reorder dependencies, or choose reviewers.
3. **No direct completion.** Workers submit proof; Runtime API + FSM decide legal transitions.
4. **Structured proof required.** Plain-text “done” is not enough for acceptance.
5. **Visible text must be sanitized.** Human-facing messages must not expose tokens, chat IDs, runtime IDs, raw JSON, or connection strings.
6. **Offline is tolerated.** Daemon retry and lease logic handle worker unavailability; workers should be idempotent where possible.

## 5. Minimal Worker Checklist

- [ ] Exposes an authenticated or otherwise protected HTTP endpoint for dispatch.
- [ ] Registers under the correct `project_id` and lane.
- [ ] Executes only the task received in the dispatch payload.
- [ ] Writes a Run record before or during execution.
- [ ] Writes at least one structured Artifact or proof payload.
- [ ] Requests state transition through `POST /api/v1/runtime/tasks/transition`.
- [ ] Keeps all secrets in environment variables, never in committed files or visible reports.

## Related Docs

- [Architecture](./architecture.md)
- [Runtime API](./runtime-api.md)
- [Installation](./install.md)
