# R11-T2 Nexus README Hero / Architecture Assets Proof

## 任务
- Task ID: `nexus-v8-r11-product-readme-t2-hero-and-architecture-assets`
- Scope: 为 Nexus Dispatch 创建 README 可引用的产品 hero 资产与控制平面结构图资产；不使用参考项目 logo、聊天截图或私有图片，全部为仓库内原创 SVG/PNG 资产。

## 产物清单
| Asset | Path | Type | Planned Size |
| --- | --- | --- | --- |
| Hero source | `docs/assets/nexus-hero.svg` | SVG | 1600×900 |
| Hero preview | `docs/assets/nexus-hero.png` | PNG | 1600×900 |
| Architecture source | `docs/assets/nexus-architecture.svg` | SVG | 1600×1040 |
| Architecture preview | `docs/assets/nexus-architecture.png` | PNG | 1600×1040 |

## 设计说明
### Hero
- 风格：dark infra / control-plane / 开源工程气质。
- 表达：突出 `Single PM brain + API-only Runtime + SQLite SSoT + governed fan-out`。
- 视觉策略：不使用 logo 贴图、不使用聊天截图，采用原创渐变、grid、模块卡片与数据路径表达产品定位。

### Architecture Diagram
- 表达对象：Telegram / PM Runtime API / SQLite SSoT / Daemon / Agents / Proof / WebUI / Cron。
- 结构关系：
  1. Telegram 和 Cron Adapter 作为外侧输入/交互边界。
  2. PM Runtime API 是唯一控制入口。
  3. SQLite 仅在 API 边界内作为 SSoT。
4. Daemon、WebUI、Proof Plane、Cron Registry 都围绕 Runtime API 运转。
5. Agents 经由 Daemon fan-out，结果进入 Proof + Review plane，再由人类可见消息回流。

## README 引用
- README hero: `./docs/assets/nexus-hero.png`
- README architecture: `./docs/assets/nexus-architecture.png`

## 预览 proof
- README 顶部新增 hero 图与 architecture 图，均使用相对路径引用。
- 两张图的 source-of-truth 为仓库内 SVG，可持续追踪与后续编辑。

## 验证要求
- 使用工具确认文件存在、尺寸正确。
- README 使用相对路径，不依赖外链。
