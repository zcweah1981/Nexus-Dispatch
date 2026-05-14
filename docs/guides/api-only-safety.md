# API-only Safety Boundary

[English](./api-only-safety.md)

---

## Core rule

In Nexus Dispatch, Workers, WebUI, and the Daemon do **not** open SQLite directly.

The API Server owns SQLite/Prisma access.

## Why the boundary exists

This keeps the system aligned with the product governance model:
- single authoritative control plane
- project-scoped reads/writes
- reviewable state transitions
- secret handling in one place
- lower risk of ad-hoc direct DB mutation

## What each surface is allowed to do

### API Server
- owns SQLite/Prisma
- validates requests
- enforces auth and schema checks
- exposes Runtime API routes

### WebUI
- reads through `/api/v1/runtime/*`
- listens to `/api/v1/events/stream`
- renders sanitized summaries
- does not read local files, env vars, or raw DB data in the browser

### Worker
- receives dispatch payloads
- executes tasks
- submits proof back through the Runtime API
- does not self-complete tasks through direct DB writes

### Daemon
- coordinates polling/dispatch/review flows
- advances state through approved Runtime/API/FSM boundaries
- must not act as a hidden SQLite client for public integrations

## Practical safety outcome

Because of this boundary:
- screenshots can stay readable without revealing secrets
- review logic can audit transitions centrally
- project isolation is easier to preserve
- public docs can explain one stable integration contract

## Public explanation shortcut

If you need one sentence:

> Nexus Dispatch is API-only by design: the API Server owns SQLite, while WebUI, Workers, and Daemon read/write state only through the Runtime API boundary.

## Related references

- [Architecture](../architecture.md)
- [Runtime API](../runtime-api.md)
- [WebUI Guide](./webui-guide.md)
- [Proof Governance Guide](./proof-governance-guide.md)
