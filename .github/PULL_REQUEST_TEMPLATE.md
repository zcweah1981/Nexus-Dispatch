## Description

<!-- What does this PR do? One sentence. -->

## Type of Change

<!-- Check one: -->

- [ ] `feat` — New capability
- [ ] `fix` — Bug fix
- [ ] `refactor` — No behavior change
- [ ] `docs` — Documentation only
- [ ] `test` — Test additions or fixes
- [ ] `chore` — Build, CI, dependencies

## Related Issue

<!-- Link the issue: Closes #123 or Related to #456 -->

## Changes

<!-- Bullet list of what changed. Be specific about files and modules. -->

-

## Proof / Verification

<!-- Required. Every PR needs evidence. Fill out the relevant sections. -->

### Build & Tests

```bash
npm run build
# Output: (paste result)

npm test
# Output: (paste result)
```

### Manual Verification

<!-- For API changes: curl example. For bug fixes: reproduction steps. For UI: screenshot. -->

```bash
# Example: curl command showing new behavior (redact secrets)
```

- [ ] `npm run build` passes
- [ ] `npm test` passes
- [ ] New code has tests (or explain why not)
- [ ] No hardcoded secrets, tokens, or internal paths

## Architecture Boundary Check

<!-- Confirm your change respects the invariants. -->

- [ ] Does not bypass the Runtime API (no direct SQLite access).
- [ ] Does not give workers scheduling authority.
- [ ] Does not allow tasks to skip FSM states.
- [ ] Does not leak internal IDs, tokens, or private URLs in user-facing output.

## Screenshots / Demo (if applicable)

<!-- For WebUI or visible behavior changes. -->

## Notes for Reviewers

<!-- Anything the reviewer should know before reading the diff. -->
