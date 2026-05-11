# R29-T2 Delete Unused docs/assets Images — Verification Proof

## Task
- task_id: `nexus-v8-r29-t2-delete-unused-docs-assets-images-and-verify`
- scope: `/opt/projects/nexus-dispatch/docs/assets`
- mode: delete + verify
- upstream: R29-T1 audit manifest (`docs/v8/r29-t1-assets-image-audit-manifest.json`)

## Deletion Policy
- Delete ONLY images classified as `delete_candidate=true` in R29-T1 manifest.
- Delete ONLY images referenced exclusively by proof/history (docs/v8/**, tmp/**, guide-proof/**) or not referenced anywhere.
- Do NOT delete SSoT protected images: flow.png, architecture.png, banner.png, hero.png, logo.png.
- Do NOT delete images referenced by README*, docs/install*, docs/guides, or public docs.
- Do NOT push until final verification is clean.

## Pre-deletion Cross-check
| Check | Result |
|---|---|
| Delete candidates from R29-T1 manifest | 42 |
| All 42 exist on disk | ✅ Yes |
| SSoT protected name conflicts | ✅ None (0) |
| Public doc references to any candidate | ✅ None (0) — only refs in docs/v8/** (proof/history, excluded scope) |

## Deleted Files (42)
```
D  docs/assets/guide/deployment-flow.svg
D  docs/assets/guide/dual-system-architecture.svg
D  docs/assets/guide/hermes-integration.svg
D  docs/assets/guide/nexus-guide-hero.jpg
D  docs/assets/guide/openclaw-integration.svg
D  docs/assets/nexus-architecture-approved.jpg
D  docs/assets/nexus-architecture-en.png
D  docs/assets/nexus-architecture-en.svg
D  docs/assets/nexus-architecture-r24-cliproxy.png
D  docs/assets/nexus-architecture-zh-CN.png
D  docs/assets/nexus-architecture-zh-CN.svg
D  docs/assets/nexus-architecture-zh-TW.png
D  docs/assets/nexus-architecture-zh-TW.svg
D  docs/assets/nexus-architecture.png
D  docs/assets/nexus-architecture.svg
D  docs/assets/nexus-banner-user-source.jpg
D  docs/assets/nexus-hero-background-user-source.jpg
D  docs/assets/nexus-hero-user-source.jpg
D  docs/assets/nexus-hero.png
D  docs/assets/nexus-logo-user-source.jpg
D  docs/assets/nexus-logo.png
D  docs/assets/nexus-product-flow-approved.jpg
D  docs/assets/nexus-product-flow-en.png
D  docs/assets/nexus-product-flow-en.svg
D  docs/assets/nexus-product-flow-r24-cliproxy.png
D  docs/assets/nexus-product-flow-zh-CN.png
D  docs/assets/nexus-product-flow-zh-CN.svg
D  docs/assets/nexus-product-flow-zh-TW.png
D  docs/assets/nexus-product-flow-zh-TW.svg
D  docs/assets/nexus-product-flow.png
D  docs/assets/nexus-product-flow.svg
D  docs/assets/nexus-product-scheme-user-source.jpg
D  docs/assets/nexus-product-screenshot-user-source.jpg
D  docs/assets/nexus-sanitized-usage-screenshot.png
D  docs/assets/nexus-usage-flow.png
D  docs/assets/nexus-usage-flow.svg
D  docs/assets/r20-readme-visual-asset-contact-sheet.png
D  docs/assets/r21-t3-final-visual-proof-contact-sheet.png
D  docs/assets/r21-two-below-hero-comparison-proof.png
D  docs/assets/r23-t2-final-proof-contact-sheet.png
D  docs/assets/r24-t3-visual-qc-contact-sheet.png
D  docs/assets/r27-t2-final-proof-contact-sheet.png
```

## git diff --stat
```
42 files changed, 730 deletions(-)
```

## Remaining Images After Deletion (12)
```
KEEP  docs/assets/architecture.png              (SSoT protected)
KEEP  docs/assets/banner.png                    (SSoT protected)
KEEP  docs/assets/flow.png                      (SSoT protected)
KEEP  docs/assets/hero.png                      (SSoT protected)
KEEP  docs/assets/logo.png                      (SSoT protected)
KEEP  docs/assets/nexus-hero.svg                (public referenced)
KEEP  docs/assets/guide/api-server-verification-proof.png  (public: docs/install.zh-CN.md)
KEEP  docs/assets/guide/deployment-flow.png     (public: docs/install.zh-CN.md)
KEEP  docs/assets/guide/dual-system-architecture.png  (public: docs/install.zh-CN.md)
KEEP  docs/assets/guide/hermes-integration.png  (public: docs/install.zh-CN.md)
KEEP  docs/assets/guide/nexus-guide-cover.jpg   (public: docs/install.zh-CN.md)
KEEP  docs/assets/guide/openclaw-integration.png  (public: docs/install.zh-CN.md)
```

## Post-deletion Verification

### V1: Broken image references (public scope)
| Scope | References Checked | Broken | Status |
|---|---:|---:|---|
| README*.md | 15 | 0 | ✅ PASS |
| docs/*.md (top-level) | 6 | 0* | ✅ PASS* |
| docs/install*.md | 6 | 0 | ✅ PASS |
| docs/v8/** (proof/history) | 40 | 23 | ⚠️ Expected (deleted assets) |

*Note: `docs/TRILINGUAL-STRATEGY.md` has 1 pre-existing broken reference to `./docs/assets/nexus-hero.svg` (incorrect relative path since R16, resolves to `docs/docs/assets/nexus-hero.svg`). This was NOT caused by our deletion — `nexus-hero.svg` was not a delete candidate and still exists at `docs/assets/nexus-hero.svg`. File was not modified by this task (verified via `git diff --name-only`).

### V2: Delete candidate images remain on disk
| Candidates | Still on disk | Status |
|---:|---:|---|
| 42 | 0 | ✅ PASS |

### V3: SSoT protected images intact
| Image | Exists | Status |
|---|---|---|
| docs/assets/flow.png | ✅ | PASS |
| docs/assets/architecture.png | ✅ | PASS |
| docs/assets/banner.png | ✅ | PASS |
| docs/assets/hero.png | ✅ | PASS |
| docs/assets/logo.png | ✅ | PASS |

## Verification Verdict
✅ **CLEAN** — All verification checks pass. No public documentation has broken image references caused by this deletion. All 42 delete candidates removed. All 5 SSoT images and 7 public-referenced images preserved. Git diff shows 42 pure deletions, 730 lines removed.

## Push Status
NOT PUSHED — Awaiting final verification confirmation before push (per AC: "Do not push until final verification is clean").
