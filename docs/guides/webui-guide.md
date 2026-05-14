# WebUI Guide

[English](./webui-guide.md)

---

## Purpose

This guide explains the public Nexus Dispatch WebUI surface for operators who need fast scanability without touching raw runtime storage.

## What the WebUI is

- A project-scoped Runtime API view
- A trilingual operator surface: English / 简体中文 / 繁體中文
- Safe-by-default: visible summaries only, no raw proof blobs, no SQLite access, no browser-side credential reads

## Core pages

### 1. Dashboard
- Shows queue depth, completed count, blocked/dead-letter signal, active group, and live run count
- Adds three scan-first cards:
  - **Flow focus**: what group is currently moving
  - **Release pulse**: how many human-visible reports are still waiting for delivery
  - **Proof boundary**: reminder that deep artifacts stay in Runtime storage

### 2. Lifecycle Timeline
- Lists the most recent group/task activity in reverse chronological order
- Each item shows title, status pill, and compact group reference
- Meant for “what changed recently?” instead of full audit reading

### 3. Task Kanban
- Five columns:
  - Created
  - Running
  - Review Pending
  - Retry Ready / Blocked / Dead Letter / Cancelled
  - Completed
- Cards show title, lane, compact group reference, and sanitized proof summary only

### 4. Realtime Feed
- Shows connection state, transport, fallback transport, and project-scoped SSE/polling behavior
- Event text is sanitized before render
- Use this page when checking if Runtime events are flowing at all

### 5. Release Center
- Tracks ready groups, pending reports, and sent reports
- Focuses on **human-visible delivery state**, not internal artifact payloads
- Operator note clarifies that release readiness lives here while detailed proof remains behind the Runtime boundary

### 6. Proof Governance
- Public “Proof Center” equivalent for safe exposure rules
- Shows only:
  - artifact type
  - compact run reference
  - sanitized summary/path text
- Reinforces three concepts:
  - summary only
  - Runtime storage boundary
  - audit trail without secret leakage

### 7. Dispatch Live
- Shows compact run/task references, assigned agent, status pill, and safe result summary
- Useful for lane dispatch monitoring without exposing full run identifiers broadly

### 8. Agent Registry
- Shows agent ID, lane, dialect, status, and sanitized endpoint display reference
- Intended for registry readability, not endpoint secret exposure

## Language switching

The top-right locale switcher provides:
- English
- 简体中文
- 繁體中文

The page structure stays stable across languages; only visible copy changes.

## Safety boundary

The WebUI never:
- opens SQLite directly
- reads local files from the browser
- reads env vars or credentials from the browser
- exposes raw proof payloads as public page content

The WebUI only talks to `/api/v1/runtime/*` and `/api/v1/events/stream` through the API server boundary.

## Recommended operator flow

1. Open **Dashboard** for the current pulse
2. Open **Kanban** when you need queue structure
3. Open **Release Center** before checking outward delivery
4. Open **Proof Governance** when someone asks why raw proof is hidden
5. Open **Dispatch Live** when you need run-level assignment visibility

## Screenshot references

Trilingual screenshots for this guide are generated as internal proof assets under:

`/root/.hermes/projects/nexus-dispatch/docs/proofs/r40-webui/`

They are not part of the public repo unless a later task explicitly promotes them as public assets.
