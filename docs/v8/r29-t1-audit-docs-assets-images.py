#!/usr/bin/env python3
import json
import os
import re
from pathlib import Path

ROOT = Path('/opt/projects/nexus-dispatch')
ASSETS = ROOT / 'docs' / 'assets'
OUT_JSON = ROOT / 'docs' / 'v8' / 'r29-t1-assets-image-audit-manifest.json'
OUT_MD = ROOT / 'docs' / 'v8' / 'r29-t1-audit-unused-docs-assets-images.md'

IMAGE_EXTS = {'.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg'}
TEXT_EXTS = {'.md', '.mdx', '.html', '.htm', '.tsx', '.ts', '.jsx', '.js', '.json', '.css', '.scss', '.yml', '.yaml'}
SSOT_PRESERVE = {'flow.png', 'architecture.png', 'banner.png', 'hero.png', 'logo.png'}

PROOF_PATTERNS = [
    re.compile(r'(^|/)docs/v8(/|$)'),
    re.compile(r'(^|/)tmp(/|$)'),
    re.compile(r'(^|/)guide-proof(/|$)'),
    re.compile(r'cliproxy-test'),
    re.compile(r'proof', re.I),
    re.compile(r'audit', re.I),
    re.compile(r'archive', re.I),
]

PUBLIC_ALLOW_PATTERNS = [
    re.compile(r'^README(?:\.[^/]+)?\.md$'),
    re.compile(r'^docs/[^/]+\.md$'),
    re.compile(r'^docs/guides/.+\.md$'),
    re.compile(r'^docs/install(?:\.[^/]+)?\.md$'),
    re.compile(r'^(?:src/webui|package|site|website|app|pages|components|src)/'),
]

EXCLUDE_DIRS = {'.git', 'node_modules', 'dist', 'build', '.next', 'coverage'}


def rel(p: Path) -> str:
    return p.relative_to(ROOT).as_posix()


def is_proof_history(path: str) -> bool:
    return any(rx.search(path) for rx in PROOF_PATTERNS)


def is_public_candidate(path: str) -> bool:
    if is_proof_history(path):
        return False
    return any(rx.search(path) for rx in PUBLIC_ALLOW_PATTERNS)


def iter_text_files():
    for p in ROOT.rglob('*'):
        if not p.is_file():
            continue
        parts = set(p.relative_to(ROOT).parts)
        if parts & EXCLUDE_DIRS:
            continue
        if p.suffix.lower() not in TEXT_EXTS:
            continue
        yield p


def iter_images():
    return sorted([p for p in ASSETS.rglob('*') if p.is_file() and p.suffix.lower() in IMAGE_EXTS], key=lambda x: rel(x))

images = iter_images()
text_files = list(iter_text_files())

manifest = []
for img in images:
    img_rel = rel(img)
    img_name = img.name
    needles = {
        img_rel,
        '/' + img_rel,
        img_rel.replace('docs/assets/', 'assets/'),
        img_rel.replace('docs/assets/', './assets/'),
        img_rel.replace('docs/assets/', '../assets/'),
        img_rel.replace('docs/assets/', '../../assets/'),
        img_name,
    }
    public_refs = []
    proof_refs = []
    other_refs = []
    for f in text_files:
        f_rel = rel(f)
        try:
            txt = f.read_text(encoding='utf-8', errors='ignore')
        except Exception:
            continue
        hits = sorted(n for n in needles if n and n in txt)
        if not hits:
            continue
        item = {'path': f_rel, 'hits': hits}
        if is_public_candidate(f_rel):
            public_refs.append(item)
        elif is_proof_history(f_rel):
            proof_refs.append(item)
        else:
            other_refs.append(item)

    referenced_by_public = bool(public_refs)
    referenced_only_by_proof_history = (not public_refs) and bool(proof_refs) and not other_refs
    no_refs = (not public_refs) and (not proof_refs) and (not other_refs)
    ssot_preserved = img_name in SSOT_PRESERVE
    delete_candidate = (not ssot_preserved) and (referenced_only_by_proof_history or no_refs) and (not public_refs)
    if referenced_by_public:
        reason = 'Referenced by public source/docs; keep.'
    elif ssot_preserved:
        reason = 'Current SSoT image name is protected by acceptance criteria; keep unless follow-up confirms genuinely obsolete.'
    elif referenced_only_by_proof_history:
        reason = 'Only referenced by proof/history/audit/archive files; cleanup candidate.'
    elif no_refs:
        reason = 'No textual references found in public, proof, or other scanned files; cleanup candidate.'
    else:
        reason = 'Not public-referenced, but referenced by non-proof internal files; review manually before cleanup.'
    manifest.append({
        'image_path': img_rel,
        'referenced_by_public': referenced_by_public,
        'referenced_only_by_proof_history': referenced_only_by_proof_history,
        'delete_candidate': delete_candidate,
        'reason': reason,
        'public_references': public_refs,
        'proof_history_references': proof_refs,
        'other_references': other_refs,
    })

summary = {
    'task_id': 'nexus-v8-r29-t1-audit-unused-docs-assets-images',
    'repo_root': str(ROOT),
    'assets_root': rel(ASSETS),
    'scan_command': f'python3 {rel(ROOT / "docs" / "v8" / "r29-t1-audit-docs-assets-images.py")}',
    'image_count': len(manifest),
    'public_referenced_count': sum(1 for x in manifest if x['referenced_by_public']),
    'proof_only_count': sum(1 for x in manifest if x['referenced_only_by_proof_history']),
    'delete_candidate_count': sum(1 for x in manifest if x['delete_candidate']),
    'delete_candidate_paths': [x['image_path'] for x in manifest if x['delete_candidate']],
    'ssot_preserve_names': sorted(SSOT_PRESERVE),
    'public_reference_scope': ['README*.md', 'docs/*.md', 'docs/guides/**/*.md', 'docs/install*.md', 'src/webui and package/site source if present'],
    'proof_history_exclusions': ['docs/v8/**', 'tmp/**', 'guide-proof/**', 'cliproxy-test/**', '*proof*', '*audit*', '*archive*'],
}

OUT_JSON.write_text(json.dumps({'summary': summary, 'images': manifest}, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')

rows = []
for x in manifest:
    rows.append('| {image_path} | {pub} | {proof} | {delete} | {reason} |'.format(
        image_path=x['image_path'],
        pub='yes' if x['referenced_by_public'] else 'no',
        proof='yes' if x['referenced_only_by_proof_history'] else 'no',
        delete='yes' if x['delete_candidate'] else 'no',
        reason=x['reason'].replace('|','/'),
    ))

candidate_lines = '\n'.join(f'- `{p}`' for p in summary['delete_candidate_paths']) or '- None'
md = f"""# R29-T1 Assets Image Audit Proof

## Task
- task_id: `nexus-v8-r29-t1-audit-unused-docs-assets-images`
- scope: `/opt/projects/nexus-dispatch/docs/assets`
- mode: audit only; no deletion performed.

## Exact scan command
```bash
cd /opt/projects/nexus-dispatch
python3 docs/v8/r29-t1-audit-docs-assets-images.py
```

## Scan rules
- Public references counted from: README*.md, docs/*.md, docs/guides/**/*.md, docs/install*.md, src/webui and package/site source if present.
- Proof/history references excluded from public count: docs/v8/**, tmp/**, guide-proof/**, cliproxy-test/**, generated proof/audit/archive artifacts.
- SSoT protected names: flow.png, architecture.png, banner.png, hero.png, logo.png.

## Summary
```json
{json.dumps(summary, ensure_ascii=False, indent=2)}
```

## Delete candidates (T1 audit only; not deleted)
{candidate_lines}

## Manifest
| image path | referenced_by_public | referenced_only_by_proof_history | delete_candidate | reason |
|---|---:|---:|---:|---|
{chr(10).join(rows)}

## Machine-readable manifest
- `{rel(OUT_JSON)}`
"""
OUT_MD.write_text(md, encoding='utf-8')
print(json.dumps(summary, ensure_ascii=False, indent=2))
