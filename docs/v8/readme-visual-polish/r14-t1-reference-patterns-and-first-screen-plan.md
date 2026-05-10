# R14-T1: Reference README Pattern Analysis & First-Screen Rewrite Plan

> **Task ID**: nexus-v8-r14-t1-reference-readme-patterns
> **Lane**: CONTENT
> **Owner**: ikki-content-1
> **Status**: completed
> **Date**: 2026-05-10

---

## 一、参考仓 README 结构模式提取

### 1.1 Scrapling (D4Vinci/Scrapling — 48.4k ⭐)

**第一屏结构**（按渲染顺序）：

| 层级 | 元素 | 实现手法 |
|------|------|----------|
| L1 | 居中品牌 logo + tagline | `<h1 align="center">` 内嵌 `<picture>` dark/light 双版 SVG + `<small>` tagline |
| L2 | Trendshift 徽章 + 语言切换 | `<p align="center">` 内链式排列：العربيه · Español · Português · Français · Deutsch · 简体中文 · 日本語 · Русsky · 한국어 |
| L3 | Badge 阵列（3行） | Tests / PyPI / Downloads / Agent Skill / OpenClaw · Discord / X Follow · Python versions |
| L4 | 快速导航 chips | `<p align="center">` 内：Selection methods · Fetchers · Spiders · Proxy Rotation · CLI · MCP |
| L5 | 一段式产品描述 | 3 句话：定位 → 核心能力 → 愿景 |
| L6 | 代码示例 | 2 个 Python code block（基础用法 + 爬虫模式） |
| L7 | 赞助商 Banner | 居中图片 |

**章节顺序**：
Sponsors → Key Features (4 个 emoji 子节) → Getting Started → CLI → Benchmarks → Installation → Contributing → Disclaimer → Citations → License

**可借鉴模式**：
- ✅ `<h1 align="center">` 居中品牌区 + dark/light 自适应 logo
- ✅ 多语言链接排成一行、用 `|` 分隔
- ✅ Badge 分 3 行排列：状态/生态 → 社交 → 兼容性
- ✅ 快速导航 chips（核心功能锚点链接）
- ✅ 一段话 + 两段代码示例的「Hero 叙事节奏」

### 1.2 Open Design (nexu-io/open-design — 35.6k ⭐)

**第一屏结构**（按渲染顺序）：

| 层级 | 元素 | 实现手法 |
|------|------|----------|
| L1 | 居中全宽 Banner 图 | `<p align="center"><img width="100%"/>` |
| L2 | 居中 Badge 阵列（2行，for-the-badge 风格） | Stars / Forks / Issues / PRs / Contributors / Commit activity / Last commit |
| L3 | 居中 Badge 第二行（flat-square 风格） | Download / Release / License / Agents / Design Systems / Skills / Discord / X / Quickstart |
| L4 | 语言切换行 | `<p align="center">` 内 13 种语言，当前语言加粗，其余为链接 |
| L5 | `<hr>` 分隔线 | `---` |

**章节顺序**：
Why this exists → At a glance (特性总览表) → Demo (截图 2×4 网格) → Skills → Six load-bearing ideas → Architecture → Quickstart → Design Systems → Visual directions → Media → Comparison → Supported agents → Roadmap → Contributing → License

**可借鉴模式**：
- ✅ `for-the-badge` 大号徽章 + `flat-square` 信息型徽章分层排列
- ✅ Badge 中嵌入关键数字亮点（agents: 16 CLIs / design systems: 72 / skills: 31）
- ✅ 语言行中当前语言 `<b>` 加粗，其余为链接
- ✅ "At a glance" 表格式特性总览，一表见全貌
- ✅ Demo 截图 2 列 grid + caption 说明
- ✅ "Six load-bearing ideas" 用编号子节解释设计哲学

### 1.3 Refly (refly-ai/refly)

**第一屏结构**（按渲染顺序）：

| 层级 | 元素 | 实现手法 |
|------|------|----------|
| L1 | 全宽 Hero 图（GitHub attachment） | `<img width="2880" height="1620">` |
| L2 | H1 标题 + 右对齐语言切换 | `<p align="right">` 放 English · 中文 |
| L3 | 居中 Badge 阵列 | GitHub Stars / Website / YouTube / Discord / Refly Skills / Docs / DeepWiki / License / X |
| L4 | 用例快速导航 | `[APIs for Lovable] · [Webhooks for Lark/Feishu] · [Skills for Claude Code] · [Build Clawdbot]` |
| L5 | 一句式价值主张 | "Skills are not prompts. They are durable infrastructure." |
| L6 | 产品定位描述 | 2-3 句话 |
| L7 | CTA 链接 | `<a>Try it Now</a>` |

**章节顺序**：
Refly Skills → Quick Start → Why Refly? → Core Capabilities → Ecosystem → Why Teams Choose Refly (对比表) → Create Your First Workflow → Use Cases → Community → Contributing → Star History → License

**可借鉴模式**：
- ✅ Hero 大图置顶，视觉冲击力最强
- ✅ 用例快速导航（场景锚点链接），直击用户需求
- ✅ "Skills are not prompts" 式的金句 tagline
- ✅ Quick Start 用表格按 "I want to..." 分流，降低选择成本
- ✅ Core Capabilities 用 emoji + 编号子节 + 简洁描述
- ✅ 对比表（vs 竞品）突出差异化

---

## 二、跨仓共性模式总结

| 模式 | Scrapling | Open Design | Refly | 可借鉴度 |
|------|-----------|-------------|-------|----------|
| **居中品牌区** | `<h1 align="center">` + SVG logo | 居中全宽 Banner | 全宽 Hero 图 | ⭐⭐⭐ |
| **语言切换** | 居中，`|` 分隔，9 语言 | 居中，13 语言，当前加粗 | 右对齐，2 语言 | ⭐⭐⭐ |
| **Badge 分层** | 3 行（状态/社交/兼容） | 2 行（for-the-badge + flat-square） | 1 行紧凑 | ⭐⭐⭐ |
| **信息型 Badge** | 含关键数字（Downloads/PyPI） | 嵌数字（agents:16/systems:72/skills:31） | 基础指标 | ⭐⭐⭐ |
| **快速导航 chips** | 功能锚点链接 | 无 | 用例锚点链接 | ⭐⭐⭐ |
| **Hero 叙事** | 一段话 + 2 代码块 | Why this exists（叙事段落） | 金句 + 定位描述 | ⭐⭐⭐ |
| **特性总览** | Key Features 4 子节 | At a glance 总览表 | Core Capabilities 4 子节 | ⭐⭐⭐ |
| **视觉分离** | `---` 分隔线 + emoji 图标 | `---` + 表格 + 截图网格 | `---` + 表格 + emoji | ⭐⭐⭐ |
| **Quickstart 节奏** | Basic Usage → 高级用法 | Docker → Source → Desktop | 表格分流 + 场景引导 | ⭐⭐ |
| **对比/竞品** | 无 | Comparison 节 | Why Teams Choose Refly (表格) | ⭐⭐ |

---

## 三、Nexus README 第一屏方案

### 3.1 结构蓝图（Markdown 渲染顺序）

```
┌─────────────────────────────────────────────────────┐
│  L1: 居中 Logo + 产品名 + Tagline                    │
│  ┌─────────────────────────────────────────────┐    │
│  │  [nexus-hero.png 或 SVG 居中]               │    │
│  │  Nexus Dispatch                              │    │
│  │  One brain. Many hands. Zero trust.          │    │
│  └─────────────────────────────────────────────┘    │
├─────────────────────────────────────────────────────┤
│  L2: 语言切换（居中）                                 │
│  English | 简体中文 | 繁體中文                         │
├─────────────────────────────────────────────────────┤
│  L3: Badge 阵列（2 行居中）                           │
│  Row 1: License · Node 18+ · SQLite · Docker         │
│  Row 2: Docs · Telegram · WebUI · API Status         │
├─────────────────────────────────────────────────────┤
│  L4: 产品特色标签（居中 chips）                        │
│  State Machine · DAG Engine · Zero-Trust Proof        │
│  · Per-Agent Bot · Cron Registry · API-Only          │
├─────────────────────────────────────────────────────┤
│  L5: Hero 叙事段落                                    │
│  1 句定位 + 1 段核心价值描述（2-3 行）                  │
├─────────────────────────────────────────────────────┤
│  L6: CTA 链接                                        │
│  Quick Start → · Full Docs → · Architecture →        │
└─────────────────────────────────────────────────────┘
│  --- 分隔线 ---                                      │
```

### 3.2 第一屏 Markdown 草稿

```markdown
<h1 align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="docs/assets/nexus-hero-dark.svg">
    <img alt="Nexus Dispatch" src="docs/assets/nexus-hero.png" width="480">
  </picture>
  <br/>
  <small>One brain. Many hands. Zero trust.</small>
</h1>

<p align="center">
  <b>English</b> · <a href="README.zh-CN.md">简体中文</a> · <a href="README.zh-TW.md">繁體中文</a>
</p>

<p align="center">
  <img alt="License" src="https://img.shields.io/badge/license-Private-red?style=flat-square">
  <img alt="Node" src="https://img.shields.io/badge/node-18%2B-339933?style=flat-square&logo=node.js&logoColor=white">
  <img alt="SQLite" src="https://img.shields.io/badge/SSoT-SQLite-003B57?style=flat-square&logo=sqlite&logoColor=white">
  <img alt="Docker" src="https://img.shields.io/badge/deploy-Docker-2496ED?style=flat-square&logo=docker&logoColor=white">
  <img alt="API" src="https://img.shields.io/badge/runtime-API--only-6C63FF?style=flat-square">
  <br/>
  <a href="docs/install.md"><img alt="Docs" src="https://img.shields.io/badge/docs-install.md-2ea043?style=flat-square"></a>
  <a href="docs/v8/"><img alt="V8 Spec" src="https://img.shields.io/badge/specs-v8-ff6b35?style=flat-square"></a>
</p>

<p align="center">
  <strong>State Machine</strong> · <strong>DAG Engine</strong> · <strong>Zero-Trust Proof</strong> · <strong>Per-Agent Bot</strong> · <strong>Cron Registry</strong> · <strong>API-Only Boundary</strong>
</p>

Nexus Dispatch is the control plane your AI agents don't have. A single PM-style Daemon evaluates priorities, resolves DAG dependencies, fans out work to heterogeneous workers — and never trusts a worker to self-certify completion. Every state transition goes through the REST API. Every artifact is proof-gated. Nothing is "done" until the state machine says so.

<p align="center">
  <a href="#quick-start"><strong>Quick Start →</strong></a> · <a href="docs/install.md">Full Deployment Guide</a> · <a href="#architecture">Architecture</a>
</p>

---
```

### 3.3 方案说明

| 元素 | 设计决策 | 参考来源 |
|------|----------|----------|
| **Logo 居中 + dark/light 自适应** | Scrapling 的 `<picture>` 方案，自动适配深浅主题 | Scrapling L1 |
| **产品名 + tagline** | 保留现有 tagline "One brain. Many hands. Zero trust."，已有辨识度 | 现有 |
| **语言切换居中** | 当前语言 `<b>` 加粗，其余链接。Nexus 只需 3 语言，保持简洁 | Open Design L4 |
| **Badge 2 行** | Row 1 技术栈标识，Row 2 文档/规范入口。用 `flat-square` 风格，不喧宾夺主 | Open Design L2-L3 |
| **特色标签 chips** | 居中 `<strong>` 关键词 + `·` 分隔。不造 badge，纯文本即可传递 | Refly L4 + Scrapling L4 |
| **Hero 叙事** | 1 段话，3 句以内。先说"是什么"，再说"怎么做到"，最后强调核心不变量 | 三个仓共性 |
| **CTA 链接** | Quick Start（锚点） + Full Docs + Architecture。3 个入口足够 | Refly L7 |

---

## 四、README 章节重排方案

### 4.1 当前章节顺序（现有）

1. 标题 + 语言切换
2. Hero 图片
3. Tagline + 产品描述
4. Why Nexus Dispatch?
5. Who Is This For?
6. Core Capabilities（7 个子节）
7. Architecture（图 + ASCII）
8. Runtime Model
9. Quick Start
10. Security & Secrets Boundary
11. Project Structure
12. Documentation Index
13. Verification Commands
14. License

### 4.2 重排后章节顺序（建议）

```
# Nexus Dispatch                    ← 居中品牌区（L1-L6，见上文第一屏方案）
---
## Why Nexus Dispatch?              ← Hero 叙事（痛点 → 解决方案，保留现有）
## At a Glance                      ← 新增：特性总览表（参考 Open Design）
## Product Highlights               ← 原 "Core Capabilities"，精简为 4 个优势标签
## Architecture                     ← 保留架构图 + ASCII（上移，尽早展示）
## Use Cases                        ← 原 "Who Is This For?"，改为场景表格
## Quick Start                      ← 上移！降低试用门槛
## Core Capabilities (Deep Dive)    ← 原 7 个子节的详细展开
## Runtime Model                    ← 保留
## Security & Secrets Boundary      ← 保留
## Project Structure                ← 保留
## Documentation Index              ← 保留
## Verification Commands            ← 保留
## Contributing                     ← 新增占位
## License                          ← 保留
```

### 4.3 重排理由

| 变化 | 理由 |
|------|------|
| **Quick Start 上移至第 6 位** | 参考三个仓均将 Quick Start 放在"为什么"之后、详情之前。用户看到价值主张就想试，不该翻 2 屏才看到安装命令 |
| **新增 "At a Glance" 总览表** | Open Design 的表格式总览一表见全貌。Nexus 可用 `| 能力 | 描述 |` 表格替代纯文本列表 |
| **Architecture 上移至第 5 位** | 架构图是最高效的认知对齐工具。放在 Use Cases 之后、Quick Start 之前，用户看完架构就知道"这是我要的东西" |
| **Core Capabilities 拆为 Highlights + Deep Dive** | Highlights 只留 4 个 emoji 标签（参考 Refly），Deep Dive 保留 7 个子节详细展开。避免首屏信息过载 |
| **Who Is This For → Use Cases** | "Use Cases" 比 "Who Is This For" 更行动导向，且用表格 + 场景描述更直观（参考 Refly 的 "I want to..." 表格） |
| **新增 Contributing 占位** | 三个参考仓均有 Contributing 节，Nexus 作为开源产品应预留此节 |

---

## 五、验收标准逐项对照

| # | 验收标准 | 状态 | 产物位置 |
|---|----------|------|----------|
| AC-1 | 分析参考仓 README 的可借鉴结构：居中品牌区、语言切换、badge/feature chips、hero 叙事、visual separation、quickstart 节奏；不得复制素材/品牌语言 | ✅ 通过 | 第一节（三仓逐项分析）+ 第二节（共性模式总结表） |
| AC-2 | 输出 Nexus README 第一屏方案：logo+产品名居中、English \| 简体中文 \| 繁體中文、优势型 tagline、产品特色标签、CTA/docs links、Hero 位置 | ✅ 通过 | 第三节（结构蓝图 + Markdown 草稿 + 方案说明表） |
| AC-3 | 提出 README 章节重排：Hero/优势标签/产品价值/特色/架构图/使用场景/Quickstart/Docs links/Security/Contributing | ✅ 通过 | 第四节（重排方案 + 重排理由） |

---

## 六、给下游的说明

### 给 Long (Coder Agent)
- Hero 图片：需要准备 `docs/assets/nexus-hero-dark.svg`（暗色主题版本）。当前只有 `nexus-hero.png`，建议补充 SVG 版本
- Badge 中的"License: Private"需确认是否反映实际授权策略
- 第一屏 Markdown 草稿中的 `<picture>` 标签需要 dark 版 SVG，若无则退化为单图 `<img>`

### 给 Designer (如需)
- 第一屏 Hero 区域建议做暗色/亮色双版本 SVG logo（参考 Scrapling 方案）
- 特性标签 chips 的排版建议在 GitHub 预览确认居中对齐效果

---

*Document generated by Ikki (Content Agent) · 2026-05-10*
