# Agent Registry Guide

[English](./agent-registry-guide.md)

---

## Purpose

This guide explains how to read the Agent Registry page in Nexus Dispatch.

## What the page shows

Each card shows:
- `agent_id`
- lane
- dialect
- status
- endpoint display reference

## What the page does not show

It does not expose:
- raw endpoint credentials
- local file paths from the worker host
- bot token / chat ID values
- raw agent payload JSON

Endpoint refs are sanitized display values only.

## How to interpret fields

### Agent ID
A stable logical identity for dispatch routing and proof attribution.

### Lane
Expected work lane, such as:
- DEV
- OPS
- DESIGN
- CONTENT
- RESEARCH
- ORCHESTRATOR

### Dialect
Execution style / adapter family, such as Hermes or OpenClaw.

### Status
High-level availability signal used for operator reading.
It is not a substitute for deeper worker health diagnostics.

### Endpoint display ref
A human-safe hint that helps operators distinguish workers without leaking real connection secrets.

## Recommended use

Use Agent Registry when you need to answer:
- Which worker owns this lane?
- Is a lane represented at all?
- Which dialect family is connected?
- Which agent appears offline or stale?

## Not recommended use

Do not use Agent Registry as:
- a secret-management view
- a transport-debug console
- proof that the worker can execute successfully right now

For deeper checks, pair it with:
- Dispatch Live
- Observability
- Runtime API agent list

## Operator note

The registry is a readability layer. Real authority remains with the Runtime API and the project-scoped scheduling logic behind it.
