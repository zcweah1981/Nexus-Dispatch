<div align="center">
  <img src="./docs/assets/nexus-logo.png" alt="Nexus Dispatch logo" width="140" />
  <br />
  <img src="./docs/assets/nexus-hero.png" alt="Nexus Dispatch — 多 Agent 团队的任务控制中心：一个 PM 大脑中枢统一调度、追踪和验证" width="720" />
  <h1>Nexus Dispatch</h1>
  <p><strong>统一调度 · 证据闭环 · 结果可验证</strong></p>
  <p>
    <a href="./README.md">English</a> ·
    <a href="./README.zh-CN.md">简体中文</a> ·
    <a href="./README.zh-TW.md">繁體中文</a>
  </p>
</div>

<p align="center">
  <img src="https://img.shields.io/badge/Brain-PM_Brain-orange" alt="PM Brain" />
  <img src="https://img.shields.io/badge/Tasks-Long--running_Unattended-9cf" alt="Long-running Tasks" />
  <img src="https://img.shields.io/badge/Fleet-Multi--Agent-purple" alt="Multi-Agent Fleet" />
  <img src="https://img.shields.io/badge/Delivery-Proof--based-brightgreen" alt="Proof-based Delivery" />
  <img src="https://img.shields.io/badge/Visibility-Telegram_+_WebUI-teal" alt="Telegram + WebUI" />
  <img src="https://img.shields.io/badge/Runtime-API_Control_Plane-blue" alt="API Control Plane" />
  <img src="https://img.shields.io/badge/Workflow-Unattended-success" alt="Unattended Workflow" />
  <img src="https://img.shields.io/badge/Deploy-Docker_·_systemd-informational" alt="Docker/systemd Ready" />
  <img src="https://img.shields.io/badge/License-MIT-blue" alt="License: MIT" />
</p>

---

> **一个 PM 大脑中枢，协调你的整个 AI Agent 编队——派单、追踪、验证，全程无人值守。**
>
> Nexus Dispatch 是多 Agent 团队一直缺少的任务控制中心。它用一个 PM 大脑中枢来协调异构 AI Agent，基于 API-first、状态机驱动的运行时，配合证据闭环的交付门控——确保正确的工作到达正确的 Agent，带着可验证的证据完成，全程保持有序推进。不依赖聊天上下文，不丢失任务状态。

---

## ✨ 为什么选择 Nexus Dispatch？

你有 Codex、Claude、Hermes、OpenClaw 或自建 Worker——但没有人统一指挥。任务在缝隙中丢失，完成状态未经确认，聊天频道淹没在噪音里。

Nexus Dispatch 给你一个**永不打烊的 PM 大脑中枢**：

| ✅ 你能得到什么 | ⚙️ 实现方式 |
| --- | --- |
| 🧠 **统一调度** | PM 大脑中枢评估优先级、解析 DAG 依赖、按泳道路由到最合适的 Agent。 |
| 🔁 **长任务不断线** | 发射后不管的任务链，即使跨小时或跨天也能持续推进——自动重试、状态自动恢复。 |
| 🛡️ **证据闭环** | Worker 提交结构化交付物（Git SHA、文件哈希、截图）。证据通过验证门控，才算"已完成"。 |
| 🤖 **多 Agent 协作** | 按泳道和并发数注册异构 Worker。Daemon 统一派发、统一回收，所有交互走同一 API 边界。 |
| 📱 **执行过程可追踪** | 每个 Agent 通过自己的 bot 发通知。WebUI 仪表盘实时流式展示任务状态、DAG 进度和交付物画廊。 |
| 🔌 **单一真相源** | 每次状态流转走 REST。没有共享数据库，没有 SSH 隧道，Agent 无法直连 DB。 |
| 🐳 **分钟级部署** | 单台 VPS，Docker Compose 或裸机。一个 SQLite 文件。零外部数据库依赖。 |

---

## 🏷️ 产品亮点

```
🧠 PM 大脑中枢         ·  DAG 优先级派单与依赖解析
⏳ 长任务不断线         ·  跨小时/跨天的工作流链，无人值守持续推进
🤖 多 Agent 协作        ·  异构 Worker 按泳道路由，并发控制
🛡️ 证据闭环            ·  每个完成门控必须提交结构化交付物
📱 Telegram + WebUI    ·  独立 Agent bot 通知 + 实时 SSE 仪表盘
🔌 API 控制平面        ·  纯 REST 状态机，Bearer Token 认证，无直连数据库
🔄 无人值守推进        ·  发射后不管，自动重试，阻塞状态自动恢复
🐳 Docker/systemd     ·  单台 VPS，一个 SQLite 文件，零外部依赖
```

---

## 👥 适合谁？

| 角色 | 使用场景 |
| --- | --- |
| **AI Agent 团队** | 按泳道路由和并发控制，向编码、设计、内容、审核 Agent 派发任务。 |
| **技术负责人** | 通过 WebUI + SSE 监控任务全生命周期——从派发到审核到交付物验收。 |
| **多 Agent 个人开发者** | 运行轻量 PM 大脑中枢，让多 Agent 工作流保持有序，无需从零搭建编排系统。 |
| **运维 & 平台团队** | 单台 VPS 上用 Docker Compose 或 systemd 部署。SQLite 单一真相源，无需外部数据库。 |

---

## 🖼️ 工作流全景

*任务如何从创建到交付验证，在 Nexus Dispatch 中流转。PM 大脑中枢统一调度多 Agent，每个完成门控都要求可验证的结构化证据。*

![Nexus Dispatch 工作流全景 — 长任务不断线、多 Agent 调度、证据闭环、全程可观察](./docs/assets/nexus-product-flow.png)

> 💡 **核心优势**：任务发射后无人值守运行。PM 大脑中枢自动解析 DAG 依赖、按泳道派发到最合适的 Agent，并在每个完成门控验证结构化交付物——不需要人工盯盘。

**图中模块说明：**

| 模块 | 作用 |
| --- | --- |
| 🧠 PM 大脑中枢 | 评估优先级、解析 DAG 依赖、决定派发时机与目标 Agent |
| 📋 任务池 | 所有待办任务按状态机管理，等待调度或审核 |
| 🤖 Worker Agent | 接收派单、执行任务、回传结构化证据 |
| 🛡️ 审核门控 | 根据策略自动验证交付物，或提交人工审核 |
| 📱 通知层 | 每个 Agent 用自己的 bot 发送通知，不泄露内部 ID |

1. **PM 创建任务**，指定泳道、依赖和审核策略。
2. **PM 大脑中枢派发**到对应的专业 Worker。
3. **Worker 执行并回传证据**——run、交付物和完成负载通过同一 API 边界回传。
4. **审核门控裁决**——根据策略和证据质量决定通过或打回。高风险任务需要人工审核；常规任务在机器验证交付物后自动推进。
5. **Telegram + WebUI 展示结果**——以人类可读的形式呈现，不暴露内部 ID 或敏感信息。

---

## 🏗️ 架构

*单一大脑中枢、多个哑终端、API-only 数据流。通过 Telegram 和 WebUI 实现全程可观察。*

![Nexus Dispatch 架构 — PM 大脑中枢统一调度、多 Agent 协作、API 控制平面、证据闭环](./docs/assets/nexus-architecture.png)

> 💡 **核心优势**：一个大脑，多双手。PM 大脑中枢掌握所有调度逻辑；Worker 是无状态执行器。每次状态流转都经过 REST API，形成完整审计链——全程可观察、全程可验证。

**架构分层说明：**

| 层级 | 组件 | 职责 |
| --- | --- | --- |
| 🧑 人类层 | Telegram（每 Agent 独立 bot）+ WebUI（只读 SSE） | 通知与可观测性，不暴露内部 ID |
| 🔌 API 控制平面 | Runtime API (Express :8000) | 所有状态流转的唯一入口，Bearer Token 认证 |
| 🧠 调度引擎 | PM Daemon（DAG 解析、优先级评估、审核门控） | 核心决策大脑，永不休息 |
| 🤖 执行终端 | Worker Agents（claim → run → 提交证据） | 哑执行，不自主决策 |
| 💾 数据层 | SQLite + Prisma DAL（仅 API 进程内部可见） | 单一真相源，外部无访问途径 |

```
┌─────────────────────────────────────────────────────────┐
│                     人类层                               │
│  Telegram (每 Agent 独立 bot)  ·  WebUI (只读 SSE)       │
└──────────┬──────────────────────────┬───────────────────┘
           │ 通知                      │ 可观测
           ▼                          ▼
┌─────────────────────────────────────────────────────────┐
│              Runtime API (Express :8000)                 │
│  ┌─────────┐ ┌──────────┐ ┌──────────┐ ┌────────────┐  │
│  │ Tasks   │ │ Runs     │ │ Reports  │ │ Blueprints │  │
│  │ Agents  │ │ Cronjobs │ │ Artifacts│ │ Review     │  │
│  └─────────┘ └──────────┘ └──────────┘ └────────────┘  │
│              Bearer Token Auth · /api/v1/runtime/*       │
└──────────┬──────────────────────────────────┬───────────┘
           │ Tick Loop                        │ 注册
           ▼                                  ▼
┌────────────────────┐            ┌───────────────────────┐
│  PM Daemon         │  派发      │  Worker Agents        │
│  · DAG 解析        │ ────────▶  │  · claim → run        │
│  · 优先级评估      │  ◀──────── │  · 提交证据           │
│  · 审核门控        │  交付物    │  · POST 结果          │
└────────────────────┘            └───────────────────────┘
           │
           ▼
┌────────────────────┐
│  SQLite (SSoT)     │  ← 仅 API 进程内部可见
│  Prisma DAL        │    外部无任何访问途径
└────────────────────┘
```

**核心不变量：** SQLite 仅在 API Server 进程内可见。Worker、Daemon 和 WebUI 绝不直接操作数据库——全部通过 Runtime API 访问。

---

## 🧼 真实使用截图

*真实产品使用场景——Telegram 派单消息 + WebUI 进度面板。联系人、运行时 ID 和凭据已脱敏。每个 Agent 通过自己的 bot 报告，不泄露内部 ID。*

![Nexus Dispatch 真实使用截图 — Telegram 通知与 WebUI 面板，全程可观察](./docs/assets/nexus-sanitized-usage-screenshot.png)

---

## ⚡ 核心能力

### 🔄 状态机驱动的任务生命周期

每个任务严格遵循有限状态机：`created → dispatched → running → completion_pending → review_pending → completed`，并包含 retry、blocked、dead_letter 和 cancelled 分支。没有捷径——任何 Agent 都不能跳过状态或自行标记完成。

### 🔗 DAG 依赖解析

任务声明依赖关系。PM 大脑中枢的 DAG 引擎执行拓扑排序并检测环路——循环依赖在派发前就被拦截，而不是挂起后才暴露。

### 🛡️ 动态审核与证据门控

任务携带 `review_policy`（`group_only`、`pm_audit` 等）。高风险任务需要审核人确认后才能解锁下游。常规任务在机器验证交付物后自动推进——保持流水线顺畅，不制造瓶颈。

### 📋 蓝图 & 阶段管理

冻结项目蓝图、解冻阶段、推进里程碑——全部通过 Runtime API 完成。蓝图 JSON Schema 在冻结时校验，确保每个阶段有明确范围。

### ⏰ Cron Registry 适配器隔离

`project_cronjobs` 是项目级注册表。调度适配器从 API 读取符合条件的 job 并管理外部执行。Daemon 绝不直接启停 cronjob——严格的关注点分离。

### 📨 Telegram 通知（每 Agent 独立 Bot）

每个 Agent 用自己的 bot token 发送通知。Daemon 只从 `AGENT_NOTIFICATIONS` 读取 `bot_token` 与 `chat_id`；可见正文语言来自项目级 Runtime setting `visible_language`（默认 `zh-CN`，支持 `en-US`）。无中心化 bot，凭据不泄露到群聊。

### 📊 WebUI 可观测性

轻量仪表盘读取 API 和 SSE 流。查看任务状态、DAG 阶段进度、交付物画廊和 run 历史——永远不写数据库。

---

## 🚀 快速开始

### 前置条件

- Node.js 18+
- Docker & Docker Compose（容器化部署）或裸机 VPS

### Docker Compose（推荐）

```bash
git clone https://github.com/zcweah1981/Nexus-Dispatch.git
cd Nexus-Dispatch
cp .env.example .env
# 编辑 .env — 设置 API_AUTH_TOKEN 和项目参数。绝不要提交 .env。

docker compose up -d --build

# 验证：无认证请求应返回 401
curl -i "http://localhost:8000/api/v1/runtime/tasks/pending?project_id=nexus-dispatch"

# 验证：已认证请求应返回 JSON
curl -sS \
  -H "Authorization: Bearer NEXUS_BEARER" \
  "http://localhost:8000/api/v1/runtime/tasks/pending?project_id=nexus-dispatch"
```

### 本地开发

```bash
npm install
cp .env.example .env
npx prisma generate
npx prisma migrate deploy
npm run build
npm start        # API server 运行在 :8000

# 另一个终端：
npm run daemon   # PM Daemon Tick Loop

# WebUI（可选）：
npm --prefix src/webui install
npm --prefix src/webui run dev
```

### 注册你的第一个 Worker

```bash
curl -sS -X POST \
  "http://localhost:8000/api/v1/runtime/projects/nexus-dispatch/agents" \
  -H "Authorization: Bearer NEXUS_BEARER" \
  -H "Content-Type: application/json" \
  -d '{
    "agent_id": "my-worker-1",
    "endpoint": "http://worker-host:8647/v1/runs",
    "lane": "DEV",
    "dialect": "openclaw",
    "max_concurrency": 1,
    "status": "online"
  }'
```

👉 **完整部署指南、systemd 配置和故障排查：** [docs/install.zh-CN.md](./docs/install.zh-CN.md)

---

## 🔐 安全边界

Nexus Dispatch 在凭据和数据周围执行严格边界：

- **仓库不含真实密钥。** README、docker-compose 和 systemd 示例均使用 `$VARIABLE` 占位符。从 `.env.example` 复制后在本地填写。
- **API-only 数据访问。** SQLite 仅在 API Server 内部可见。任何模块、Worker 或 UI 都不直接访问数据库。
- **每次请求 Bearer Token。** 所有 `/api/v1/*` 端点都需要 `Authorization: Bearer NEXUS_BEARER`；未认证请求会返回 `401`。
- **每 Agent 独立 Telegram Bot。** 每个 Agent 用自己的 bot token 发送通知。Daemon 从不使用共享 bot 或中心化 token。
- **聊天不含敏感 ID。** Task、Run、Dispatch 和 Trace ID 留在数据库和 Runtime Proof 中。群聊消息仅为人类可读的摘要。
- **公网端点必须 TLS。** API 暴露到 localhost 以外时，必须通过反向代理（Nginx、Caddy、Cloudflare Tunnel）强制 HTTPS。

---

## 📁 项目结构

```
Nexus-Dispatch/
├── src/
│   ├── api/           # Express Server，V8 Runtime API 路由
│   ├── daemon/        # PM Daemon Tick Loop
│   ├── dal/           # Prisma 数据访问层
│   └── webui/         # WebUI 仪表盘 (React/Vite)
├── prisma/            # Schema 和迁移
├── tests/             # 单元 + 集成测试 (Vitest)
├── scripts/           # health-check.sh，systemd 服务单元
├── docs/
│   ├── install.md     # 完整安装与部署指南（英文）
│   ├── install.zh-CN.md  # 简体中文部署导览
│   ├── install.zh-TW.md  # 繁體中文部署導覽
│   ├── assets/        # Hero 图和架构图 (SVG + PNG)
│   └── v8/            # Runtime Proof 文档和 API 契约
├── docker-compose.yml
├── .env.example
└── README.md          # 英文主文档
```

---

## 📚 文档导航

| 文档 | 说明 |
| --- | --- |
| [docs/install.md](./docs/install.md) | 英文完整部署指南：Docker Compose、systemd、冒烟测试、故障排查 |
| [docs/install.zh-CN.md](./docs/install.zh-CN.md) | 简体中文部署导览：三语素材说明、架构/部署配图、导航 |
| [docs/install.zh-TW.md](./docs/install.zh-TW.md) | 繁體中文部署導覽：三語素材說明、架構/部署配圖、導航 |
| [docs/TRILINGUAL-STRATEGY.md](./docs/TRILINGUAL-STRATEGY.md) | 三语文档策略、命名规范与本地化规则 |
| [docs/v8/](./docs/v8/) | Runtime Proof 文档、API 契约、Schema 规范 |
| [docs/assets/](./docs/assets/) | 产品视觉资产：logo、Hero、工作流全景、架构图、使用截图 |
| [docs/assets/guide/](./docs/assets/guide/) | 使用说明配图：部署流程、Hermes/OpenClaw 接入、Proof 渲染图 |
| [README.md](./README.md) | English README |
| [README.zh-TW.md](./README.zh-TW.md) | 繁體中文版 README |

---

## ✅ 验证命令

```bash
npm run build                                    # 编译 TypeScript
npx prisma validate                              # 校验 Schema
npm test -- --runInBand                          # 运行测试套件
npm --prefix src/webui run build                 # 构建 WebUI
git diff --check                                 # 检查空白问题
npm run validate:api-deploy -- --skip-health     # Prisma + V8 部署检查
./scripts/health-check.sh --quick || true        # 部署健康检查（开发环境 warning 正常）
```

---

## 📄 许可证

本项目基于 [MIT 许可证](./LICENSE) 开源。

Copyright (c) 2026 Nexus Dispatch contributors
