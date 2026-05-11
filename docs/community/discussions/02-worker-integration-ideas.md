# 🛠️ Worker Integration Ideas — Share Your Setup

> **Category**: Worker Integration  
> **Labels**: `worker`, `integration`, `how-to`

---

Nexus Dispatch is built on the principle of **"single PM brain, multi dumb-terminal execution"**. Workers are the hands that get things done.

## Share Your Worker Config

How are you connecting workers to Nexus Dispatch? Here are some integration patterns we've seen:

### Pattern 1: Hermes Agent Workers
```
Worker Type: Hermes Agent (via Telegram)
Connection: Webhook → Nexus API → Worker picks up task
Proof: Structured JSON artifact + screenshot/URL
```

### Pattern 2: CLI Workers
```
Worker Type: Custom script (Python/Node)
Connection: Poll Nexus API for dispatched tasks
Proof: Exit code + stdout log + file output
```

### Pattern 3: CI/CD Workers
```
Worker Type: GitHub Actions / GitLab CI
Connection: Webhook trigger on dispatch event
Proof: Build log URL + artifact hash
```

## Questions to Discuss

- 🤔 What worker types do you want to see supported?
- 🔌 How do you handle worker authentication in your setup?
- 📦 Any custom adapters or plugins you've built?
- ⚡ Performance tips for high-throughput dispatch scenarios?

## Worker Integration Checklist

When setting up a new worker, make sure you have:

- [ ] Worker registered with Nexus Dispatch API
- [ ] Capability manifest defined (what tasks it can handle)
- [ ] Webhook or polling connection configured
- [ ] Proof submission format agreed upon
- [ ] Error handling and retry logic in place

---

*Share your integration story below! Include code snippets, config examples, or architecture diagrams.*
