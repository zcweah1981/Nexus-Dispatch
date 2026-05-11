# R28-T4 Proof — README Architecture / Worker Contract Split

Task: `nexus-v8-r28-t4-docs-split-architecture-worker-contract`

## Scope

Move verbose public README architecture / worker implementation details into user-facing docs when needed, while keeping README focused:

- README Architecture: image + exactly 3 invariants.
- README Worker Contract: short summary + link to detailed Worker contract.
- Public Documentation section: user-facing docs only; no `docs/v8`, proof, trilingual strategy, or asset index links.

## Changed Files

- `README.md`
- `README.zh-CN.md`
- `README.zh-TW.md`
- `docs/architecture.md`
- `docs/worker-contract.md`
- `docs/runtime-api.md`
- `docs/v8/long-proof-r28-t4-docs-split-architecture-worker-contract.md`

## Implementation Notes

- Created `docs/architecture.md` with the detailed ASCII architecture, component responsibilities, state/proof flow, and boundary notes.
- Created `docs/worker-contract.md` with registration, dispatch payload, proof submission, and Worker rule details.
- Created `docs/runtime-api.md` because the public README already links Runtime API as a user-facing entry and the target file was absent.
- Reduced all three README Worker sections to a compact summary and link.
- Kept all three README Architecture sections as the existing architecture image plus three invariants.
- Public Documentation tables now link only:
  - install guide;
  - Worker integration;
  - Runtime API;
  - Architecture.

## Validation

Command bundle run from `/opt/projects/nexus-dispatch`:

```bash
set -euo pipefail
python3 /tmp/nexus_r28_t4_verify.py

git diff --check

git diff --name-status -- README.md README.zh-CN.md README.zh-TW.md docs/architecture.md docs/worker-contract.md docs/runtime-api.md

git status --short --untracked-files=all
```

Result:

```text
PASS docs split contract
{
  "readmes": [
    "README.md",
    "README.zh-CN.md",
    "README.zh-TW.md"
  ],
  "docs": [
    "docs/architecture.md",
    "docs/worker-contract.md",
    "docs/runtime-api.md"
  ],
  "token_placeholder_counts": {
    "README.md": 4,
    "README.zh-CN.md": 4,
    "README.zh-TW.md": 4
  }
}
```

Validated assertions:

- Each README Architecture section has exactly one `docs/assets/architecture.png` reference.
- Each README Architecture section has exactly 3 numbered invariants.
- README Architecture sections contain no code fence or ASCII diagram.
- Each README Worker section is a short summary and links `./docs/worker-contract.md`.
- README Worker sections contain no verbose JSON dispatch payload or raw task/project IDs.
- Public README Documentation sections contain no `docs/v8`, proof, trilingual strategy, or assets links.
- Changed public docs/README Markdown links resolve on disk.
- Public docs subset passes secret/raw-token pattern scan.
- `git diff --check` passed.

## Notes

The repository already had unrelated dirty/untracked state before this task, including README/image work from R28/R26/R22 and deleted `docs/assets/cliproxy-test/*` files. This proof records only the R28-T4 docs split scope.
