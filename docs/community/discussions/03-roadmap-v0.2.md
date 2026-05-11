# 🗺️ Roadmap v0.2 — Planning Ahead

> **Category**: Roadmap  
> **Labels**: `roadmap`, `planning`

---

Nexus Dispatch v0.1 (Developer Preview) is live! Here's what we're thinking for v0.2 and beyond.

## v0.1 Recap (Current)

✅ Core dispatch engine (SQLite state machine)  
✅ RESTful API layer (all data access via API)  
✅ PM Daemon with DAG topology (deadlock prevention)  
✅ Worker registration and concurrent dispatch  
✅ Structured proof gates for task verification  
✅ Telegram bot integration  
✅ Dynamic review policy (group_only vs. mandatory review)  
✅ i18n support (en-US / zh-CN)  

## v0.2 Proposed Features (Under Discussion)

| Feature | Priority | Status | Notes |
|---------|----------|--------|-------|
| WebUI Dashboard | 🔴 Must | Planning | Real-time task/worker visualization |
| Multi-Project Support | 🟡 Should | Exploring | Multiple dispatch projects per instance |
| Worker Health Monitoring | 🔴 Must | Planning | Heartbeat, auto-unregister stale workers |
| Cron Registry v2 | 🟡 Should | Designing | Per-project scheduled tasks with proof |
| Audit Trail Export | 🟢 Could | Backlog | Export run history as CSV/JSON |
| Webhook Event Subscriptions | 🟡 Should | Exploring | External systems subscribe to dispatch events |
| Worker Capability Marketplace | 🟢 Could | Backlog | Browse and share worker integrations |

## v0.3+ Vision

- 🔮 **Multi-PM Coordination**: Multiple PM agents collaborating on large projects
- 🌍 **Federated Dispatch**: Cross-instance task routing
- 📊 **Analytics Engine**: Historical performance analysis and optimization
- 🧠 **Adaptive Scheduling**: ML-based task assignment optimization

## We Need Your Input!

- 🎯 Which v0.2 feature matters most to you?
- 🚧 Are there gaps in the current system blocking your use case?
- 🛠️ Would you contribute to any of these features?
- 📅 Any timeline preferences for v0.2?

---

*This roadmap is a living document. Your feedback directly shapes our priorities. Comment below with your thoughts!*
