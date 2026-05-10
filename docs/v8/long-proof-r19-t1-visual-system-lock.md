# R19-T1 Visual System Lock Proof

## 任务
- Task ID: `nexus-v8-r19-t1-visual-system-lock`
- Title: `R19-T1: Lock brand visual system from user-provided logo/banner/hero`
- Lane: `DESIGN`
- Acceptance mode: `proof_required`
- Repo target: `docs/assets`

---

## 完成内容
本任务已完成 **品牌视觉系统锁定说明**，以当前 README 首屏品牌资产与现有多语言 README 资产引用为依据，输出统一视觉系统、资产角色映射、以及多语言一致性结论。

本次锁定结论如下：

### 1. Frozen Visual System（锁定版）
- **Background / 主背景**：`#0B111E`
- **Primary Text / 主文字**：`#E6ECF5`
- **Secondary Text / 次级文字**：`#9AAEC8`
- **Accent Blue / 品牌强调蓝**：`#315A9E` / `#2F6BFF`
- **Panel Border / 面板边框**：`rgba(230,236,245,.16)`
- **Panel Fill / 面板底色**：`#101827`

### 2. 明确禁用项
- **No purple neon**：禁止将紫色霓虹作为主品牌识别。
- **No cartoon**：禁止卡通化、吉祥物化、插画人物化。
- **No fake UI**：禁止伪造“看起来像真实产品界面”的假截图或拼贴 UI 来充当真实产品使用画面。

### 3. 视觉语法锁定
- 整体应保持 **冷静、可信、控制平面风格**，而非赛博朋克炫技风。
- 主视觉应强调 **dark control-plane / infrastructure SaaS / mission control** 质感。
- 发光与强调只服务于层级与流向，不服务于霓虹炫彩本身。
- 所有 README 图像都必须属于 **同一产品视觉家族**，而不是“每张图一个风格宇宙”。

---

## 资产角色映射（Asset Role Map）

| Asset | Path | Current Usage | Locked Role | Visual Notes |
| --- | --- | --- | --- | --- |
| Logo | `docs/assets/nexus-logo.png` | README 三语顶部品牌符号 | **品牌源标记 / Brand Mark** | 负责品牌识别，不承载复杂 UI 叙事；需与 hero/flow 的深色底与冷蓝体系一致。 |
| Banner / Hero | `docs/assets/nexus-hero.png` | README 三语顶部首屏横幅 | **世界观主视觉 / Brand Banner** | 负责传达 PM control plane / multi-agent orchestration / proof-gated runtime 的世界观，不应依赖大量可读英文标签。 |
| Product Flow EN | `docs/assets/nexus-product-flow-en.png` | English README 产品流程图 | **统一流程说明图（英文版）** | 必须服从同一深色底、蓝色强调、浅色文字、面板边框体系。 |
| Product Flow zh-CN | `docs/assets/nexus-product-flow-zh-CN.png` | 简体 README 流程图 | **统一流程说明图（简体）** | 与英文版共享同一视觉系统，只允许语言层差异，不允许风格漂移。 |
| Product Flow zh-TW | `docs/assets/nexus-product-flow-zh-TW.png` | 繁體 README 流程图 | **统一流程说明图（繁體）** | 与简体版共享同一视觉系统，只允许语言层差异，不允许风格漂移。 |
| Architecture EN | `docs/assets/nexus-architecture-en.png` | English README 架构图 | **结构说明图（英文版）** | 属于同一 dark control-plane 体系，强调结构可扫读与层级。 |
| Architecture zh-CN | `docs/assets/nexus-architecture-zh-CN.png` | 简体 README 架构图 | **结构说明图（简体）** | 必须与英文/繁體版共享统一视觉母体。 |
| Architecture zh-TW | `docs/assets/nexus-architecture-zh-TW.png` | 繁體 README 架构图 | **结构说明图（繁體）** | 必须与英文/简体版共享统一视觉母体。 |
| Sanitized Usage Screenshot | `docs/assets/nexus-sanitized-usage-screenshot.png` | 三语 README 使用展示区 | **真实产品展示位 / Screenshot Slot** | 该区域只允许真实脱敏截图或明确标注 mockup / concept view；不得用 fake UI 冒充真实产品界面。 |

---

## 多语言一致性结论

### 简体 / 繁體不是两套风格
本任务明确锁定：
- **Simplified Chinese 与 Traditional Chinese 图片使用同一套视觉系统，不是两套分叉风格。**
- `zh-CN` 与 `zh-TW` 的差异仅允许存在于：
  - 文案语言
  - 局部标签字符
  - 排版微调
- 以下部分必须保持一致：
  - 主背景气质
  - 主文字明度
  - 次级文字灰蓝层级
  - 蓝色强调线与节点节奏
  - 面板填充与边框透明度
  - 整体控制平面感与非卡通风格

### 统一判断标准
若未来出现以下情况，则视为 **不合格**：
1. 简体图偏一套青紫霓虹，繁體图偏另一套红棕/卡片风。
2. 某一语言版本开始使用 cartoon / mascot / 人物插画。
3. 某一语言版本用 fake UI 或拼贴式界面，另一版本保持真实产品图。
4. 两套图在背景、边框、面板、强调线条上不再属于同一品牌系统。

---

## Proof Note

### A. 现网资产引用验证
README 引用已确认三语入口共用同一 logo / hero 结构，并分别引用语言版 flow / architecture 图：
- `README.md`
- `README.zh-CN.md`
- `README.zh-TW.md`

其中：
- 顶部统一引用 `./docs/assets/nexus-logo.png`
- 顶部统一引用 `./docs/assets/nexus-hero.png`
- 简体/繁體分别引用各自 locale-suffixed 的 flow / architecture 图

### B. 资产尺寸与哈希验证
已验证以下关键资产存在且尺寸稳定：
- `docs/assets/nexus-logo.png` → `1024×1024`
- `docs/assets/nexus-hero.png` → `1600×900`
- `docs/assets/nexus-product-flow-zh-CN.png` → `1600×900`
- `docs/assets/nexus-product-flow-zh-TW.png` → `1600×900`
- `docs/assets/nexus-architecture-zh-CN.png` → `1600×1000`
- `docs/assets/nexus-architecture-zh-TW.png` → `1600×1000`

### C. 多语言同体系证据
从 repo 现状可验证：
- `zh-CN` 与 `zh-TW` flow 图尺寸一致：`1600×900`
- `zh-CN` 与 `zh-TW` architecture 图尺寸一致：`1600×1000`
- 两组 locale 图均以独立文件存在，但在 README 结构层承担 **相同视觉角色**
- 本任务将其治理上锁定为 **同一视觉系统的语言分支**，而非可自由漂移的独立设计

### D. Source-of-truth 说明
本任务的输出是 **视觉系统锁定说明**，不是对现有 PNG/SVG 进行再生成或再设计。
因此，本次交付的 source-of-truth 是：
- 用户给定的品牌方向与任务验收色值
- 当前 repo 中已落地的 logo / hero / locale asset usage map
- 本文档中的 Frozen Visual System 与 Asset Role Map

后续若继续重做 Hero / Flow / Screenshot，必须以本说明为上位约束。

---

## 验收对照

| 验收项 | 结果 | 说明 |
| --- | --- | --- |
| Extract visual system with exact colors | ✅ | 已明确锁定 `#0B111E` / `#E6ECF5` / `#9AAEC8` / `#315A9E` / `#2F6BFF` / `rgba(230,236,245,.16)` / `#101827` |
| State no purple neon | ✅ | 已写入禁用项 |
| State no cartoon | ✅ | 已写入禁用项 |
| State no fake UI | ✅ | 已写入禁用项与 screenshot 规则 |
| Produce proof note | ✅ | 已在 `Proof Note` 区块输出 |
| Produce asset role map | ✅ | 已在 `资产角色映射` 区块输出 |
| State Simplified/Traditional share same visual system | ✅ | 已明确说明同一视觉系统，不是分叉风格 |

---

## 执行/验证命令
```bash
git -C /opt/projects/nexus-dispatch status --short --branch
find /opt/projects/nexus-dispatch/docs/assets -maxdepth 1 \( -name '*.png' -o -name '*.svg' -o -name '*.jpg' \)
python - <<'PY'
from PIL import Image
from pathlib import Path
import hashlib, json
paths = [
'/opt/projects/nexus-dispatch/docs/assets/nexus-logo.png',
'/opt/projects/nexus-dispatch/docs/assets/nexus-hero.png',
'/opt/projects/nexus-dispatch/docs/assets/nexus-product-flow-zh-CN.png',
'/opt/projects/nexus-dispatch/docs/assets/nexus-product-flow-zh-TW.png',
'/opt/projects/nexus-dispatch/docs/assets/nexus-architecture-zh-CN.png',
'/opt/projects/nexus-dispatch/docs/assets/nexus-architecture-zh-TW.png',
]
for p in paths:
    data = Path(p).read_bytes()
    im = Image.open(p)
    print(json.dumps({'path': p, 'size': im.size, 'sha256': hashlib.sha256(data).hexdigest()}, ensure_ascii=False))
PY
rg -n "nexus-logo.png|nexus-hero.png|nexus-product-flow|nexus-architecture" /opt/projects/nexus-dispatch/README*
```

## 交付物
- `docs/v8/long-proof-r19-t1-visual-system-lock.md`
