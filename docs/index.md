# Nexus Dispatch Documentation Index

Start here when you need the operational entry points without reading the full README.

## Fast Entry Points

| Need | Start here | What it covers |
| --- | --- | --- |
| Run in 5 minutes | [Installation & Deployment Guide](./install.md) | Docker Compose, systemd, ports, environment variables, smoke tests |
| Connect a Worker | [Worker Contract](./worker-contract.md) | Worker registration, dispatch payloads, proof submission, minimal checklist |
| Call the Runtime API | [Runtime API](./runtime-api.md) | Runtime routes for projects, agents, tasks, runs, artifacts, transitions, reports |
| Understand the system boundary | [Architecture](./architecture.md) | Runtime API boundary, PM Daemon, Worker fleet, SQLite SSoT, proof flow |

## Localized Installation Guides

- [English install guide](./install.md)
- [简体中文部署指南](./install.zh-CN.md)
- [繁體中文部署指南](./install.zh-TW.md)

## Worker Contract and Examples

- [Worker Contract](./worker-contract.md) — the stable HTTP contract every Worker must follow.
- [OpenClaw Worker Guide](./guides/openclaw-agent.md) — example OpenClaw-style HTTP Worker wiring.
- [Hermes Worker Guide](./guides/hermes-agent.md) — example Hermes-native Worker wiring.
- [Dual-Agent Guide](./guides/dual-agent.md) — example split setup for two Worker styles.

## Architecture and API References

- [Architecture](./architecture.md)
- [Runtime API](./runtime-api.md)

## Project README Entry Points

- [English README](../README.md)
- [简体中文 README](../README.zh-CN.md)
- [繁體中文 README](../README.zh-TW.md)
