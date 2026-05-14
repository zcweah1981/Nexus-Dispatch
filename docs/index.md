# Nexus Dispatch Documentation Index

Start here when you need the operational entry points without reading the full README.

## Fast Entry Points

| Need | Start here | What it covers |
| --- | --- | --- |
| Run in 5 minutes | [Installation & Deployment Guide](./install.md) | Docker Compose, systemd, ports, environment variables, smoke tests |
| Learn the WebUI surface | [WebUI Guide](./guides/webui-guide.md) | Dashboard, Kanban, Timeline, Release Center, Proof Center, locale switching |
| Operate project settings safely | [Admin Guide](./guides/admin-guide.md) | Read-only settings, review policies, cron registry boundary, proof-safe ops |
| Inspect workers and lanes | [Agent Registry Guide](./guides/agent-registry-guide.md) | Agent cards, lane metadata, endpoint refs, safety notes |
| Run releases and visible delivery | [Release Center Guide](./guides/release-center-guide.md) | Human-visible report readiness, send-state tracking, operator checklist |
| Understand proof exposure rules | [Proof Governance Guide](./guides/proof-governance-guide.md) | Summary-only display, Runtime storage boundary, audit trail conventions |
| Connect a Worker | [Worker Contract](./worker-contract.md) | Worker registration, dispatch payloads, proof submission, minimal checklist |
| Call the Runtime API | [Runtime API](./runtime-api.md) | Runtime routes for projects, agents, tasks, runs, artifacts, transitions, reports |
| Understand the system boundary | [Architecture](./architecture.md) | Runtime API boundary, PM Daemon, Worker fleet, SQLite SSoT, proof flow |
| Explain API-only safety | [API-only Safety Boundary](./guides/api-only-safety.md) | Why Workers/WebUI/Daemon never touch SQLite directly |

## Localized Installation Guides

- [English install guide](./install.md)
- [简体中文部署指南](./install.zh-CN.md)
- [繁體中文部署指南](./install.zh-TW.md)

## Localized WebUI and Operations Guides

- [WebUI Guide](./guides/webui-guide.md) · [简体中文](./guides/webui-guide.zh-CN.md) · [繁體中文](./guides/webui-guide.zh-TW.md)
- [Admin Guide](./guides/admin-guide.md) · [简体中文](./guides/admin-guide.zh-CN.md) · [繁體中文](./guides/admin-guide.zh-TW.md)
- [Agent Registry Guide](./guides/agent-registry-guide.md) · [简体中文](./guides/agent-registry-guide.zh-CN.md) · [繁體中文](./guides/agent-registry-guide.zh-TW.md)
- [Release Center Guide](./guides/release-center-guide.md) · [简体中文](./guides/release-center-guide.zh-CN.md) · [繁體中文](./guides/release-center-guide.zh-TW.md)
- [Proof Governance Guide](./guides/proof-governance-guide.md) · [简体中文](./guides/proof-governance-guide.zh-CN.md) · [繁體中文](./guides/proof-governance-guide.zh-TW.md)
- [API-only Safety Boundary](./guides/api-only-safety.md) · [简体中文](./guides/api-only-safety.zh-CN.md) · [繁體中文](./guides/api-only-safety.zh-TW.md)

## WebUI and Operations Guides

- [WebUI Guide](./guides/webui-guide.md) — page-by-page overview of Dashboard, Timeline, Kanban, Release Center, Proof Center, and Dispatch Live.
- [Admin Guide](./guides/admin-guide.md) — safe operator workflow for settings, review policies, cron registry, and observability.
- [Agent Registry Guide](./guides/agent-registry-guide.md) — how to read lane ownership, dialect, status, and endpoint display refs safely.
- [Release Center Guide](./guides/release-center-guide.md) — how to watch report readiness and human-visible delivery state.
- [Proof Governance Guide](./guides/proof-governance-guide.md) — what the public WebUI can display, what remains in Runtime storage, and why.
- [API-only Safety Boundary](./guides/api-only-safety.md) — boundary explanation for public docs and onboarding.

## Worker Contract and Examples

- [Worker Contract](./worker-contract.md) — the stable HTTP contract every Worker must follow.
- [OpenClaw Worker Guide](./guides/openclaw-agent.md) — example OpenClaw-style HTTP Worker wiring.
- [Hermes Worker Guide](./guides/hermes-agent.md) — example Hermes-native Worker wiring.
- [Dual-Agent Guide](./guides/dual-agent.md) — example split setup for two Worker styles.

## Release Notes

- [v0.1.0 Developer Preview (May 2026)](./release-notes-v0.1.0.md) — what it is, what you can run today, install paths, worker contract, known limits, next milestone.

## Architecture and API References

- [Architecture](./architecture.md)
- [Runtime API](./runtime-api.md)

## Project README Entry Points

- [English README](../README.md)
- [简体中文 README](../README.zh-CN.md)
- [繁體中文 README](../README.zh-TW.md)
