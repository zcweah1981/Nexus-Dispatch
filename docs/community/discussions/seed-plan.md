# GitHub Discussions Community Seed Plan

> **Status**: DRAFT — Pending repo owner approval and GitHub auth setup  
> **Created**: 2026-05-11  
> **Author**: Hyoga (Ops Agent)

---

## 1. Current State

| Item | Status |
|------|--------|
| Repository | `zcweah1981/Nexus-Dispatch` (Public) |
| Discussions Feature | ❌ **NOT ENABLED** — tab not visible in repo navigation |
| `gh` CLI | ❌ Not installed on VPS |
| `GH_TOKEN` / `GITHUB_TOKEN` | ❌ Not set |
| SSH push access | ✅ Working (via `id_ed25519`) |

## 2. Pre-requisites (Must Do First)

### 2.1 Install and Authenticate `gh` CLI

```bash
# Step 1: Install gh CLI
curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg | \
  sudo dd of=/usr/share/keyrings/githubcli-archive-keyring.gpg
echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] \
  https://cli.github.com/packages stable main" | \
  sudo tee /etc/apt/sources.list.d/github-cli.list > /dev/null
sudo apt update && sudo apt install gh -y

# Step 2: Authenticate (requires GitHub Personal Access Token)
# Generate PAT at: https://github.com/settings/tokens
# Required scopes: repo, read:org, discussion (if available)
gh auth login --with-token <<< "YOUR_GITHUB_PAT"

# Step 3: Verify
gh auth status
```

### 2.2 Enable Discussions on the Repository

GitHub Discussions must be enabled by a repo admin through the GitHub UI:

1. Go to: https://github.com/zcweah1981/Nexus-Dispatch/settings
2. Scroll to **"Features"** section
3. Check ✅ **"Discussions"**
4. Click Save

OR via `gh` CLI (after auth):
```bash
gh api repos/zcweah1981/Nexus-Dispatch \
  -X PATCH \
  -f has_discussions=true
```

## 3. Seed Discussion Categories

Create these **Discussion Categories** first (requires admin access):

| Category | Slug | Description |
|----------|------|-------------|
| 📢 Announcements | `announcements` | Official updates and release notes |
| 💡 Ideas & Feature Requests | `ideas` | Propose new features and improvements |
| 🛠️ Worker Integration | `worker-integration` | Connect, configure, and debug Worker nodes |
| 🗺️ Roadmap | `roadmap` | Public roadmap and milestone discussions |
| ❓ Q&A | `q-a` | Ask questions, get help from the community |

```bash
# Create categories via GraphQL (after gh auth)
gh api graphql -f query='
mutation {
  createDiscussionCategory(input: {
    repositoryId: "REPO_NODE_ID",
    name: "Announcements",
    emoji: "📢",
    description: "Official updates and release notes"
  }) { category { id name } }
}'
# Repeat for each category...
```

## 4. Seed Discussions (4 Drafts)

See individual files in this directory:
- [01-what-are-you-using-nexus-dispatch-for.md](./01-what-are-you-using-nexus-dispatch-for.md)
- [02-worker-integration-ideas.md](./02-worker-integration-ideas.md)
- [03-roadmap-v0.2.md](./03-roadmap-v0.2.md)
- [04-qa-welcome.md](./04-qa-welcome.md)

## 5. Post-Enable Execution Commands

Once Discussions are enabled and `gh` is authenticated, run:

```bash
cd /opt/projects/nexus-dispatch

# Create Discussion 1 — Q&A category
gh api graphql -f query='
mutation {
  createDiscussion(input: {
    repositoryId: "REPO_NODE_ID",
    categoryId: "CATEGORY_NODE_ID",
    title: "💬 What are you using Nexus Dispatch for?",
    body: "'"$(cat docs/community/discussions/01-what-are-you-using-nexus-dispatch-for.md | sed "s/'/\\\\'/g")"'"
  }) { discussion { url } }
}'

# Create Discussion 2 — Worker Integration category
gh api graphql -f query='
mutation {
  createDiscussion(input: {
    repositoryId: "REPO_NODE_ID",
    categoryId: "CATEGORY_NODE_ID",
    title: "🛠️ Worker Integration Ideas — Share Your Setup",
    body: "'"$(cat docs/community/discussions/02-worker-integration-ideas.md | sed "s/'/\\\\'/g")"'"
  }) { discussion { url } }
}'

# Create Discussion 3 — Roadmap category
gh api graphql -f query='
mutation {
  createDiscussion(input: {
    repositoryId: "REPO_NODE_ID",
    categoryId: "CATEGORY_NODE_ID",
    title: "🗺️ Roadmap v0.2 — Planning Ahead",
    body: "'"$(cat docs/community/discussions/03-roadmap-v0.2.md | sed "s/'/\\\\'/g")"'"
  }) { discussion { url } }
}'

# Create Discussion 4 — Q&A category
gh api graphql -f query='
mutation {
  createDiscussion(input: {
    repositoryId: "REPO_NODE_ID",
    categoryId: "CATEGORY_NODE_ID",
    title: "❓ Q&A — Ask Anything About Nexus Dispatch",
    body: "'"$(cat docs/community/discussions/04-qa-welcome.md | sed "s/'/\\\\'/g")"'"
  }) { discussion { url } }
}'
```

## 6. Blockers

| # | Blocker | Owner | Resolution |
|---|---------|-------|------------|
| B1 | `gh` CLI not installed | Ops/Owner | Install `gh` on VPS |
| B2 | No GitHub PAT available | Owner | Generate PAT with `repo` + `discussion` scope |
| B3 | Discussions feature not enabled | Repo Admin | Enable via Settings UI or API |
| B4 | Repo Node ID needed for GraphQL | Ops | Run `gh api repos/zcweah1981/Nexus-Dispatch --jq .node_id` after auth |

## 7. Risk Assessment

| Risk | Impact | Mitigation |
|------|--------|------------|
| Premature community launch before v0.2 | Low engagement, confused users | Keep Discussions as "seeded draft" until README links are ready |
| Spam / off-topic posts | Cluttered Discussions | Configure category rules; enable "Maintainer" label for team posts |
| Auth token leak | Repo compromise | Use fine-grained PAT, minimal scope, rotate regularly |
