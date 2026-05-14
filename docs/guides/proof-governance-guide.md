# Proof Governance Guide

[English](./proof-governance-guide.md)

---

## Purpose

This guide explains the public “Proof Center” model in Nexus Dispatch.

The product principle is simple:

**Public WebUI shows safe summaries. Runtime storage keeps the full proof.**

## Why this exists

Operators need visibility, but public surfaces must not leak:
- raw payload JSON
- hidden runtime IDs
- chat IDs
- bearer tokens
- secrets
- internal-only reviewer artifacts

## What the Proof Governance page shows

- artifact type
- compact run reference
- sanitized summary/path text
- proof boundary reminders

## What stays outside the public page

- original report payloads
- raw artifact bodies
- full proof markdown/json
- hidden credential material
- internal review evidence bundles

## Three rules

### 1. Summary-only exposure
The WebUI is optimized for scanability, not full evidence dumps.

### 2. Runtime API boundary
Full proof remains behind Runtime storage and the API-only boundary.
The browser is not a database client.

### 3. Audit trail without leakage
Operators should still be able to trace the evidence chain by:
- artifact type
- audit reference
- project/task/run relationships via controlled backend flows

## Where deep proof belongs

Internal screenshot proof, review proof, and deeper governance artifacts for current launch work belong under:

`/root/.hermes/projects/nexus-dispatch/docs/proofs/r40-webui/`

Not in the public docs repo unless explicitly promoted later.

## Recommended operator behavior

If someone asks for raw proof in the public UI:
1. explain the summary-only boundary
2. use Runtime/API evidence paths for deeper verification
3. avoid widening public visibility just for convenience

## Related guides

- [Release Center Guide](./release-center-guide.md)
- [Admin Guide](./admin-guide.md)
- [API-only Safety Boundary](./api-only-safety.md)
