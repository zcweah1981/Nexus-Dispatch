# Admin Guide

[English](./admin-guide.md)

---

## Purpose

This guide explains how to operate the Nexus Dispatch WebUI and Runtime API surfaces safely without breaking the API-only boundary.

## Admin scope in the current public product

Current public WebUI scope is intentionally conservative:
- Runtime visibility
- Controlled preview for a small set of API-backed actions
- Read-only settings and policy inspection
- Safe proof exposure

It is **not** a broad browser admin console.

## Pages admins should use

### Project Settings
- Read-only view of project settings returned by the Runtime API
- Useful for confirming visible language and policy state
- Not a place to inspect secrets or raw env values

### Controlled Actions
- Shows preview → validation → confirm → result → audit reference flow
- Current low-risk write path is API-backed and explicit
- Some cards remain preview-only until the matching controlled API exists

### Observability
- Shows API, daemon, worker heartbeat, failed runs, report/artifact/event counts
- Use this page first when validating whether the control plane is healthy enough for UI inspection

### Release Center
- Review outward message readiness here before telling humans a release is “done”
- `run completed` is not the same as public delivery completed

## Review policies and cron registry

Public admin understanding should match the actual product boundary:

- Review policies are project-scoped Runtime data
- Cron rows in `project_cronjobs` are **registry records**, not proof that a real external scheduler is actively running
- Telegram project selection does not auto-start or auto-stop cronjobs
- Daemon state changes must still go through the Runtime API boundary

## Safe admin checklist

Before calling a project healthy:
- [ ] API status visible and healthy
- [ ] Queue depth understandable
- [ ] Blocked/dead-letter counts reviewed
- [ ] Pending reports checked in Release Center
- [ ] Proof Governance page confirms safe summary-only exposure
- [ ] No one is relying on browser-visible data as a substitute for Runtime storage evidence

## What admins must not do

- Do not bypass the Runtime API and touch SQLite directly
- Do not treat endpoint display refs as credentials
- Do not expose raw proof, run IDs, chat IDs, or tokens in public screenshots
- Do not claim cron automation is running only because a registry row exists

## When to leave the WebUI

Leave the WebUI and use deeper Runtime/API evidence when you need:
- raw proof payloads
- audit-event detail beyond the visible summary
- service restart / deployment diagnostics
- scheduler adapter debugging
- database/schema troubleshooting

## Related guides

- [WebUI Guide](./webui-guide.md)
- [Release Center Guide](./release-center-guide.md)
- [Proof Governance Guide](./proof-governance-guide.md)
- [API-only Safety Boundary](./api-only-safety.md)
