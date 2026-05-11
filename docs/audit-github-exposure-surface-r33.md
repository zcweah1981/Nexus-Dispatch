# R33-T1: GitHub Repository Exposure Surface Audit

> **Task ID**: nexus-v8-r33-t1-audit-github-surface  
> **Date**: 2026-05-11  
> **Auditor**: hyoga-ops-1  
> **Repo**: `zcweah1981/Nexus-Dispatch`  
> **Local Path**: *(redacted — internal ops path)*  
> **Mode**: READ-ONLY — No modifications made to the repository.

---

## 1. Repository Metadata

| Property | Current Value | Status | Notes |
|---|---|---|---|
| **Full Name** | `zcweah1981/Nexus-Dispatch` | ✅ | — |
| **Description** | `Nexus Dispatch-A PM-style control plane for independent AI workers. Nexus Dispatch routes work, tracks every state transition through a runtime state machine, and verifies completion through structured proof gates — unattended, observable, and auditable.` | ⚠️ GAP | Leading hyphen after "Dispatch" is a typo. Should be "Dispatch — A PM-style…" (em-dash with space). |
| **Homepage** | *(empty)* | ❌ GAP | No homepage URL set. Should be set to the repo README or a future docs site. |
| **Topics** | `agents`, `ai-agents`, `hermes`, `hermes-agent`, `openclaw`, `openclaw-agent`, `workers` | ⚠️ PARTIAL | Missing high-traffic topics: `task-dispatcher`, `multi-agent`, `control-plane`, `typescript`, `sqlite`, `automation`. |
| **Visibility** | `public` | ✅ | — |
| **Default Branch** | `main` | ✅ | — |
| **Language** | TypeScript | ✅ | — |
| **License** | MIT | ✅ | Properly detected by GitHub. |
| **Stargazers** | 0 | — | Natural for early-stage project. |
| **Forks** | 0 | — | Natural for early-stage project. |
| **Open Issues** | 0 | — | — |
| **Size** | 48,650 KB | ✅ | Reasonable. |

---

## 2. GitHub Feature Settings

| Feature | Enabled | Status | Recommendation |
|---|---|---|---|
| **has_issues** | ✅ Yes | ✅ | Keep enabled. |
| **has_projects** | ✅ Yes | ✅ | Consider creating a public "Roadmap" project board. |
| **has_wiki** | ✅ Yes | ⚠️ | Wiki is enabled but empty. Either populate it or disable to avoid a dead link. |
| **has_pages** | ❌ No | — | Future consideration for docs site. Not R33 scope. |
| **has_discussions** | ❌ No | ❌ GAP | Enable Discussions for community engagement (Q&A, announcements, ideas). |
| **has_downloads** | ✅ Yes | ✅ | — |

---

## 3. Community Health Files

| File | Present | Status | Priority |
|---|---|---|---|
| **LICENSE** | ✅ MIT | ✅ | — |
| **README.md** | ✅ Trilingual (EN, zh-CN, zh-TW) | ✅ | Well-structured, 12 sections, banner + hero images. |
| **CONTRIBUTING.md** | ❌ Missing | ❌ GAP | **Must add** — required for community profile health. |
| **CODE_OF_CONDUCT.md** | ❌ Missing | ❌ GAP | **Must add** — Contributor Covenant recommended. |
| **SECURITY.md** | ❌ Missing | ❌ GAP | **Must add** — vulnerability reporting policy. |
| **CHANGELOG.md** | ❌ Missing | ❌ GAP | **Should add** — track v8-rc1, v8-rc2 releases. |
| **CODEOWNERS** | ❌ Missing | ⚠️ | Nice-to-have for access control. |
| **FUNDING.yml** | ❌ Missing | — | Optional, not R33 scope. |

**GitHub Community Profile Health Score: 42/100**

---

## 4. Issue & PR Templates

| Template | Present | Status | Priority |
|---|---|---|---|
| **Issue Templates** | ❌ No `.github/ISSUE_TEMPLATE/` directory | ❌ GAP | **Must add** — at minimum: Bug Report + Feature Request templates. |
| **PR Template** | ❌ No `.github/PULL_REQUEST_TEMPLATE.md` | ❌ GAP | **Should add** — standardize contribution quality. |
| **`.github/` directory** | ❌ Does not exist | ❌ GAP | Must create. |

---

## 5. Releases & Tags

| Item | Status | Detail |
|---|---|---|
| **Tags** | ✅ 2 tags | `v8-rc1`, `v8-rc2` |
| **GitHub Releases** | ❌ None published | **GAP** — Tags exist but no formal GitHub Releases. Should create releases for `v8-rc1` and `v8-rc2` with notes. |

---

## 6. README Rendered Entry Points

| Entry Point | Present | Link Target | Status |
|---|---|---|---|
| Trilingual language switch | ✅ | `README.md`, `README.zh-CN.md`, `README.zh-TW.md` | ✅ |
| Docs Index link | ✅ | `./docs/index.md` | ✅ |
| Run in 5 minutes | ✅ | `./docs/install.md` | ✅ |
| Connect a Worker | ✅ | `./docs/worker-contract.md` | ✅ |
| Runtime API | ✅ | `./docs/runtime-api.md` | ✅ |
| Architecture | ✅ | `./docs/architecture.md` | ✅ |
| Smoke Test section | ✅ | Inline in README | ✅ |
| Shield badges | ✅ | 5 shields (Runtime, Tasks, Delivery, Fleet, License) | ✅ |
| Banner + Hero images | ✅ | `./docs/assets/banner.png`, `./docs/assets/hero.png` | ✅ |
| Product Flow diagram | ✅ | `./docs/assets/flow.png` | ✅ |
| Architecture diagram | ✅ | `./docs/assets/architecture.png` | ✅ |

**README Assessment**: Strong. All critical entry points are linked and functional.

---

## 7. Documentation Structure

```
docs/
├── index.md              ✅ Central doc hub
├── install.md            ✅ EN deployment guide
├── install.zh-CN.md      ✅ zh-CN deployment guide
├── install.zh-TW.md      ✅ zh-TW deployment guide
├── architecture.md       ✅ Architecture overview
├── runtime-api.md        ✅ Runtime API reference
├── worker-contract.md    ✅ Worker integration contract
├── TRILINGUAL-STRATEGY.md ✅ Internal localization strategy
├── assets/               ✅ Images (logo, banner, hero, flow, architecture)
├── guides/
│   ├── openclaw-agent.md (+ zh-CN, zh-TW)  ✅ Worker guide
│   ├── hermes-agent.md (+ zh-CN, zh-TW)    ✅ Worker guide
│   └── dual-agent.md (+ zh-CN, zh-TW)      ✅ Worker guide
└── v8/                   ✅ V8 design documents
```

---

## 8. Infrastructure & DevOps Files

| File | Present | Status |
|---|---|---|
| **Dockerfile** | ✅ | Multi-stage Node 20 Alpine build. |
| **docker-compose.yml** | ✅ | Production compose with API + Daemon services. |
| **.env.example** | ✅ | Template with documented variables. |
| **install.sh** | ✅ | Quick install script. |
| **scripts/health-check.sh** | ✅ | Comprehensive health check. |
| **scripts/e2e-language-smoke.js** | ✅ | E2E smoke test. |
| **scripts/docker-entrypoint.sh** | ✅ | Container entry point. |
| **scripts/validate-api-deploy.js** | ✅ | Deploy validation. |
| **systemd unit files** | ✅ | API + Daemon service files in `scripts/`. |
| **.gitignore** | ✅ | Comprehensive — covers node, env, secrets, DB, proofs, IDE. |
| **package.json** | ✅ | Properly configured with repo, bugs, homepage fields. |

---

## 9. Local Repo State

| Item | Value |
|---|---|
| **HEAD** | `b5705e5` on `main` |
| **Branches (local)** | `main`, `backup/t0a-before-parent-rewrite`, `backup/t0a-doc-only-head` |
| **Remote branches** | `origin/main` |
| **Uncommitted changes** | `M README.md`, `M README.zh-CN.md`, `?? docs/index.md` |

⚠️ **Note**: There are uncommitted changes in the working tree. These should be committed and pushed before any repo-level modifications in subsequent tasks.

---

## 10. Summary of Gaps (Priority-Sorted)

| # | Gap | Severity | Recommended Action |
|---|---|---|---|
| 1 | **No CONTRIBUTING.md** | 🔴 High | Create with contribution flow, dev setup, PR process. |
| 2 | **No CODE_OF_CONDUCT.md** | 🔴 High | Adopt Contributor Covenant 2.1. |
| 3 | **No SECURITY.md** | 🔴 High | Add vulnerability reporting policy (email/GitHub Security tab). |
| 4 | **No Issue Templates** | 🔴 High | Create Bug Report + Feature Request YAML templates. |
| 5 | **No PR Template** | 🟡 Medium | Create `.github/PULL_REQUEST_TEMPLATE.md`. |
| 6 | **No GitHub Releases** | 🟡 Medium | Create releases for `v8-rc1` and `v8-rc2` with release notes. |
| 7 | **Discussions disabled** | 🟡 Medium | Enable GitHub Discussions for community interaction. |
| 8 | **Homepage empty** | 🟡 Medium | Set homepage to repo URL or future docs site. |
| 9 | **Description typo** | 🟡 Medium | Fix "Dispatch-A" → "Dispatch — A". |
| 10 | **Topics incomplete** | 🟢 Low | Add `task-dispatcher`, `multi-agent`, `control-plane`, `typescript`, `sqlite`, `automation`. |
| 11 | **CHANGELOG.md missing** | 🟢 Low | Create and backfill rc1/rc2 entries. |
| 12 | **Wiki enabled but empty** | 🟢 Low | Either populate or disable. |
| 13 | **Uncommitted local changes** | 🟢 Low | Commit and push before applying R33 changes. |

---

## 11. Recommended Repo Settings

```yaml
# Proposed GitHub settings (to apply in subsequent R33 tasks)
description: "PM-driven control plane for long-running multi-agent work — dispatch, track, verify, repeat."
homepage: "https://github.com/zcweah1981/Nexus-Dispatch"
topics:
  - agents
  - ai-agents
  - multi-agent
  - task-dispatcher
  - control-plane
  - typescript
  - sqlite
  - automation
  - hermes-agent
  - openclaw-agent
  - workers
has_issues: true
has_projects: true
has_wiki: false          # Disable until populated
has_discussions: true    # Enable for community
```

---

## 12. Audit Proof — Commands Executed

```bash
# 1. Local repo inspection
cd $(git rev-parse --show-toplevel)
git remote -v
git branch -a
git log --oneline -10
git rev-parse HEAD
git tag -l
git status --short
ls -la
cat .gitignore
cat package.json

# 2. Community file checks
test -f CONTRIBUTING.md  # → MISSING
test -f SECURITY.md      # → MISSING
test -f CODE_OF_CONDUCT.md  # → MISSING
test -f CHANGELOG.md     # → MISSING
test -d .github          # → MISSING

# 3. GitHub API queries (unauthenticated, public view)
curl -s https://api.github.com/repos/zcweah1981/Nexus-Dispatch
curl -s https://api.github.com/repos/zcweah1981/Nexus-Dispatch/releases
curl -s https://api.github.com/repos/zcweah1981/Nexus-Dispatch/tags
curl -s https://api.github.com/repos/zcweah1981/Nexus-Dispatch/community/profile
```

### API Response Redacted Evidence

- **Repo API**: Confirmed `visibility: public`, `default_branch: main`, `has_discussions: false`, `license: MIT`
- **Community Profile API**: `health_percentage: 42`, all community files `null` except `license` and `readme`
- **Releases API**: Empty array `[]` — no published releases
- **Tags API**: `v8-rc1`, `v8-rc2` exist as git tags

---

## 13. Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Enabling Discussions without moderation plan | Low | Low | Set up category structure before enabling. |
| Adding community files that leak internal paths | Medium | High | Review all files for Telegram/chat IDs, proof paths, internal URLs before commit. |
| Description/topics changes affecting discoverability | Low | Low | Proposed topics are standard GitHub ecosystem tags. |
| Uncommitted local changes causing merge conflict | Medium | Medium | Commit and push outstanding changes before R33 task chain. |

---

*End of audit. This document is a read-only artifact — no repository modifications were made.*
