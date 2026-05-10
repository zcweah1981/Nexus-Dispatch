# R14-T2 cliproxy README Hero / Usage Visual Proof

## 任务
- Task ID: `nexus-v8-r14-t2-cliproxy-hero-and-usage-images`
- Scope: 通过 **cliproxy OpenAI-compatible endpoint** 重新生成 README Hero 与使用说明视觉图；保留架构图资产，不允许用结构图代替 Hero，不允许调用 Hermes 内置 `image_generate` / FAL。

## 交付产物
| Asset | Path | Type | Final Size | SHA256 |
| --- | --- | --- | --- | --- |
| Hero | `docs/assets/nexus-hero.png` | PNG | 1600×900 | `7dc902b8df46314b4a997b0ef1b362f277bb7a81ce76886db82e7ac5137a38e3` |
| Usage flow | `docs/assets/nexus-usage-flow.png` | PNG | 1600×900 | `6b71246a785b4ead27305fc55a6ec37a2f5adc920d7dec2eb7a86bfc0101f068` |
| Architecture diagram (existing, retained) | `docs/assets/nexus-architecture.png` | PNG | 1600×1040 | existing asset retained |

## README 引用
- Hero: `./docs/assets/nexus-hero.png`
- Architecture: `./docs/assets/nexus-architecture.png`
- Usage flow: `./docs/assets/nexus-usage-flow.png`

## cliproxy 生成 Proof
- API key source: `IMAGE_GEN_API_KEY` present at runtime
- Base URL: `https://cliproxy.biztint.com/v1`
- Model: `gemini-3.1-flash-image`
- Endpoint mode: OpenAI-compatible `chat.completions`
- Built-in Hermes `image_generate`: **not used**
- FAL fallback: **not used**

## Prompts
### Hero prompt
```text
Create a polished dark cinematic hero illustration for an open-source AI agent orchestration system README.
Scene: a deep-space / midnight control room with a luminous central PM control plane dashboard floating above a subtle grid. Around it, multiple heterogeneous AI worker nodes fan out in an organized fleet. Show directional routing lines, proof packets, review checkpoints, API-only boundaries, observability charts, and a secure zero-trust feel. Visual motifs should include: PM control plane, multi-agent orchestration, proof verification, SQLite single source of truth hidden inside API boundary, Telegram and WebUI as human-visible surfaces, and runtime telemetry. No logos, no readable brand text, no screenshots, no watermarks.
Style: premium product hero, atmospheric volumetric lighting, elegant sci-fi UI, high contrast, deep navy/indigo/teal with small amber accents, crisp details, realistic-but-illustrative, suitable for a GitHub README cover.
Composition: 16:9 landscape, strong centered focal point, clean negative space near top-left/top-center for README title overlay, balanced depth, not a literal architecture diagram.
```

### Usage flow prompt
```text
Create a README usage visual for an AI agent dispatch system, designed as a clean product illustration / infographic rather than a screenshot.
Show a left-to-right user journey with 5 stages: (1) task creation by PM, (2) dispatch to specialized agent lanes, (3) worker submits proof/artifacts, (4) PM review / acceptance gate, (5) visible delivery to Telegram and WebUI. Include visual cues for zero-trust proof, API-only runtime, status transitions, and observability. Use cards, arrows, timeline, proof badges, and subtle chat/dashboard panels, but no real UI copies, no watermarks, no readable sensitive data, no raw JSON.
Style: dark modern SaaS infographic, coherent with a control-plane product brand, navy/graphite background, teal/cyan accents, small amber highlights, clean labeling placeholders only if needed, high readability, presentation-grade.
Composition: 16:9 landscape, clearly separated stages, strong scanability for documentation usage.
```

## Raw response artifacts
- Hero raw response: `docs/assets/cliproxy-test/nexus-hero.png.1778405131.json`
- Usage raw response: `docs/assets/cliproxy-test/nexus-usage-flow.png.1778405229.json`
- Earlier failed parse debug artifact retained for audit: `docs/assets/cliproxy-test/nexus-hero.png.1778404988.json`

## 处理说明
1. 先按 cliproxy skill 执行环境预检，确认 `IMAGE_GEN_API_KEY` 可用。
2. 通过 Python `openai.OpenAI(api_key=..., base_url='https://cliproxy.biztint.com/v1')` 直连生成。
3. 从响应 `choices[0].message.images[*].image_url.url` 读取 `data:image/jpeg;base64,...` payload。
4. 解码后写入目标资产路径。
5. 因 provider 返回原图尺寸为 `1376×768`，为满足 README 资产统一规格，使用 Pillow 重采样为 `1600×900` 并保存为 PNG。
6. 将 Usage visual 插入 README 的 `## How Work Flows` 区块；保留现有 architecture 区块，确保结构图不充当 Hero。

## 验证
### 资产尺寸
- `docs/assets/nexus-hero.png` → `1600×900`
- `docs/assets/nexus-usage-flow.png` → `1600×900`

### README 结构验证
- README 顶部仍使用 `docs/assets/nexus-hero.png` 作为 Hero。
- README `Architecture` 区块仍单独引用 `docs/assets/nexus-architecture.png`。
- README 新增 `How Work Flows` 区块，单独引用 `docs/assets/nexus-usage-flow.png`。

### 安全与合规
- 未使用真实 Telegram / 派单截图。
- 未暴露 API key；仅记录 key source 是否存在。
- 未调用 FAL / 内置 `image_generate`。

## 阻塞 / 限制
- 本地视觉自动审阅（`vision_analyze` / `browser_vision`）因上游 credits 不足返回 `402`，因此未能产出机器视觉打分；当前通过尺寸、README 引用、raw response proof、以及 prompt/endpoint proof 完成可验证交付。
