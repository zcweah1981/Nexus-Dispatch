# R20-T1 Frozen User Asset Proof

- Task ID: `nexus-v8-r20-t1-freeze-user-assets`
- Repo: `/opt/projects/nexus-dispatch`
- Contract source: `/root/.hermes/projects/nexus-dispatch/r20-readme-visual-recovery-plan.md`
- Contact sheet: `docs/assets/r20-readme-visual-asset-contact-sheet.png`

## Frozen asset copies

| Role | User source | Repo frozen copy | Size | SHA256 | Recommended README usage |
| --- | --- | --- | --- | --- | --- |
| logo | `/root/.hermes/image_cache/img_0be854e0db75.jpg` | `docs/assets/nexus-logo-user-source.jpg` | 1254x1254 | `015a96c69c3be82e4d93cf77ade9a150d701314d0b0b6929512f09738ade5903` | `./docs/assets/nexus-logo-user-source.jpg` |
| banner | `/root/.hermes/image_cache/img_5d8a64176510.jpg` | `docs/assets/nexus-banner-user-source.jpg` | 1280x320 | `5b786c8e63ba6096a3509aebe772d47e5eae6ed94403fc4ec104a3af2dffae3d` | `./docs/assets/nexus-banner-user-source.jpg` |
| hero_concept | `/root/.hermes/image_cache/img_c06c5ff59ed3.jpg` | `docs/assets/nexus-hero-user-source.jpg` | 1280x720 | `21c7d53e73d41a98a26825250e73b71af52430d1f07ced13d1c8b65693795e2c` | `./docs/assets/nexus-hero-user-source.jpg` |
| hero_background | `/root/.hermes/image_cache/img_2b63eafd5e01.jpg` | `docs/assets/nexus-hero-background-user-source.jpg` | 1280x649 | `258cab572788b476406e7e70b4736fa1939f56101cb54c9bd1801e8a31458223` | `./docs/assets/nexus-hero-background-user-source.jpg` |
| product_screenshot_plan | `/root/.hermes/image_cache/img_bf981ddc0541.jpg` | `docs/assets/nexus-product-screenshot-user-source.jpg` | 1280x649 | `95f8e4a3a869e7a446920537c301a1fdb6ac81059bf20124ce60d12739ffff35` | `./docs/assets/nexus-product-screenshot-user-source.jpg` |
| product_scheme_plan | `/root/.hermes/image_cache/img_c75c34aa8f49.jpg` | `docs/assets/nexus-product-scheme-user-source.jpg` | 887x1280 | `7c13bbac2116e8ce56191377b0c3f9f9db980caa59c5f349d1857272c6a6c340` | `./docs/assets/nexus-product-scheme-user-source.jpg` |

## Current README references observed

### README.md
- `<img src="./docs/assets/nexus-logo.png" alt="Nexus Dispatch logo" width="140" />`
- `<img src="./docs/assets/nexus-hero.png" alt="Nexus Dispatch — PM-driven control plane for long-running multi-agent work" width="720" />`
- `![Nexus Dispatch product flow — dispatch, track, verify with proof-based gates](./docs/assets/nexus-product-flow-en.png)`
- `![Nexus Dispatch architecture — single PM brain, multi-agent fleet, API control plane, proof closed loop](./docs/assets/nexus-architecture-en.png)`
- `![Nexus Dispatch sanitized usage screenshot — WebUI settings and registry from a live local runtime](./docs/assets/nexus-sanitized-usage-screenshot.png)`
- `| [docs/assets/](./docs/assets/) | Product visuals: logo, hero, flow, architecture |`

### README.zh-CN.md
- `<img src="./docs/assets/nexus-logo.png" alt="Nexus Dispatch logo" width="140" />`
- `<img src="./docs/assets/nexus-hero.png" alt="Nexus Dispatch — 面向长会话任务的 PM 驱动多 Agent 控制平面" width="720" />`
- `![Nexus Dispatch 工作流全景 — 派发、追踪、验证、证据门控](./docs/assets/nexus-product-flow-zh-CN.png)`
- `![Nexus Dispatch 架构 — 单一 PM 大脑、多 Agent 协作、API 控制平面、证据闭环](./docs/assets/nexus-architecture-zh-CN.png)`
- `![Nexus Dispatch 真实使用截图 — 来自本地真实运行时的 WebUI 设置与注册表页面](./docs/assets/nexus-sanitized-usage-screenshot.png)`
- `| [docs/assets/](./docs/assets/) | 产品视觉资产：logo、Hero、工作流全景、架构图 |`

### README.zh-TW.md
- `<img src="./docs/assets/nexus-logo.png" alt="Nexus Dispatch logo" width="140" />`
- `<img src="./docs/assets/nexus-hero.png" alt="Nexus Dispatch — 面向長會話任務的 PM 驅動多 Agent 控制平面" width="720" />`
- `![Nexus Dispatch 工作流全景 — 派發、追蹤、驗證、證據門控](./docs/assets/nexus-product-flow-zh-TW.png)`
- `![Nexus Dispatch 架構 — 單一 PM 大腦、多 Agent 協作、API 控制平面、證據閉環](./docs/assets/nexus-architecture-zh-TW.png)`
- `![Nexus Dispatch 真實使用截圖 — 來自本地真實執行時的 WebUI 設定與註冊表頁面](./docs/assets/nexus-sanitized-usage-screenshot.png)`
- `| [docs/assets/](./docs/assets/) | 產品視覺資產：logo、Hero、工作流全景、架構圖 |`

## Comparison summary

- **wrong_logo_vs_frozen_logo**: hamming16=109, mean_diff=[104.36, 98.76, 95.14], bbox=(0, 0, 512, 512)
- **wrong_hero_vs_user_banner**: hamming16=73, mean_diff=[85.02, 84.4, 81.56], bbox=(0, 112, 512, 400)
- **wrong_hero_vs_user_hero**: hamming16=117, mean_diff=[12.92, 22.32, 25.46], bbox=(0, 112, 512, 400)
- **flow_en_vs_user_product_screenshot_plan**: hamming16=116, mean_diff=[21.52, 22.73, 24.47], bbox=(0, 112, 512, 400)
- **arch_en_vs_user_product_scheme_plan**: hamming16=106, mean_diff=[113.76, 111.82, 109.2], bbox=(0, 0, 512, 512)

## Recommendation

1. Replace `docs/assets/nexus-logo.png` usage in all three README files with the frozen user logo copy `docs/assets/nexus-logo-user-source.jpg` or a mechanical derivative generated from it only after approval.
2. Replace top hero usage with the user-provided banner `docs/assets/nexus-banner-user-source.jpg` or the user hero `docs/assets/nexus-hero-user-source.jpg`; do not keep `docs/assets/nexus-hero.png` as the top-fold visual.
3. Do not reuse generated-looking `nexus-product-flow-*` / `nexus-architecture-*` as acceptance proof for user-approved visuals. Use the frozen plan assets as baseline references until approved polished replacements exist.
4. Keep EN / zh-CN / zh-TW structurally aligned and point them to the same frozen-source filenames where language-independent.

## Notes

- Source cache files were not modified; repo copies were created with `copy2` only.
- Vision API inspection was unavailable due credit limits, so proof uses deterministic file metadata, SHA256, and a generated contact sheet for human review.
