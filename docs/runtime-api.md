# Nexus Dispatch Runtime API

The Runtime API is the public integration boundary for operators, PM automation, Workers, and read-only UI surfaces. SQLite remains internal to the API server process.

## Base URL

```text
http://localhost:8000/api/v1/runtime
```

All runtime routes require:

```http
Authorization: Bearer <API_AUTH_TOKEN>
Content-Type: application/json
```

## Core Routes

| Area | Route | Purpose |
| --- | --- | --- |
| Projects | `POST /projects` | Create/register a project. |
| Agents | `POST /projects/:projectId/agents` | Register a Worker endpoint and lane. |
| Tasks | `POST /tasks` | Create a project-scoped task. |
| Pending Tasks | `GET /tasks/pending?project_id=:projectId` | Read dispatchable tasks. |
| Runs | `POST /runs` | Record a Worker execution attempt. |
| Artifacts | `POST /artifacts` | Store structured proof or delivery evidence. |
| Transitions | `POST /tasks/transition` | Request a legal FSM transition with proof. |
| Reports | `POST /reports` | Queue visible completion/report messages. |
| Cron Registry | `GET /projects/:projectId/cronjobs` | Read project cron registry rows; does not start/stop real cronjobs. |

## Task Lifecycle Boundary

Workers and automation clients should not write final task status directly. They should submit proof and ask the Runtime API to advance the task through the state machine.

Typical path:

```text
created → dispatched → running → completion_pending → review_pending → completed
```

High-risk tasks may require reviewer proof before `completed`. Routine `group_only` work can unlock downstream through machine proof when policy allows.

## Proof Requirements

A valid transition request should include structured proof such as:

- run id or worker execution reference;
- artifact ids, file paths, or hashes;
- test/build command results;
- reviewer verdict when the task is under review;
- sanitized human-readable summary for reports.

Raw secrets, chat ids, tokens, and internal runtime identifiers should stay out of visible messages. Full trace data belongs in Runtime API artifacts and reports payloads.

## Related Docs

- [Worker Contract](./worker-contract.md)
- [Architecture](./architecture.md)
- [Installation](./install.md)
