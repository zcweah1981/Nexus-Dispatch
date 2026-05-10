# R21-T2 README below-hero image regeneration proof

## Task
- Task ID: `nexus-v8-r21-t2-regenerate-two-below-hero-images`
- Scope: regenerate the two README images directly below the hero/banner section from scratch, using the hero as the visual baseline.
- Baseline hero: `docs/assets/nexus-hero-user-source.jpg`
- Comparison proof image: `docs/assets/r21-two-below-hero-comparison-proof.png`
- Machine-readable manifest: `docs/v8/r21-t2-regenerate-two-below-hero-images-manifest.json`

## Exact replaced asset paths
### Active README targets
- `docs/assets/nexus-product-flow-en.svg`
- `docs/assets/nexus-product-flow-en.png`
- `docs/assets/nexus-product-flow-zh-CN.svg`
- `docs/assets/nexus-product-flow-zh-CN.png`
- `docs/assets/nexus-product-flow-zh-TW.svg`
- `docs/assets/nexus-product-flow-zh-TW.png`
- `docs/assets/nexus-architecture-en.svg`
- `docs/assets/nexus-architecture-en.png`
- `docs/assets/nexus-architecture-zh-CN.svg`
- `docs/assets/nexus-architecture-zh-CN.png`
- `docs/assets/nexus-architecture-zh-TW.svg`
- `docs/assets/nexus-architecture-zh-TW.png`

### Compatibility aliases regenerated in lockstep
- `docs/assets/nexus-product-flow.svg`
- `docs/assets/nexus-product-flow.png`
- `docs/assets/nexus-architecture.svg`
- `docs/assets/nexus-architecture.png`

## Visual standard applied
- same deep navy background family as hero baseline: `#08111F`, `#0B1730`, `#09101C`
- same cyan / blue / violet glow language: `#22D3EE`, `#60A5FA`, `#8B5CF6`
- same mature premium product tone: layered cards, controlled grid, dense but readable typography, no sketch/whiteboard feel
- no fake screenshots; both assets remain diagrams with correct product semantics

## Replacement proof
- Old vs new EN flow diff: bbox=`(0, 0, 1600, 900)` RMS=`49.301`
- Old vs new EN architecture diff: bbox=`(0, 0, 1600, 1000)` RMS=`46.072`
- zh-CN vs zh-TW flow diff bbox: `None`
- zh-CN vs zh-TW architecture diff bbox: `None`

## Output dimensions and hashes
- `docs/assets/nexus-product-flow-en.png` → `[1600, 900]` → `b0900681084b0d7729eb9939573d9281a74749e74eb937d326d06be213315d9e`
- `docs/assets/nexus-product-flow-zh-CN.png` → `[1600, 900]` → `44a1f0164938d4308181797e97b6789118d44e762a6748e942c65f0f88f72cf1`
- `docs/assets/nexus-product-flow-zh-TW.png` → `[1600, 900]` → `3ecc66d575cc3a99eb61080df425d427eb50308467f0faea86eaac5a69f03df1`
- `docs/assets/nexus-architecture-en.png` → `[1600, 1000]` → `543ecdd958b91b4609441dda0d41300b321b420d183fa3e8555a589b4db66f44`
- `docs/assets/nexus-architecture-zh-CN.png` → `[1600, 1000]` → `5e9f0fb353f518a3058473c08d89c9e388b5046a783c8f8419cbfeb4f1e553f0`
- `docs/assets/nexus-architecture-zh-TW.png` → `[1600, 1000]` → `5e9f0fb353f518a3058473c08d89c9e388b5046a783c8f8419cbfeb4f1e553f0`

## README reference check
- `README.md` keeps `./docs/assets/nexus-product-flow-en.png` and `./docs/assets/nexus-architecture-en.png`
- `README.zh-CN.md` keeps `./docs/assets/nexus-product-flow-zh-CN.png` and `./docs/assets/nexus-architecture-zh-CN.png`
- `README.zh-TW.md` keeps `./docs/assets/nexus-product-flow-zh-TW.png` and `./docs/assets/nexus-architecture-zh-TW.png`

## Notes
- Previous binaries were backed up to `/tmp/nexus-v8-r21-readme-image-backup` before overwrite for visual comparison.
- Regeneration was deterministic SVG -> PNG, so editable source remains in repo and avoids stochastic text-render drift.
