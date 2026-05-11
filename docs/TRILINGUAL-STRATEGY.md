# Nexus Dispatch 三语文档映射与语言切换策略

> **文档版本**: v1.0
> **创建日期**: 2026-05-10
> **负责人**: Ikki (Content Agent)
> **任务ID**: nexus-v8-r16-t1-docs-language-map-and-file-strategy

---

## 一、现状盘点

### 1.1 现有文档清单

| 文件 | 位置 | 当前语言 | 状态 |
| --- | --- | --- | --- |
| `README.md` | 项目根目录 | English | ✅ 完整 (294 行) |
| `README.zh-CN.md` | 项目根目录 | 简体中文 | ✅ 完整 (293 行)，已同步翻译 |
| `README.zh-TW.md` | 项目根目录 | 繁體中文 | ⚠️ 占位入口 (58 行)，明确标注「翻譯規劃中」 |
| `docs/install.md` | docs/ | English | ✅ 完整 (438 行)，含 12 个章节 |
| `docs/guides/` | docs/guides/ | — | ❌ 空目录，无任何文件 |
| 内部 proof/contract 文档 | `/root/.hermes/projects/nexus-dispatch/docs/proofs/` | 中英混合 | 🔒 不属于 public repo；禁止回写到 `docs/v8/` |
| `docs/assets/` | docs/assets/ | 视觉资源 | ✅ 无需翻译 |

### 1.2 现有语言切换状态

- **README.md**: 顶部已有 `简体中文 · 繁體中文` 链接 ✅
- **README.zh-CN.md**: 顶部已有 `English · 繁體中文` 链接 ✅
- **README.zh-TW.md**: 顶部已有 `English · 简体中文` 链接 ✅
- **docs/install.md**: ❌ 无语言切换条

### 1.3 关键发现

1. README 三语入口已建立，但 zh-TW 版本仅为占位页
2. `docs/install.md` 是唯一面向用户的指南文档，目前仅英文
3. `docs/guides/` 目录已创建但为空——等待后续教程填充
4. 内部开发 proof/contract 文档按治理法则归研发流程管理，不属于用户文档；统一存放在 `/root/.hermes/projects/nexus-dispatch/docs/proofs/`，禁止回写到 public repo 的 `docs/v8/`、`tmp/guide-proof/` 或 `docs/assets/cliproxy-test/`

---

## 二、文件命名策略

### 2.1 核心规则

```
{filename}.{lang}.md
```

| 语言代码 | 语言 | 示例 |
| --- | --- | --- |
| *(无后缀)* | English (默认) | `install.md` |
| `.zh-CN` | 简体中文 | `install.zh-CN.md` |
| `.zh-TW` | 繁體中文 | `install.zh-TW.md` |

### 2.2 设计原则

1. **English 为默认语言**: 无后缀的文件始终是英文版，这是 GitHub/开源社区的通用惯例
2. **后缀夹在文件名与扩展名之间**: `install.zh-CN.md` 而非 `install.md.zh-CN`
3. **同目录共存**: 三语文件放在同一目录下，不用子目录隔离（避免路径分裂和 404）
4. **链接使用相对路径**: 文档间互链一律使用相对路径，确保在任何部署环境下均可点击
5. **README 特殊处理**: 根目录 README 遵循 GitHub 惯例 `README.md` / `README.zh-CN.md` / `README.zh-TW.md`

### 2.3 目录结构终态

```
Nexus-Dispatch/
├── README.md                    # English (默认)
├── README.zh-CN.md              # 简体中文
├── README.zh-TW.md              # 繁體中文
├── docs/
│   ├── install.md               # English
│   ├── install.zh-CN.md         # 简体中文
│   ├── install.zh-TW.md         # 繁體中文
│   ├── guides/                  # (未来) 用户教程
│   │   ├── quick-start.md       # English
│   │   ├── quick-start.zh-CN.md # 简体中文
│   │   ├── quick-start.zh-TW.md # 繁體中文
│   │   ├── worker-integration.md
│   │   ├── worker-integration.zh-CN.md
│   │   └── worker-integration.zh-TW.md
│   └── assets/                  # 视觉资源 (不翻译)
# Internal proof docs live outside this public repo:
# /root/.hermes/projects/nexus-dispatch/docs/proofs/
```

---

## 三、语言切换条设计

### 3.1 标准模板 (适用于所有用户文档)

每个用户文档的**第一行**必须放置语言切换条：

```markdown
[English](./install.md) · [简体中文](./install.zh-CN.md) · [繁體中文](./install.zh-TW.md)

---
```

### 3.2 当前语言高亮规则

- 当前语言的链接**不加粗、不使用 code 格式**
- 非当前语言保持正常链接样式
- 三者使用中点 `·` 分隔，前后各一个空格

### 3.3 具体嵌入示例

**`docs/install.md` (English 版) 顶部**:
```markdown
[English](./install.md) · [简体中文](./install.zh-CN.md) · [繁體中文](./install.zh-TW.md)

---

# Installation & Deployment Guide
```

**`docs/install.zh-CN.md` (简体中文版) 顶部**:
```markdown
[English](./install.md) · [简体中文](./install.zh-CN.md) · [繁體中文](./install.zh-TW.md)

---

# 安装与部署指南
```

**`docs/install.zh-TW.md` (繁體中文版) 顶部**:
```markdown
[English](./install.md) · [简体中文](./install.zh-CN.md) · [繁體中文](./install.zh-TW.md)

---

# 安裝與部署指南
```

### 3.4 README 语言入口 (保持现有设计)

README 使用 `<div align="center">` 居中布局，保持与当前一致：

```html
<div align="center">
  <img src="./docs/assets/nexus-hero.svg" alt="Nexus Dispatch" width="720" />
  <h1>Nexus Dispatch</h1>
  <p><strong>One brain. Many hands. Zero trust.</strong></p>
  <p>
    <a href="./README.zh-CN.md">简体中文</a> ·
    <a href="./README.zh-TW.md">繁體中文</a>
  </p>
</div>
```

> README 的语言切换设计已经到位且有效，**不需要改动**。后续只需将 `README.zh-TW.md` 从占位页补全为完整翻译即可。

---

## 四、三语化文档清单与优先级

### 4.1 需要三语化的文档

| # | 文档 | 当前状态 | 优先级 | 操作 | 预估工作量 |
| --- | --- | --- | --- | --- | --- |
| 1 | `docs/install.md` | 仅英文 (438 行) | **P0 — 紧急** | 新建 `install.zh-CN.md` + `install.zh-TW.md`；英文版加语言切换条 | 高 (438 行 × 2 语言) |
| 2 | `README.zh-TW.md` | 占位页 (58 行) | **P0 — 紧急** | 从 `README.md` 完整翻译为繁體中文 | 高 (294 行) |
| 3 | `docs/guides/quick-start.md` | 不存在 | **P1 — 高** | 新建三语版本（从 install.md 提取 Quick Start 部分，或独立撰写） | 中 |

### 4.2 不需要三语化的文档

| 文档 | 原因 |
| --- | --- |
| 内部 proof/contract/spec 文档 | 属于研发流程产物，按治理法则归 PM/Daemon 管理，不对最终用户暴露；统一存放到 `/root/.hermes/projects/nexus-dispatch/docs/proofs/`，不得回写 public repo 的 `docs/v8/` |
| `docs/assets/*` | 视觉资源文件 (SVG/PNG)，无文本内容需要翻译 |
| `README.md` | 英文版已完整，无需修改 |
| `README.zh-CN.md` | 简体中文版已完整，无需修改 |

### 4.3 未来扩展预留

以下文档目前在 `docs/guides/` 目录下尚不存在，但按项目路线图**将在后续 Round 中创建**。创建时必须同步产出三语版本：

| 规划文档 | 说明 | 创建时机 |
| --- | --- | --- |
| `docs/guides/worker-integration.md` | Worker 接入教程 | R17+ |
| `docs/guides/telegram-setup.md` | Telegram Bot 配置教程 | R17+ |
| `docs/guides/blueprint-guide.md` | 蓝图与阶段管理教程 | R18+ |
| `docs/guides/faq.md` | 常见问题 | R18+ |
| `docs/guides/troubleshooting.md` | 故障排除 (可能从 install.md §11 拆分) | R18+ |

---

## 五、本地化规范 (Localization Rules)

### 5.1 红线：禁止机器直译

- ❌ **绝对禁止**将英文文档直接丢进翻译工具，然后复制粘贴产出
- ✅ **必须**由母语者或具备母语级能力的人工/AI Agent 审校后才能提交
- ✅ 允许使用 AI 辅助翻译初稿，但**必须经过人工审校**，确保术语准确、语气自然

### 5.2 术语一致性 (Terminology Consistency)

#### 核心术语表 — 三语对照

| English | 简体中文 | 繁體中文 | 备注 |
| --- | --- | --- | --- |
| Task | 任务 | 任務 | — |
| Run | 运行 | 執行 | Run 作为名词指一次执行实例 |
| Agent / Worker | Agent / Worker | Agent / Worker | **不翻译**，保持英文原文 |
| Daemon | Daemon | Daemon | **不翻译**，指 PM Daemon |
| Dispatch | 派单 | 派單 | — |
| Lane | 泳道 | 泳道 | — |
| Blueprint | 蓝图 | 藍圖 | — |
| Phase | 阶段 | 階段 | — |
| Proof | 证明 / 验收凭证 | 證明 / 驗收憑證 | 根据上下文选用 |
| Artifact | 交付物 | 交付物 | — |
| Review | 审核 | 審核 | — |
| Review Policy | 审核策略 | 審核策略 | — |
| State Machine | 状态机 | 狀態機 | — |
| DAG | DAG | DAG | **不翻译**，保留缩写 |
| Runtime API | Runtime API | Runtime API | **不翻译** |
| SSoT | SSoT | SSoT | **不翻译** (Single Source of Truth) |
| Bearer Token | Bearer Token | Bearer Token | **不翻译** |
| Cron | Cron | Cron | **不翻译** |
| WebUI | WebUI | WebUI | **不翻译** |
| SQLite | SQLite | SQLite | **不翻译** |
| Prisma | Prisma | Prisma | **不翻译** |
| Telegram | Telegram | Telegram | **不翻译** |
| Docker Compose | Docker Compose | Docker Compose | **不翻译** |
| systemd | systemd | systemd | **不翻译** |
| Endpoint | 端点 | 端點 | — |
| Smoke Test | 冒烟测试 | 冒煙測試 | — |

### 5.3 技术命令保持一致

- **所有代码块、命令行、API 路径**在三语版本中**完全一致**，不做任何翻译
- **配置参数名** (`API_AUTH_TOKEN`, `TICK_INTERVAL` 等) 保持英文原文
- **文件路径** (`/opt/projects/nexus-dispatch`, `./docs/install.md`) 保持英文原文

### 5.4 说明文本本地化原则

| 翻译内容 | 规则 |
| --- | --- |
| 章节标题 | 翻译为目标语言，保留语义清晰 |
| 段落说明 | 按目标语言习惯重写，不逐字对应 |
| 表格说明列 | 翻译为目标语言 |
| 代码注释 | 翻译为目标语言 |
| 警告/提示框 | 翻译为目标语言 |
| 代码/命令 | **不翻译**，原样保留 |
| 文件路径 | **不翻译**，原样保留 |
| 产品名 (Nexus Dispatch) | **不翻译**，原样保留 |
| 技术术语 (见术语表) | 按术语表处理 |

### 5.5 繁體中文特别说明

- 繁體中文版本面向**繁體中文使用者**（台湾、香港、澳门等地区）
- 必须使用**繁體中文字符**，不是简体中文的字体转换
- 用语习惯应倾向**港澳台地区**的表达方式，例如：
  - 「伺服器」而非「服务器」
  - 「資料庫」而非「数据库」
  - 「網路」而非「网络」
  - 「程式」而非「程序」
  - 「部署」可通用
- 但技术术语按 5.2 术语表处理（不翻译的保持原文）

---

## 六、防 404 策略

### 6.1 链接一致性检查

每次新建/删除三语文档时，必须同时检查：

1. **同组三语文件的互链**: 每个文件顶部的语言切换条链接必须指向**实际存在的同级文件**
2. **README 的 Documentation Index**: 必须同步更新文档索引表
3. **install.md 内的相对链接**: 如 `../README.md` 等，翻译版中保持路径一致

### 6.2 新建文件 Checklist

```
[ ] 创建 {name}.md (English)
[ ] 创建 {name}.zh-CN.md (简体中文)
[ ] 创建 {name}.zh-TW.md (繁體中文)
[ ] 三个文件顶部均包含语言切换条
[ ] 语言切换条链接指向正确的相对路径
[ ] README.md 的 Documentation Index 已更新
[ ] README.zh-CN.md 的文档索引已更新
[ ] README.zh-TW.md 的文檔索引已更新
```

---

## 七、执行计划

### Phase 1 (本轮 R16 立即执行)

| 序号 | 操作 | 交付物 |
| --- | --- | --- |
| 1 | 本策略文档 (TRILINGUAL-STRATEGY.md) | ✅ 已完成 |
| 2 | 给 `docs/install.md` 顶部加语言切换条 | 需 Long 执行 |
| 3 | 新建 `docs/install.zh-CN.md` | 需 Ikki 执行 |
| 4 | 新建 `docs/install.zh-TW.md` | 需 Ikki 执行 |
| 5 | 补全 `README.zh-TW.md` 为完整翻译 | 需 Ikki 执行 |
| 6 | 更新 README 三语的 Documentation Index | 需 Ikki 执行 |

### Phase 2 (后续 Round)

- 创建 `docs/guides/quick-start.md` 三语版本
- 创建 `docs/guides/worker-integration.md` 三语版本
- 根据用户反馈补充 FAQ、Troubleshooting 等教程文档

---

## 八、验证标准

| # | 验证项 | 验证方法 |
| --- | --- | --- |
| AC-1 | 安装文档支持三语 | `docs/install.md` + `docs/install.zh-CN.md` + `docs/install.zh-TW.md` 三个文件均存在且内容完整 |
| AC-2 | 文件命名遵循 `{name}.{lang}.md` 规则 | 文件名与本文档规定的路径映射一致 |
| AC-3 | 每个文档顶部有语言切换条 | 打开任一文件，首行可见 `English · 简体中文 · 繁體中文` 链接 |
| AC-4 | 语言切换条链接无 404 | 点击每个链接均跳转到目标文件，无 404 |
| AC-5 | README 语言入口一致 | 三个 README 文件的语言切换互相指向正确 |
| AC-6 | 技术术语不翻译 | 术语表中的 "不翻译" 项在三语版本中保持英文原文 |
| AC-7 | 技术命令保持一致 | 代码块、API 路径、配置参数名在三语版本中完全一致 |
| AC-8 | 无机器直译痕迹 | 繁體中文使用地道繁体表达（伺服器、資料庫等），非简体自动转换 |
