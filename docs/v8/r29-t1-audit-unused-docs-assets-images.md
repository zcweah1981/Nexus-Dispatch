# R29-T1 Assets Image Audit Proof

## Task
- task_id: `nexus-v8-r29-t1-audit-unused-docs-assets-images`
- scope: `/opt/projects/nexus-dispatch/docs/assets`
- mode: audit only; no deletion performed.

## Exact scan command
```bash
cd /opt/projects/nexus-dispatch
python3 docs/v8/r29-t1-audit-docs-assets-images.py
```

## Exact scan script
- `docs/v8/r29-t1-audit-docs-assets-images.py`

## Scan rules
- Public references counted from: README*.md, docs/*.md, docs/guides/**/*.md, docs/install*.md, src/webui and package/site source if present.
- Proof/history references excluded from public count: docs/v8/**, tmp/**, guide-proof/**, cliproxy-test/**, generated proof/audit/archive artifacts.
- SSoT protected names: flow.png, architecture.png, banner.png, hero.png, logo.png.

## Summary
```json
{
  "task_id": "nexus-v8-r29-t1-audit-unused-docs-assets-images",
  "repo_root": "/opt/projects/nexus-dispatch",
  "assets_root": "docs/assets",
  "scan_command": "python3 docs/v8/r29-t1-audit-docs-assets-images.py",
  "image_count": 54,
  "public_referenced_count": 12,
  "proof_only_count": 42,
  "delete_candidate_count": 42,
  "delete_candidate_paths": [
    "docs/assets/guide/deployment-flow.svg",
    "docs/assets/guide/dual-system-architecture.svg",
    "docs/assets/guide/hermes-integration.svg",
    "docs/assets/guide/nexus-guide-hero.jpg",
    "docs/assets/guide/openclaw-integration.svg",
    "docs/assets/nexus-architecture-approved.jpg",
    "docs/assets/nexus-architecture-en.png",
    "docs/assets/nexus-architecture-en.svg",
    "docs/assets/nexus-architecture-r24-cliproxy.png",
    "docs/assets/nexus-architecture-zh-CN.png",
    "docs/assets/nexus-architecture-zh-CN.svg",
    "docs/assets/nexus-architecture-zh-TW.png",
    "docs/assets/nexus-architecture-zh-TW.svg",
    "docs/assets/nexus-architecture.png",
    "docs/assets/nexus-architecture.svg",
    "docs/assets/nexus-banner-user-source.jpg",
    "docs/assets/nexus-hero-background-user-source.jpg",
    "docs/assets/nexus-hero-user-source.jpg",
    "docs/assets/nexus-hero.png",
    "docs/assets/nexus-logo-user-source.jpg",
    "docs/assets/nexus-logo.png",
    "docs/assets/nexus-product-flow-approved.jpg",
    "docs/assets/nexus-product-flow-en.png",
    "docs/assets/nexus-product-flow-en.svg",
    "docs/assets/nexus-product-flow-r24-cliproxy.png",
    "docs/assets/nexus-product-flow-zh-CN.png",
    "docs/assets/nexus-product-flow-zh-CN.svg",
    "docs/assets/nexus-product-flow-zh-TW.png",
    "docs/assets/nexus-product-flow-zh-TW.svg",
    "docs/assets/nexus-product-flow.png",
    "docs/assets/nexus-product-flow.svg",
    "docs/assets/nexus-product-scheme-user-source.jpg",
    "docs/assets/nexus-product-screenshot-user-source.jpg",
    "docs/assets/nexus-sanitized-usage-screenshot.png",
    "docs/assets/nexus-usage-flow.png",
    "docs/assets/nexus-usage-flow.svg",
    "docs/assets/r20-readme-visual-asset-contact-sheet.png",
    "docs/assets/r21-t3-final-visual-proof-contact-sheet.png",
    "docs/assets/r21-two-below-hero-comparison-proof.png",
    "docs/assets/r23-t2-final-proof-contact-sheet.png",
    "docs/assets/r24-t3-visual-qc-contact-sheet.png",
    "docs/assets/r27-t2-final-proof-contact-sheet.png"
  ],
  "ssot_preserve_names": [
    "architecture.png",
    "banner.png",
    "flow.png",
    "hero.png",
    "logo.png"
  ],
  "public_reference_scope": [
    "README*.md",
    "docs/*.md",
    "docs/guides/**/*.md",
    "docs/install*.md",
    "src/webui and package/site source if present"
  ],
  "proof_history_exclusions": [
    "docs/v8/**",
    "tmp/**",
    "guide-proof/**",
    "cliproxy-test/**",
    "*proof*",
    "*audit*",
    "*archive*"
  ]
}
```

## Delete candidates (T1 audit only; not deleted)
- `docs/assets/guide/deployment-flow.svg`
- `docs/assets/guide/dual-system-architecture.svg`
- `docs/assets/guide/hermes-integration.svg`
- `docs/assets/guide/nexus-guide-hero.jpg`
- `docs/assets/guide/openclaw-integration.svg`
- `docs/assets/nexus-architecture-approved.jpg`
- `docs/assets/nexus-architecture-en.png`
- `docs/assets/nexus-architecture-en.svg`
- `docs/assets/nexus-architecture-r24-cliproxy.png`
- `docs/assets/nexus-architecture-zh-CN.png`
- `docs/assets/nexus-architecture-zh-CN.svg`
- `docs/assets/nexus-architecture-zh-TW.png`
- `docs/assets/nexus-architecture-zh-TW.svg`
- `docs/assets/nexus-architecture.png`
- `docs/assets/nexus-architecture.svg`
- `docs/assets/nexus-banner-user-source.jpg`
- `docs/assets/nexus-hero-background-user-source.jpg`
- `docs/assets/nexus-hero-user-source.jpg`
- `docs/assets/nexus-hero.png`
- `docs/assets/nexus-logo-user-source.jpg`
- `docs/assets/nexus-logo.png`
- `docs/assets/nexus-product-flow-approved.jpg`
- `docs/assets/nexus-product-flow-en.png`
- `docs/assets/nexus-product-flow-en.svg`
- `docs/assets/nexus-product-flow-r24-cliproxy.png`
- `docs/assets/nexus-product-flow-zh-CN.png`
- `docs/assets/nexus-product-flow-zh-CN.svg`
- `docs/assets/nexus-product-flow-zh-TW.png`
- `docs/assets/nexus-product-flow-zh-TW.svg`
- `docs/assets/nexus-product-flow.png`
- `docs/assets/nexus-product-flow.svg`
- `docs/assets/nexus-product-scheme-user-source.jpg`
- `docs/assets/nexus-product-screenshot-user-source.jpg`
- `docs/assets/nexus-sanitized-usage-screenshot.png`
- `docs/assets/nexus-usage-flow.png`
- `docs/assets/nexus-usage-flow.svg`
- `docs/assets/r20-readme-visual-asset-contact-sheet.png`
- `docs/assets/r21-t3-final-visual-proof-contact-sheet.png`
- `docs/assets/r21-two-below-hero-comparison-proof.png`
- `docs/assets/r23-t2-final-proof-contact-sheet.png`
- `docs/assets/r24-t3-visual-qc-contact-sheet.png`
- `docs/assets/r27-t2-final-proof-contact-sheet.png`

## Manifest
| image path | referenced_by_public | referenced_only_by_proof_history | delete_candidate | reason |
|---|---:|---:|---:|---|
| docs/assets/architecture.png | yes | no | no | Referenced by public source/docs; keep. |
| docs/assets/banner.png | yes | no | no | Referenced by public source/docs; keep. |
| docs/assets/flow.png | yes | no | no | Referenced by public source/docs; keep. |
| docs/assets/guide/api-server-verification-proof.png | yes | no | no | Referenced by public source/docs; keep. |
| docs/assets/guide/deployment-flow.png | yes | no | no | Referenced by public source/docs; keep. |
| docs/assets/guide/deployment-flow.svg | no | yes | yes | Only referenced by proof/history/audit/archive files; cleanup candidate. |
| docs/assets/guide/dual-system-architecture.png | yes | no | no | Referenced by public source/docs; keep. |
| docs/assets/guide/dual-system-architecture.svg | no | yes | yes | Only referenced by proof/history/audit/archive files; cleanup candidate. |
| docs/assets/guide/hermes-integration.png | yes | no | no | Referenced by public source/docs; keep. |
| docs/assets/guide/hermes-integration.svg | no | yes | yes | Only referenced by proof/history/audit/archive files; cleanup candidate. |
| docs/assets/guide/nexus-guide-cover.jpg | yes | no | no | Referenced by public source/docs; keep. |
| docs/assets/guide/nexus-guide-hero.jpg | no | yes | yes | Only referenced by proof/history/audit/archive files; cleanup candidate. |
| docs/assets/guide/openclaw-integration.png | yes | no | no | Referenced by public source/docs; keep. |
| docs/assets/guide/openclaw-integration.svg | no | yes | yes | Only referenced by proof/history/audit/archive files; cleanup candidate. |
| docs/assets/hero.png | yes | no | no | Referenced by public source/docs; keep. |
| docs/assets/logo.png | yes | no | no | Referenced by public source/docs; keep. |
| docs/assets/nexus-architecture-approved.jpg | no | yes | yes | Only referenced by proof/history/audit/archive files; cleanup candidate. |
| docs/assets/nexus-architecture-en.png | no | yes | yes | Only referenced by proof/history/audit/archive files; cleanup candidate. |
| docs/assets/nexus-architecture-en.svg | no | yes | yes | Only referenced by proof/history/audit/archive files; cleanup candidate. |
| docs/assets/nexus-architecture-r24-cliproxy.png | no | yes | yes | Only referenced by proof/history/audit/archive files; cleanup candidate. |
| docs/assets/nexus-architecture-zh-CN.png | no | yes | yes | Only referenced by proof/history/audit/archive files; cleanup candidate. |
| docs/assets/nexus-architecture-zh-CN.svg | no | yes | yes | Only referenced by proof/history/audit/archive files; cleanup candidate. |
| docs/assets/nexus-architecture-zh-TW.png | no | yes | yes | Only referenced by proof/history/audit/archive files; cleanup candidate. |
| docs/assets/nexus-architecture-zh-TW.svg | no | yes | yes | Only referenced by proof/history/audit/archive files; cleanup candidate. |
| docs/assets/nexus-architecture.png | no | yes | yes | Only referenced by proof/history/audit/archive files; cleanup candidate. |
| docs/assets/nexus-architecture.svg | no | yes | yes | Only referenced by proof/history/audit/archive files; cleanup candidate. |
| docs/assets/nexus-banner-user-source.jpg | no | yes | yes | Only referenced by proof/history/audit/archive files; cleanup candidate. |
| docs/assets/nexus-hero-background-user-source.jpg | no | yes | yes | Only referenced by proof/history/audit/archive files; cleanup candidate. |
| docs/assets/nexus-hero-user-source.jpg | no | yes | yes | Only referenced by proof/history/audit/archive files; cleanup candidate. |
| docs/assets/nexus-hero.png | no | yes | yes | Only referenced by proof/history/audit/archive files; cleanup candidate. |
| docs/assets/nexus-hero.svg | yes | no | no | Referenced by public source/docs; keep. |
| docs/assets/nexus-logo-user-source.jpg | no | yes | yes | Only referenced by proof/history/audit/archive files; cleanup candidate. |
| docs/assets/nexus-logo.png | no | yes | yes | Only referenced by proof/history/audit/archive files; cleanup candidate. |
| docs/assets/nexus-product-flow-approved.jpg | no | yes | yes | Only referenced by proof/history/audit/archive files; cleanup candidate. |
| docs/assets/nexus-product-flow-en.png | no | yes | yes | Only referenced by proof/history/audit/archive files; cleanup candidate. |
| docs/assets/nexus-product-flow-en.svg | no | yes | yes | Only referenced by proof/history/audit/archive files; cleanup candidate. |
| docs/assets/nexus-product-flow-r24-cliproxy.png | no | yes | yes | Only referenced by proof/history/audit/archive files; cleanup candidate. |
| docs/assets/nexus-product-flow-zh-CN.png | no | yes | yes | Only referenced by proof/history/audit/archive files; cleanup candidate. |
| docs/assets/nexus-product-flow-zh-CN.svg | no | yes | yes | Only referenced by proof/history/audit/archive files; cleanup candidate. |
| docs/assets/nexus-product-flow-zh-TW.png | no | yes | yes | Only referenced by proof/history/audit/archive files; cleanup candidate. |
| docs/assets/nexus-product-flow-zh-TW.svg | no | yes | yes | Only referenced by proof/history/audit/archive files; cleanup candidate. |
| docs/assets/nexus-product-flow.png | no | yes | yes | Only referenced by proof/history/audit/archive files; cleanup candidate. |
| docs/assets/nexus-product-flow.svg | no | yes | yes | Only referenced by proof/history/audit/archive files; cleanup candidate. |
| docs/assets/nexus-product-scheme-user-source.jpg | no | yes | yes | Only referenced by proof/history/audit/archive files; cleanup candidate. |
| docs/assets/nexus-product-screenshot-user-source.jpg | no | yes | yes | Only referenced by proof/history/audit/archive files; cleanup candidate. |
| docs/assets/nexus-sanitized-usage-screenshot.png | no | yes | yes | Only referenced by proof/history/audit/archive files; cleanup candidate. |
| docs/assets/nexus-usage-flow.png | no | yes | yes | Only referenced by proof/history/audit/archive files; cleanup candidate. |
| docs/assets/nexus-usage-flow.svg | no | yes | yes | Only referenced by proof/history/audit/archive files; cleanup candidate. |
| docs/assets/r20-readme-visual-asset-contact-sheet.png | no | yes | yes | Only referenced by proof/history/audit/archive files; cleanup candidate. |
| docs/assets/r21-t3-final-visual-proof-contact-sheet.png | no | yes | yes | Only referenced by proof/history/audit/archive files; cleanup candidate. |
| docs/assets/r21-two-below-hero-comparison-proof.png | no | yes | yes | Only referenced by proof/history/audit/archive files; cleanup candidate. |
| docs/assets/r23-t2-final-proof-contact-sheet.png | no | yes | yes | Only referenced by proof/history/audit/archive files; cleanup candidate. |
| docs/assets/r24-t3-visual-qc-contact-sheet.png | no | yes | yes | Only referenced by proof/history/audit/archive files; cleanup candidate. |
| docs/assets/r27-t2-final-proof-contact-sheet.png | no | yes | yes | Only referenced by proof/history/audit/archive files; cleanup candidate. |

## Machine-readable manifest
- `docs/v8/r29-t1-assets-image-audit-manifest.json`
