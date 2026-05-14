# Release Center Guide

[English](./release-center-guide.md)

---

## Purpose

Release Center is the operator page for visible delivery readiness.

It answers a simple question:

**Which project outputs are ready to be sent to humans, and which are still pending?**

## What it tracks

- ready groups
- pending reports
- sent reports
- sanitized report summaries
- report send state

## What it does not track

It is not the place to inspect:
- raw proof blobs
- full artifact payloads
- hidden credentials
- private runtime identifiers as public UI content

## Reading the page

### Ready groups
Groups that are completed or archived and therefore eligible for release-style summarization.

### Pending reports
Human-visible report items not yet fully sent.
These are the highest-signal blockers for outward communication.

### Sent reports
Reports already delivered through the normal visible reporting flow.

### Report cards
Each card shows:
- sanitized summary
- report message type
- compact task reference
- status pill

## Recommended workflow

1. Check pending reports count
2. Read the latest sanitized summaries
3. Confirm status pills are trending to sent/completed
4. If something is unclear, move to Runtime evidence rather than widening public UI exposure

## Delivery principle

Release Center is about **readable delivery state**.
Detailed proof still belongs to Runtime storage and reviewer evidence.

## Common mistakes to avoid

- Treating “task completed” as “release delivered”
- Using public WebUI cards as the only proof source
- Exposing raw internal IDs in screenshots or status updates

## Related guides

- [WebUI Guide](./webui-guide.md)
- [Proof Governance Guide](./proof-governance-guide.md)
- [Admin Guide](./admin-guide.md)
