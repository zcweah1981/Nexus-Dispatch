# Contributing to Nexus Dispatch

Thanks for your interest. This guide explains how to contribute code, docs, and ideas to Nexus Dispatch.

## Quick Start

1. **Fork** the repository.
2. **Clone** your fork locally.
3. **Create a feature branch** from `main`:
   ```bash
   git checkout -b my-feature-short-description
   ```
4. **Install dependencies and verify the build:**
   ```bash
   npm install
   npm run build
   npm test
   ```
5. **Make your changes.** Follow the conventions below.
6. **Open a Pull Request** against `main`.

## Architecture Boundaries

Before writing code, understand the invariants. Violating these will get a PR rejected:

| Boundary | Rule |
| --- | --- |
| **API-only state** | All reads and writes go through the Runtime API (`/api/v1/runtime/*`). No module touches SQLite directly. |
| **Workers are stateless** | Workers receive dispatch, execute, and submit proof. They never make scheduling decisions or mark tasks complete. |
| **PM Brain owns scheduling** | Only the Daemon dispatches, retries, and gates reviews. No agent self-assigns. |
| **Proof-gated completion** | Every task completion requires structured artifacts (Git SHA, files, images). No plain-text "done". |

See [docs/architecture.md](./docs/architecture.md) for the full runtime boundary diagram.

## Code Conventions

### TypeScript

- Target: ES2022, strict mode.
- Lint: `npm run lint` (ESLint + @typescript-eslint).
- Format: no enforced formatter yet, but match the surrounding style.
- Imports: prefer `src/` absolute paths via `tsconfig.json` paths.

### Commit Messages

Use conventional commits:

```
type(scope): short description

feat(runtime): add artifact type validation
fix(daemon): prevent double-dispatch on retry
docs(install): add systemd unit example
chore(deps): bump express to 4.21
```

Types: `feat`, `fix`, `docs`, `refactor`, `test`, `chore`, `ci`.

### Tests

- Run: `npm test` (Jest).
- Place tests alongside source: `src/foo/bar.test.ts`.
- Every new API route or state transition must include at least one test covering the happy path and one covering the failure path.

### No Internal Path Leakage

PRs must not expose:

- Internal Telegram bot tokens, chat IDs, or group names.
- Private server hostnames, IPs, or SSH paths.
- Raw `task_id`, `run_id`, `dispatch_id` in user-facing strings — use human-readable summaries.
- `.env` contents or secret values.

If a test or example needs a placeholder, use `YOUR_TOKEN_HERE` or `example.com`.

## Pull Request Process

1. **Fill out the PR template** (`.github/PULL_REQUEST_TEMPLATE.md`).
2. **Proof requirement**: Include verification evidence:
   - `npm run build` succeeds.
   - `npm test` passes.
   - For API changes: `curl` example showing the new behavior (redact secrets).
   - For bug fixes: steps to reproduce the original bug.
3. **Scope**: One logical change per PR. Avoid mixing features and refactors.
4. **Review**: At least one approval required. Maintainers may request changes.
5. **Squash merge** is the default merge strategy.

## Reporting Issues

Use the issue templates in `.github/ISSUE_TEMPLATE/`:

- **Bug Report**: Runtime errors, incorrect behavior, test failures.
- **Feature Request**: New capabilities, API endpoints, or worker features.
- **Worker Integration**: Questions or issues about registering workers, receiving dispatch, or submitting proof.

Include reproduction steps. For bugs, provide:

- Nexus Dispatch version (commit SHA or tag).
- Node.js version.
- Deployment method (Docker Compose / bare metal).
- Relevant log output (redact secrets).

## Documentation Contributions

Documentation lives in `docs/` and the root `README.md` (plus localized variants).

- **English is the source of truth.** Localized files (`README.zh-CN.md`, etc.) follow.
- Keep docs practical: commands the reader can copy-paste, output they should expect.
- No marketing language. Describe what the system does, not what it aspires to do.

## Local Development

```bash
# Install
npm install

# Build
npm run build

# Run tests
npm test

# Start API server locally (requires .env with API_AUTH_TOKEN)
npm run dev

# Start daemon (separate terminal)
npm run daemon
```

For full deployment instructions, see [docs/install.md](./docs/install.md).

## License

By contributing, you agree that your contributions will be licensed under the [MIT License](./LICENSE).
