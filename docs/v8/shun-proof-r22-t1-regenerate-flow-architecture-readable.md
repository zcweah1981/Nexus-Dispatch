# R22-T1 Regenerate Product Flow and Architecture Readable Proof

## 任务
- Task ID: `nexus-v8-r22-t1-regenerate-flow-architecture-readable`
- Title: `R22-T1: Regenerate Product Flow and Architecture with hero-level readability`
- Lane: `DESIGN`
- Repo target: `/opt/projects/nexus-dispatch`

## 完成内容
已重新生成并覆盖以下可交付资产：

### Product Flow
- `docs/assets/nexus-product-flow.svg`
- `docs/assets/nexus-product-flow-en.png`
- `docs/assets/nexus-product-flow-zh-CN.png`
- `docs/assets/nexus-product-flow-zh-TW.png`
- `docs/assets/nexus-product-flow.png`

### Architecture
- `docs/assets/nexus-architecture.svg`
- `docs/assets/nexus-architecture-en.png`
- `docs/assets/nexus-architecture-zh-CN.png`
- `docs/assets/nexus-architecture-zh-TW.png`
- `docs/assets/nexus-architecture.png`

## 本次修正点
### Product Flow
- 将 5 步卡片改为更宽卡面与更短文案，避免 `Worker Execute`、`Proof + Artifact` 等标题拥挤或伪截断。
- 提升主标题、带状说明、步骤标题与正文文字尺寸，确保 GitHub README 宽度下仍可扫读。
- 去掉旧版过长副标题与过密描述，保持「任务 → 派发 → 执行 → proof → 验证交付」自解释闭环。
- 保留深色 premium 基线，但压低工程图密度，避免“蓝图感”。

### Architecture
- 从层层细部框图改为 hero-level overview，只保留关键层：Human Visibility、PM Brain / Runtime API、Worker Fleet、Proof / Review、SQLite SSoT、Scheduler Edge。
- 将关键边界规则抽成底部高可读 callout：所有状态变化必须穿过 Runtime API，禁止绕过直写 SQLite。
- 压缩 API pill 数量，只保留 `Tasks / Runs / Reports / Artifacts / Review`，避免密集工程词表。
- 保留成熟 OSS 气质与几何发光语言，但整体更稀疏、更像 README hero 下的产品架构概览。

## 产物校验
| Path | Size | SHA256 |
| --- | --- | --- |
| `docs/assets/nexus-product-flow.svg` | n/a | `16cdb74eca84de03d07afbed20ff4015db83ff67b21452e5f1a3da9341518bd0` |
| `docs/assets/nexus-product-flow-en.png` | `1600×900` | `be840796772fe1c933d8e198d9899df88716d75f9d8f63602bfc530f35eff2a9` |
| `docs/assets/nexus-product-flow-zh-CN.png` | `1600×900` | `37326f79d634e277f2cb32547abfa6d9ce72aa6e220c90f32bac16be7ed37628` |
| `docs/assets/nexus-product-flow-zh-TW.png` | `1600×900` | `37326f79d634e277f2cb32547abfa6d9ce72aa6e220c90f32bac16be7ed37628` |
| `docs/assets/nexus-product-flow.png` | `1600×900` | `be840796772fe1c933d8e198d9899df88716d75f9d8f63602bfc530f35eff2a9` |
| `docs/assets/nexus-architecture.svg` | n/a | `e81aa61fc3470b7f2b894e83301ff087acc647257ad760b2de07e4a01cb30b0c` |
| `docs/assets/nexus-architecture-en.png` | `1600×1000` | `da2b9bb13d33b3c510673b6ba9028a75df69361e7fc4e737aef2c6b81f1ca866` |
| `docs/assets/nexus-architecture-zh-CN.png` | `1600×1000` | `114283761951d725f6ce90ec32c5ada5f006b8c7125bbeefb084d840f40692ff` |
| `docs/assets/nexus-architecture-zh-TW.png` | `1600×1000` | `114283761951d725f6ce90ec32c5ada5f006b8c7125bbeefb084d840f40692ff` |
| `docs/assets/nexus-architecture.png` | `1600×1000` | `da2b9bb13d33b3c510673b6ba9028a75df69361e7fc4e737aef2c6b81f1ca866` |

## 验证结果
### 已执行命令
```bash
python3 /opt/projects/nexus-dispatch/tmp/generate_r19_brand_assets.py
python3 - <<'PY'
from PIL import Image, ImageChops
pairs=[
('/opt/projects/nexus-dispatch/docs/assets/nexus-product-flow-zh-CN.png','/opt/projects/nexus-dispatch/docs/assets/nexus-product-flow-zh-TW.png'),
('/opt/projects/nexus-dispatch/docs/assets/nexus-architecture-zh-CN.png','/opt/projects/nexus-dispatch/docs/assets/nexus-architecture-zh-TW.png'),
]
for a,b in pairs:
    print(ImageChops.difference(Image.open(a), Image.open(b)).getbbox())
PY
python3 - <<'PY'
from pathlib import Path
for p in [
'/opt/projects/nexus-dispatch/docs/assets/nexus-product-flow.svg',
'/opt/projects/nexus-dispatch/docs/assets/nexus-architecture.svg'
]:
    txt=Path(p).read_text(encoding='utf-8')
    for key in ['Worker Execute','Proof + Artifact','DEV / OPS / DESIGN','SQLite SSoT','Boundary rule']:
        if key in txt:
            print(Path(p).name, key)
PY
```

### 验证结论
- Flow 与 Architecture 主 PNG 均已重新导出。
- Flow 输出尺寸保持 `1600×900`，Architecture 输出尺寸保持 `1600×1000`。
- `zh-CN` 与 `zh-TW` 两组 PNG 像素 diff 均为 `None`。
- 最关键的易损标签已在 SVG 文本中确认存在：`Worker Execute`、`Proof + Artifact`、`DEV / OPS / DESIGN`、`SQLite SSoT`、`Boundary rule`。
- 浏览器快照已反映新文案：
  - Flow: `A readable five-step loop for README width...`, `Verified Delivery`
  - Architecture: `Architecture Overview`, `Human Visibility`, `Runtime API / PM Brain`, `Worker Fleet`, `Boundary rule`

## 视觉证明说明
- 旧 rejection evidence：`/root/.hermes/image_cache/img_e5410a832438.jpg`（870×1280）
- 新产物路径：`docs/assets/nexus-product-flow*.{svg,png}`、`docs/assets/nexus-architecture*.{svg,png}`
- 本地 browser snapshot 已显示新标题与新标签文本，作为可读性修正后的 repo 内视觉证据。

## 阻塞 / 限制
- `browser_vision` 在本地 file:// SVG 截图时超时，未能产出额外机器视觉截图结论。
- 因此本次视觉 proof 采用替代证据链：
  1. 生成脚本重新导出产物
  2. 尺寸与 SHA256 校验
  3. SVG 文本关键标签检查
  4. 浏览器快照文本验证
  5. 与旧 rejection evidence 的任务要求逐项对照
