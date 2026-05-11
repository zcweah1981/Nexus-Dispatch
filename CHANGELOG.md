# Changelog

All notable changes to Nexus Dispatch are documented here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Community health files: `CONTRIBUTING.md`, `SECURITY.md`, `CODE_OF_CONDUCT.md`.
- GitHub issue templates: bug report, feature request, worker integration.
- GitHub pull request template with proof-gated checklist.
- Example: `examples/curl-smoke-test/` — copy-paste runnable Runtime API smoke test.
- Example: `examples/mock-worker/` — minimal Node.js mock worker with dispatch contract demonstration.
- Worker integration guides: OpenClaw, Hermes, and dual-agent setup (EN / zh-CN / zh-TW).
- Trilingual installation guides (EN / zh-CN / zh-TW) with deployment diagrams.
- Release notes: [docs/release-notes-v0.1.0.md](./docs/release-notes-v0.1.0.md).

## [0.1.0] - 2026-05-11

### Summary

Developer preview release. Single-node, API-first runtime for PM-driven multi-agent dispatch.

👉 **Full release notes:** [docs/release-notes-v0.1.0.md](./docs/release-notes-v0.1.0.md)

### Added
- Runtime API (`/api/v1/runtime/*`) with Bearer token authentication.
- PM Daemon tick-loop scheduler with DAG resolution and priority evaluation.
- Worker registration, dispatch, and proof submission contract.
- FSM state machine: `created → dispatched → running → completion_pending → completed`.
- Structured proof gates: `repo_proof`, `run_proof`, `review_proof`, `report_proof`, `ops_proof`.
- Review policies: `pm_audit_immediate` (human gate) and `group_only` (machine proof auto-advance).
- SQLite SSoT — database accessible only inside the API server process.
- Telegram notification delivery — human-readable summaries, no raw IDs.
- WebUI dashboard (read-only) — tasks, agents, run history.
- Docker Compose deployment with persistent SQLite volume.
- Bare-metal / systemd deployment support.
- Trilingual README: English, 简体中文, 繁體中文.
- Documentation: installation guide, runtime API reference, worker contract, architecture overview.

### Changed
- V8 clean rebuild from dispatch-system prototype.
- Prisma DAL replacing legacy direct-SQL data access.
- API-only boundary enforced — no module bypasses the REST layer.

### Fixed
- DAG cycle detection prevents deadlocked dispatch graphs.
- Stale worker takeover lease prevents permanently stuck tasks.
- Duplicate result ingestion guard prevents double-counting runs.
- Self-review inactive guard prevents agents approving their own work.
- Forbidden direct-to-completed transition enforcement on the FSM.

### Known Limits
- Single-node only. No horizontal scaling.
- WebUI is read-only. All mutations through Runtime API.
- No task cancel API. No built-in CI/CD.
- Blueprint auto-thaw not yet implemented.
- No rate limiting on the Runtime API.

[Unreleased]: https://github.com/zcweah1981/Nexus-Dispatch/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/zcweah1981/Nexus-Dispatch/releases/tag/v0.1.0
