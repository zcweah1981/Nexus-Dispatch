# Security Policy

## Supported Versions

Nexus Dispatch is in active development. Security fixes apply to the latest commit on `main`.

| Version | Supported |
| --- | --- |
| `main` branch | ✅ |
| Older branches / tags | ❌ |

## Security Model

Nexus Dispatch enforces these runtime boundaries by design:

### API-Only State Access
All state changes go through the Runtime API (`/api/v1/runtime/*`). SQLite is internal to the API server process. No external module, worker, or service touches the database directly.

### Authentication
Every Runtime API request requires a `Bearer` token. Two tokens are in play:
- **API_AUTH_TOKEN** — authenticates external API consumers.
- **PM_API_TOKEN** — authenticates the Daemon's internal API calls.

Both are set via environment variables. Never commit tokens to the repository.

### Worker Isolation
Workers are stateless HTTP endpoints. They:
- Receive dispatch payloads and return execution results.
- Submit structured proof (runs, artifacts, transitions) through the API.
- Cannot access SQLite, modify task state directly, or bypass the FSM.

### Human-Readable Output
Telegram notifications and user-facing messages contain summaries only — no raw `task_id`, `run_id`, tokens, chat IDs, or internal identifiers. Full traceability stays in the database and runtime proof.

### Deployment Boundaries
- **Single VPS, single SQLite file.** No distributed state to attack.
- **HTTPS recommended** for any public-facing deployment.
- **`.env` must never be committed.** `.env.example` contains only placeholder values.

## Reporting a Vulnerability

If you find a security issue, report it responsibly:

1. **Do not open a public GitHub issue.**
2. Email the maintainer at the address listed in the repository's GitHub profile, or use [GitHub's private vulnerability reporting](https://github.com/zcweah1981/Nexus-Dispatch/security/advisories/new).
3. Include:
   - Description of the vulnerability.
   - Steps to reproduce (commands, payloads, or configurations).
   - Affected version or commit SHA.
   - Potential impact.

### What to Expect

- **Acknowledgment** within 48 hours.
- **Initial assessment** within 5 business days.
- **Fix or mitigation** timeline communicated based on severity.

## Out of Scope

The following are not treated as security vulnerabilities:

- Attacks requiring already-compromised `API_AUTH_TOKEN` (the token is the trust boundary).
- Denial-of-service against a single-VPS deployment (resource limits are expected).
- Issues in third-party dependencies not shipped with Nexus Dispatch — report those upstream.

## Security Hygiene for Contributors

- Never hardcode secrets, tokens, or private URLs in source code.
- Never commit `.env` files.
- Use `YOUR_TOKEN_HERE` or similar placeholders in examples and tests.
- Run `npm audit` before submitting PRs and address critical findings.
