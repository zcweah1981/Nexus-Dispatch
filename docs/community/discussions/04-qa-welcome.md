# ❓ Q&A — Ask Anything About Nexus Dispatch

> **Category**: Q&A  
> **Labels**: `q-a`, `help`, `welcome`

---

New to Nexus Dispatch? Have a question about setup, configuration, or architecture? You're in the right place!

## Quick Start Links

| Resource | Link |
|----------|------|
| 📖 README & Setup Guide | [README.md](https://github.com/zcweah1981/Nexus-Dispatch#readme) |
| 📋 Release Notes | [docs/release-notes/](https://github.com/zcweah1981/Nexus-Dispatch/tree/main/docs) |
| 🔧 Example Configs | [examples/](https://github.com/zcweah1981/Nexus-Dispatch/tree/main/examples) |
| 🐛 Report a Bug | [Open an Issue](https://github.com/zcweah1981/Nexus-Dispatch/issues/new) |

## Common Questions

### How do I deploy Nexus Dispatch?
See `scripts/deploy-guide.md` in the repo for step-by-step deployment instructions. The system runs on Node.js with a SQLite backend — no external database required.

### How do workers connect?
Workers register via the REST API (`POST /api/workers/register`) and receive tasks through webhook callbacks or polling. See the Worker Integration discussion for detailed patterns.

### What's a "proof gate"?
A proof gate is the mechanism by which task completion is verified. Instead of trusting a worker's "I'm done" message, Nexus requires structured proof artifacts (file hashes, URLs, screenshots, test results) that are validated before a task transitions to `completed`.

### Can I use it with agents other than Hermes?
Yes! Nexus Dispatch is agent-agnostic. Any system that can call the REST API and submit structured proofs can be a worker. We've designed it to work with Hermes, Claude Code, Codex, or custom scripts.

### Is it production-ready?
v0.1 is a **developer preview**. The core dispatch engine and state machine are stable, but we recommend thorough testing before production use. v0.2 will focus on production hardening.

---

*Don't see your question? Ask it below! No question is too basic — we're here to help.*

*Tip: For bug reports, please open a [GitHub Issue](https://github.com/zcweah1981/Nexus-Dispatch/issues/new) with reproduction steps instead.*
