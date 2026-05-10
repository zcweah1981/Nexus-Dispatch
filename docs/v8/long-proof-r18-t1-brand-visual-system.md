# R18-T1 Unified Brand Visual System & Palette Spec

## 任务
- Task ID: `nexus-v8-r18-t1-brand-visual-system`
- Scope: 在继续 README 图片重生成前，先固化 Nexus Dispatch 的统一视觉系统、主色板、图像问题清单与 cliproxy 统一 prompt 模板，作为后续 Hero / Flow / Screenshot 重做的唯一设计基线。
- Acceptance mode: `group_only`

---

## 页面/模块
### 1. README 顶部品牌区
- 资产：`docs/assets/nexus-logo.png` + `docs/assets/nexus-hero.png`
- 目标：建立单一品牌首屏，不再出现 logo 与 hero 各讲各话的情况。

### 2. README 流程说明图区
- 资产：`docs/assets/nexus-product-flow.png`、`docs/assets/nexus-usage-flow.png`
- 目标：统一为同一套色板、同一套光效、同一套图形语言；后续保留一主一辅，不再混出两种产品气质。

### 3. README 使用截图区
- 资产：`docs/assets/nexus-sanitized-usage-screenshot.png`
- 目标：将“真实使用截图”与“示意图”边界说清楚；未经真实截图脱敏，不得冒充产品实拍。

### 4. 后续 cliproxy 生成工作流
- 资产范围：Logo / Hero / Product Flow / Usage Flow / Sanitized Screenshot replacement
- 目标：所有后续生成均复用统一 prompt 模板，不得再各图单独发散。

---

## 目标
1. 固化一个可执行、可复用的 Nexus Dispatch 视觉母版系统。
2. 在 README 全部图片之间建立统一的品牌识别：背景、色彩、光效、层次、图形密度、语言风格一致。
3. 明确当前三类图片问题，防止继续在错误基线上增量修图。
4. 为后续 cliproxy 重生成提供统一 prompt 模板，避免再次出现“每张图一个风格”。

---

## 用户
- GitHub README 首次访问者
- 需要 3 秒内理解产品价值的技术负责人 / AI Agent 团队
- 后续负责出图的 Designer / Coder / 内容协作 Agent

---

## 结构
1. 当前资产盘点
2. 统一视觉系统
3. Palette 固化
4. README 全图视觉规范
5. 三类问题判定
6. cliproxy 统一 prompt 模板
7. 后续执行规则

---

## 关键区块

### A. 当前资产盘点（已验证）
| Asset | Path | Size | SHA256 | 当前角色 |
| --- | --- | --- | --- | --- |
| Logo | `docs/assets/nexus-logo.png` | 1024×1024 | `21e96ea0c3cdecc3ab95f420a4fc4101d9c7b85303539d49c1ac5360ad3cb3e2` | 品牌符号 |
| Hero | `docs/assets/nexus-hero.png` | 1600×900 | `b1235fac5f62fa2b93a942e617865b553dc9af91318a568c1fa65927a32b2b3a` | README 首屏 Hero |
| Product Flow | `docs/assets/nexus-product-flow.png` | 1600×900 | `ec0b5bd4f757b2ba9fa3b3d3ed4257a26bd3775da827fdc93bb7d65d27f9c678` | 英文 README 流程图 |
| Usage Flow | `docs/assets/nexus-usage-flow.png` | 1600×900 | `6b71246a785b4ead27305fc55a6ec37a2f5adc920d7dec2eb7a86bfc0101f068` | 中文 README 流程图 |
| Architecture | `docs/assets/nexus-architecture.png` | 1600×1000 | `15b9a1a1cd5fcabb8e1e25c1b28731f6887da376cf2abb7466fb296fc094a8cb` | 系统结构图 |
| Sanitized Usage Screenshot | `docs/assets/nexus-sanitized-usage-screenshot.png` | 1600×980 | `02b0008245566ab1c6e8b5393ebe69b113fa22d6b6853a5a4afd80d6236f77d0` | README 使用展示 |

### B. 统一主色板（Frozen Palette v1)
> 本任务决定：后续 README 所有新图与重做图，统一使用 **Dark Navy + Electric Cyan + Violet + Warm Orange** 系统，不再允许独立漂移。

| 角色 | 色值 | 用途 | 说明 |
| --- | --- | --- | --- |
| Base / 背景主色 | `#07111F` | 全部 README 图片主背景 | 产品底色，代表 control plane / night operations / trust boundary |
| Surface / 二级背景 | `#0F1B2D` | 卡片底、面板层 | 用于 UI 面板与结构层次，避免纯黑死板 |
| Surface Elevated / 高层面板 | `#16263D` | 弹层、重点面板、边界区 | 与主背景拉出信息层级 |
| Primary Glow / 主发光色 | `#21D4FD` | 主流向线、PM 控制中枢、链接路径 | 所有“主路径”统一用该色，不换蓝绿混搭 |
| Secondary Accent / 辅助品牌色 | `#7C3AED` | Agent 节点、次级能量圈、品牌辅助渐变 | 用于“多 Agent / intelligence / orchestration”表达 |
| Warm Accent / 强调色 | `#F97316` | 审核门控、告警、关键 CTA 焦点 | 只做 5–8% 小面积强调，禁止大面积铺色 |
| Positive Support | `#22C55E` | 通过态、健康态、小型状态灯 | 只用于功能状态，不参与主品牌叙事 |
| Text Primary | `#E5F0FF` | 图内高对比主文字 | 若必须有文字，统一高亮文本色 |
| Text Secondary | `#9FB3C8` | 次要说明 | 控制信息层级 |
| Divider / Grid | `#22324A` | 网格线、边界线、次级连接线 | 低存在感辅助结构 |

### C. 推荐渐变规则
1. **主品牌渐变**：`#21D4FD -> #7C3AED`
2. **中心能量核渐变**：`#21D4FD -> #7C3AED -> #F97316`（仅中心 1 处可用）
3. **禁止**：大面积绿色、偏红紫霓虹、金色主视觉、暖黄大背景、杂色 rainbow UI

### D. 统一视觉语法
| 维度 | 统一规则 |
| --- | --- |
| 背景 | 深海军蓝 / midnight control room，不用纯黑，也不用泛灰办公底 |
| 光效 | 主光来自中枢控制核；辅光来自 agent 节点与流向线；整体偏冷，局部暖色点题 |
| 图形语言 | 控制平面、轨道、节点、数据流、门控、卡片、界面面板；避免插画化人物、卡通 mascot |
| 质感 | Premium SaaS / infra editorial / cinematic UI；不是游戏海报，不是炫技赛博朋克海报 |
| 线条 | 细线高精度、发光边缘克制；禁止过多杂乱高亮线导致不可扫读 |
| 图形密度 | 中密度；中心强、边缘弱；必须留阅读呼吸区 |
| 文字策略 | 图内默认“少字或无字”；若必须有文字，以符号级标签为主，避免完整英文句子 |
| README 语境 | 中文 README 优先，图内不得依赖大量英文标签才能理解 |

---

## 内容层级

### 1. README 全部图片统一视觉规范

#### 1.1 背景规范
- 所有 README 主图统一使用 `#07111F` 为视觉底座。
- 卡片、面板、容器统一从 `#0F1B2D` / `#16263D` 派生。
- 禁止某张图偏棕、某张图偏灰、某张图偏青绿的孤岛式底色。

#### 1.2 光效规范
- 主光：`#21D4FD`
- 辅光：`#7C3AED`
- 强调热区：`#F97316`
- 暖色只允许出现在：review gate、warning pulse、CTA 焦点、中心能量核微热点。
- 禁止把暖橙用成整张图第二主色。

#### 1.3 主色 / 辅色 / 强调色关系
- 主色：`#21D4FD`
- 辅色：`#7C3AED`
- 强调色：`#F97316`
- 关系比例建议：**70% 深色底 + 20% 冷色光效 + 10% 暖色点题以内**

#### 1.4 字体语言规范
- 图内默认：无长文案。
- 如果需要标签：优先图标化、短词化、符号化，不超过 1–2 个词。
- 中文 README 场景：禁止在 Hero 内堆大量英文功能标签，因为中文用户会先读 README 正文而不是图内英文。
- 真正需要解释的信息，应留在 README 正文、caption、列表中，而不是塞进图片。

#### 1.5 图形密度规范
- Hero：中低密度，强调品牌气场与主视觉聚焦。
- Flow 图：中密度，强调扫读路径与阶段结构。
- Architecture：中高密度，但要保持结构秩序，不可变成发光迷宫。
- Screenshot：低修饰密度，优先真实感与可信度。

#### 1.6 Logo 与 Hero 关系
- Logo 是“品牌徽记”，Hero 是“世界观场景”。
- 二者必须共享同一色板与发光逻辑：同底色、同 cyan/violet 主光、同 warm orange 节点强调。
- Hero 中若出现中心控制核，其形态应与 logo 的几何语言相关，但**不是**直接把 logo 粘贴进画面中央。
- Logo 应该像 Hero 世界观中的“抽象信号源”，而不是另一套无关图标。

---

## 明确问题判定（本任务核心输出）

### 图一问题：当前 logo / Hero 不过关
**涉及资产**
- `docs/assets/nexus-logo.png`
- `docs/assets/nexus-hero.png`

**问题判定**
1. 顶部品牌首屏虽然同时有 logo 与 hero，但二者的叙事关系还不够紧，更多像“两个相近风格的独立资产”，还不是一套严格的品牌系统。
2. Hero 的表达依赖较多英文 UI 式标签/英文信息碎片会更合理地服务英文 README，但对中文 README 不友好。
3. 中文 README 的首屏核心任务是“3 秒看懂价值”，不是“先在图里读英文术语”。

**修正要求**
- Hero 重做时必须压缩图内英文标签数量，优先无字 / 极少字方案。
- Hero 要强化“单 PM 中枢 + 多 Agent 编队 + proof gate + observability”四个核心概念，但用场景关系表达，不靠词云表达。
- Logo 与 Hero 共用同一中心几何语言与冷光体系。

### 图二问题：两个流程图颜色体系不统一
**涉及资产**
- `docs/assets/nexus-product-flow.png`
- `docs/assets/nexus-usage-flow.png`

**问题判定**
1. 英文 README 用 `product-flow`，中文 README 用 `usage-flow`，形成两套流程图并行。
2. 当前量化采样显示：`product-flow` 仍接近 navy/cyan 系，但 `usage-flow` 明显更偏红棕/灰暗，色彩母体不同。
3. 这会让 README 在跨语言切换时出现“像两个产品”的割裂感。

**修正要求**
- 两张图必须按同一 Frozen Palette v1 重做。
- 若保留双图：必须同一底色、同一连线主光、同一节点发光、同一卡片层级。
- 更推荐后续只保留一张统一流程主图，多语言 README 共用同一资产，以 caption 本地化承载语义差异。

### 图三问题：当前不是可宣称的真实使用截图
**涉及资产**
- `docs/assets/nexus-sanitized-usage-screenshot.png`

**问题判定**
1. 现有 proof 已明确写明这是 **local sanitized compositor / 本地构造视图**。
2. 因此它不能被表述为“实际产品使用截图”或“真实用户操作截图”。
3. 它目前只适合作为 README 的**示意图**或**conceptual product view**。

**修正要求**
- 后续要么替换为：真实 Telegram / WebUI 截图并完成严格脱敏；
- 要么继续保留该图，但 README 标注必须改成：`示意图` / `illustrative mockup` / `concept view`，禁止暗示真实生产界面。

---

## 交互/体验说明

### 统一的 README 扫读逻辑
1. 先看 Logo：记住品牌符号。
2. 再看 Hero：理解“PM 中枢调度多 Agent”的核心世界观。
3. 再看 Flow：快速理解任务如何流转与验证。
4. 再看 Screenshot：建立“实际使用会长什么样”的可信预期。

### 体验红线
- 不让用户在第一屏读一堆图内英文标签。
- 不让不同图片各自发散成不同色彩宇宙。
- 不让示意图冒充真实截图，损害可信度。

---

## 统一 cliproxy Prompt 模板（必须先用本模板，再出图）

### A. System Prompt / Design Directive
```text
You are generating README product visuals for Nexus Dispatch, an open-source AI agent orchestration control plane.
All images in this batch MUST belong to one unified brand system.
Frozen palette:
- base background: #07111F
- surface: #0F1B2D
- elevated surface: #16263D
- primary glow: #21D4FD
- secondary accent: #7C3AED
- warm accent: #F97316
Visual language:
- dark navy mission-control environment
- premium infrastructure SaaS editorial quality
- cinematic but readable
- clean hierarchy, medium graphic density
- minimal or no readable text inside image
- no long English labels unless explicitly requested
- no watermark, no raw JSON, no code block, no sensitive IDs
- logo, hero, flow, and screenshot-style visuals must look like one family
```

### B. Hero Prompt Template
```text
Create a README hero image for Nexus Dispatch.
Core concept: one PM control brain orchestrating a fleet of specialized AI agents through a proof-gated API control plane.
Scene: a central luminous dispatch core floating inside a dark navy mission-control environment, with structured agent lanes, subtle proof artifacts, review gates, and observability panels radiating outward.
Composition: 16:9 landscape, single strong focal center, clean negative space for README title, medium density, high scanability.
Use the frozen palette exactly: #07111F background, #21D4FD main glow, #7C3AED secondary energy, #F97316 only as small review/alert accent.
Do not rely on readable UI labels. Do not place many English words inside the image. This image must work for a Chinese README as well.
Style: premium product editorial, infrastructure SaaS, elegant, trustworthy, quiet power.
```

### C. Flow Prompt Template
```text
Create a README workflow visual for Nexus Dispatch.
Show a clear staged journey: task creation -> PM dispatch -> worker execution -> proof return -> review gate -> Telegram/WebUI visibility.
This must be a scan-friendly product flow graphic, not a screenshot and not a literal architecture diagram.
Composition: 16:9 landscape, horizontal reading path, clear stage separation, medium density, strong directional lines.
Use the frozen palette exactly: #07111F, #0F1B2D, #16263D, #21D4FD, #7C3AED, and only small #F97316 highlights.
No rainbow colors, no green-heavy palette, no large text blocks, no long English labels, no raw JSON, no IDs.
Make it visually consistent with the Nexus Dispatch hero image.
```

### D. Architecture Prompt Template
```text
Create a README architecture visual for Nexus Dispatch.
Show the relationship between Telegram/WebUI, Runtime API, PM daemon, worker agents, proof flow, review gate, and SQLite hidden inside the API boundary.
This image should feel more structural than the hero, but still belong to the same visual family.
Composition: 16:10 landscape, centered API control plane, readable node hierarchy, medium-high density.
Use the exact frozen palette and the same glow logic as the hero and flow images.
Avoid long readable paragraphs inside the image.
```

### E. Screenshot Replacement Prompt Rule
```text
Do not generate fake screenshots and present them as real screenshots.
If no real Telegram/WebUI capture is available, explicitly generate only an illustrative concept view and label it as mockup / concept view / 示意图.
If the asset is intended to be a real product screenshot, the source must come from an actual Telegram/WebUI capture with desensitization done after capture.
```

---

## 后续执行规则（冻结）
1. **先定色板，后出图**：本任务完成前不得继续自由生成 README 图。
2. **所有图同一 palette**：不得再出现 hero 一套色、flow 一套色、screenshot 一套色。
3. **中文 README 友好优先**：图内尽量少字，避免英文堆叠。
4. **示意图必须明示**：凡非真实截图，一律标注 mockup / concept view / 示意图。
5. **优先共享资产**：中英文 README 尽量共用同一主图，通过 caption 本地化，而不是复制多套视觉宇宙。

---

## 验收点
| AC | 要求 | 结果 |
| --- | --- | --- |
| AC-1 | 先确认并固化一个主色调并输出 palette | ✅ 已输出 Frozen Palette v1 |
| AC-2 | 输出 README 全部图片统一视觉规范：背景、光效、主辅色、强调色、字体语言、图形密度、logo/hero 关系 | ✅ 已覆盖 |
| AC-3 | 明确图一问题：logo/Hero 不过关，Hero 英文标签过多，中文 README 不适配 | ✅ 已明确 |
| AC-4 | 明确图二问题：两个图片颜色体系不统一，需要按同一 palette 重做 | ✅ 已明确 |
| AC-5 | 明确图三问题：不是真实截图，需真实脱敏截图或明确标示示意图 | ✅ 已明确 |
| AC-6 | 输出可供 cliproxy 生成的统一 prompt 模板 | ✅ 已输出 |

---

## 验证记录
### 文件与仓库验证
- `git status --short --branch` → clean on `main...origin/main` before this task
- README images discovered in:
  - `README.md`
  - `README.zh-CN.md`
  - `README.zh-TW.md`
- Asset dimensions verified locally via Pillow.
- Asset SHA256 verified locally via `sha256sum`.

### 当前限制
- `vision_analyze` 三次尝试均返回 `402 credits insufficient`，因此本次问题判断以：
  1. README 引用结构
  2. 既有 proof 文档
  3. 图片尺寸/文件校验
  4. 本地像素色彩分布抽样
  作为主要证据。

### 色彩不一致证据摘要
- `nexus-product-flow.png` 的主色分布仍接近 navy/cyan 系。
- `nexus-usage-flow.png` 的主色分布明显偏 `#203030 / #304050 / #202030` 一类红棕灰暗体系。
- 可支持“两个流程图不是同一 palette 家族”的结论。

---

## 阻塞 / 风险
1. **机器视觉复核受限**：当前 `vision_analyze` credits 不足，无法给出自动视觉审稿分数。
2. **真实截图源缺失**：仓库内暂无可直接脱敏后公开的真实 Telegram / WebUI 截图，因此图三只能先给出治理结论，不能在本任务内替换为真实截图。
3. **历史资产已入 README**：后续真正重做图片时，需要同步更新中英繁三份 README 的 caption/命名策略，避免新旧图混用。
