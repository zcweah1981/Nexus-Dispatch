# R17-T5 README Product Visual System Proof

## 任务
- Task ID: `nexus-v8-r17-t5-product-visual-system`
- Scope: 完成 README 产品视觉体系，交付可渲染 PNG 资产，补齐 cliproxy proof，并提供脱敏后的 usage screenshot。

## 交付产物
| Asset | Path | Type | Final Size | SHA256 | Source |
| --- | --- | --- | --- | --- | --- |
| Logo | `docs/assets/nexus-logo.png` | PNG | 1024×1024 | `21e96ea0c3cdecc3ab95f420a4fc4101d9c7b85303539d49c1ac5360ad3cb3e2` | cliproxy |
| Hero | `docs/assets/nexus-hero.png` | PNG | 1600×900 | `b1235fac5f62fa2b93a942e617865b553dc9af91318a568c1fa65927a32b2b3a` | cliproxy |
| Product flow | `docs/assets/nexus-product-flow.png` | PNG | 1600×900 | `ec0b5bd4f757b2ba9fa3b3d3ed4257a26bd3775da827fdc93bb7d65d27f9c678` | cliproxy |
| Architecture | `docs/assets/nexus-architecture.png` | PNG | 1600×1000 | `15b9a1a1cd5fcabb8e1e25c1b28731f6887da376cf2abb7466fb296fc094a8cb` | cliproxy |
| Sanitized usage screenshot | `docs/assets/nexus-sanitized-usage-screenshot.png` | PNG | 1600×980 | `02b0008245566ab1c6e8b5393ebe69b113fa22d6b6853a5a4afd80d6236f77d0` | local sanitized compositor |

## README 接入
- 顶部新增 `nexus-logo.png`，与 Hero 形成完整品牌首屏。
- `## Product Flow` 改为引用 `./docs/assets/nexus-product-flow.png`。
- `## Architecture` 保持单独承载系统结构，不充当 Hero。
- 新增 `## Sanitized Usage Screenshot` 区块，展示脱敏后的 Telegram + WebUI 使用视图。
- Documentation Index 中的 `docs/assets/` 描述已更新为完整视觉体系。

## cliproxy Proof
- Base URL: `https://cliproxy.biztint.com/v1`
- Model: `gemini-3.1-flash-image`
- Endpoint mode: OpenAI-compatible `chat.completions`
- API key visibility: runtime detected `IMAGE_GEN_API_KEY=True`
- Built-in Hermes `image_generate`: **not used**
- FAL fallback: **not used**

### Prompts
#### Logo
```text
Design a premium open-source infrastructure control-plane logo for a product named Nexus Dispatch, but DO NOT include any text, letters, or wordmarks. The mark must feel like a mission-control emblem for a multi-agent orchestration system. Visual concept: a central dispatch core or stargate surrounded by 4-6 subtle autonomous agent nodes or orbital points, implying routing, coordination, and zero-trust control. Style: minimal, geometric, highly recognizable at small sizes, polished but not glossy, no mascots, no cartoon style. Palette: deep navy base with cyan, teal, and violet luminous accents. Composition: centered icon, strong silhouette, clean negative space, dark transparent or dark solid background acceptable. Avoid clutter, avoid diagrams, avoid UI screenshots, avoid text. Render as a crisp modern product logo suitable for GitHub README and app branding.
```

#### Hero
```text
Create a cinematic product hero illustration for an open-source AI agent orchestration platform. This is NOT a technical architecture diagram. It should visually communicate mission control, PM brain, an agent fleet, long-running task streams, proof artifacts, Telegram and WebUI observability, API control plane, and unattended automation. Scene concept: a central mission-control intelligence hub overseeing multiple agent lanes and task streams flowing outward like coordinated light paths, with artifact cards, observability panels, and secure API control cues embedded into the composition. Include subtle references to chat notifications and dashboard visibility without rendering readable text or UI chrome that dominates the image. Mood: elite infrastructure software, strategic, trustworthy, quietly powerful. Palette: deep navy, teal, cyan, violet with selective glowing highlights. Composition: wide 16:9, strong focal center, layered depth, polished editorial product-hero aesthetic, not infographic, not logo sheet, not wireframe. No readable text, no watermarks, no brand names.
```

#### Product Flow
```text
Create a README product-flow visual for an AI agent dispatch system. This should clearly express a five-stage left-to-right journey with no readable text labels required inside the image: user creates a task, PM daemon dispatches work, Hermes/OpenClaw/custom agents execute, proof artifacts flow back, PM review decides pass/fail, and Telegram plus WebUI show human-visible progress. Style: dark modern SaaS infographic, clean product marketing visual, extremely scan-friendly, strong arrows and stage separation, cards and glowing flow lines, deep navy background with cyan, teal, violet accents and small amber highlights. Important: no raw JSON, no sensitive IDs, no watermarks, no literal code blocks, no giant paragraphs inside the image. 16:9 landscape.
```

#### Architecture
```text
Create a README architecture visual for an open-source AI agent orchestration control plane. This image belongs in the How it Works section, not as a hero. Show a no-text or near-no-text system composition with these concepts conveyed visually: Telegram and WebUI are the human-visible surfaces, a Runtime API control plane sits in the center, PM daemon coordinates dispatch, Hermes/OpenClaw/custom agents operate below or beside it, proof artifacts and review gating flow back through the API, SQLite exists only inside the API boundary as the single source of truth, and a cron adapter or scheduler sits at the edge. Style: dark editorial system diagram, minimal labels or no labels, product-quality, not wireframe, not screenshot, not logo, clean node hierarchy, strong central API boundary. Use navy/graphite background with cyan, teal, violet glows. 16:10 landscape. Avoid readable paragraphs, watermarks, or brand names.
```

## Raw proof artifacts
- Consolidated proof JSON: `tmp/guide-proof/readme-product-visual-system.json`
- Raw logo response: `tmp/guide-proof/raw/logo-gemini-3.1-flash-image-1778412449.json`
- Raw hero response: `tmp/guide-proof/raw/hero-gemini-3.1-flash-image-1778412464.json`
- Raw product-flow response: `tmp/guide-proof/raw/product_flow-gemini-3.1-flash-image-1778412491.json`
- Raw architecture response: `tmp/guide-proof/raw/architecture-gemini-3.1-flash-image-1778412511.json`
- Generator script: `tmp/cliproxy_generate_readme_visual_system.py`

## 脱敏 screenshot 说明
- 当前仓库和治理目录未发现可直接公开改造的用户提供 Telegram / 派单原始截图。
- 因此本次交付使用 **本地构造的产品使用视图**：左侧 Telegram 派单消息、右侧 WebUI 进度看板，所有联系人、chat handle、task/run/dispatch ID、bot token 均以 redaction bar 处理。
- 文件：`docs/assets/nexus-sanitized-usage-screenshot.png`
- 合规边界：不包含真实联系人、不包含真实聊天记录、不包含可回溯敏感标识。

## 验证
### 文件/尺寸验证
- `docs/assets/nexus-logo.png` → `PNG 1024×1024`
- `docs/assets/nexus-hero.png` → `PNG 1600×900`
- `docs/assets/nexus-product-flow.png` → `PNG 1600×900`
- `docs/assets/nexus-architecture.png` → `PNG 1600×1000`
- `docs/assets/nexus-sanitized-usage-screenshot.png` → `PNG 1600×980`

### README 结构验证
- 顶部品牌区已同时引用 `nexus-logo.png` 与 `nexus-hero.png`
- Product Flow 区块已引用 `nexus-product-flow.png`
- Architecture 区块继续单独引用 `nexus-architecture.png`
- 新增 Sanitized Usage Screenshot 区块，引用 `nexus-sanitized-usage-screenshot.png`

### 安全与合规
- 未泄露 API key，只记录 base_url/model/输出路径/尺寸
- 未调用 Hermes 内置 `image_generate`
- 未使用 FAL
- 视觉 AI 二次审阅尝试失败（402 credits），因此以本地文件尺寸、README 引用、raw response proof、sha256 校验作为主验证证据

## 阻塞/限制
1. **真实截图来源缺失**：当前仓库中没有用户提供的 Telegram/派单原图可裁剪；本次用脱敏 mock screenshot 兜底满足 README 展示需求。
2. **视觉自动审查 credits 不足**：`vision_analyze` 返回 402，无法产出机器视觉复核分；不阻塞交付，但保留为后续可补充验证项。
