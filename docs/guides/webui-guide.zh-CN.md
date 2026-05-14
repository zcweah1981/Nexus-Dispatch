# WebUI 指南

[English](./webui-guide.md)

---

## 目标

本指南说明 Nexus Dispatch 对外 WebUI 的页面结构，帮助操作者在不接触原始 Runtime 存储的前提下快速扫读项目状态。

## WebUI 是什么

- 一个按项目隔离的 Runtime API 可视层
- 一个三语操作界面：English / 简体中文 / 繁體中文
- 默认安全：仅展示可见摘要，不暴露原始 proof blob，不允许浏览器直连 SQLite，不允许浏览器读取凭据

## 核心页面

### 1. 仪表盘
- 展示队列深度、完成数、阻塞/死信信号、活动任务组、活跃运行数
- 新增三个扫读优先卡片：
  - **当前流转焦点**：当前正在推进的任务组
  - **发布脉冲**：还有多少人类可读报告等待对外交付
  - **Proof 边界**：提醒深层 artifacts 仍留在 Runtime 存储

### 2. 生命周期时间线
- 按倒序列出最近的任务组 / 任务活动
- 每条记录显示标题、状态 pill、紧凑引用
- 适合回答“最近发生了什么”，不是替代完整审计

### 3. 任务看板
- 五列结构：
  - 已创建
  - 执行中
  - 等待审核
  - 准备重试 / 阻塞 / 死信 / 已取消
  - 已完成
- 卡片只展示标题、lane、紧凑任务组引用、脱敏 proof 摘要

### 4. 实时事件流
- 展示连接状态、传输方式、fallback 方式、项目隔离 SSE / polling 信息
- 事件文本在渲染前会先做脱敏
- 用于确认 Runtime 事件流是否正常工作

### 5. 发布中心
- 跟踪可发布任务组、待发送报告、已发送报告
- 关注的是 **人类可见交付状态**，不是内部 artifact payload
- 页面内的 operator note 会明确说明：发布状态看这里，详细 proof 仍在 Runtime 边界之后

### 6. Proof 治理
- 可以视作公开版“Proof Center”
- 只展示：
  - artifact type
  - 紧凑 run 引用
  - 脱敏后的摘要 / 路径文案
- 强调三个概念：
  - 只展示摘要
  - Runtime 存储边界
  - 不泄露敏感信息的审计链路

### 7. 派单实时流
- 展示紧凑 run/task 引用、分配 Agent、状态 pill、安全结果摘要
- 适合查看派单与执行占用情况，同时避免大范围暴露完整 run 标识

### 8. Agent 注册表
- 展示 agent ID、lane、dialect、status、脱敏后的 endpoint display ref
- 目标是提升注册表可读性，而不是展示连接秘密

## 语言切换

右上角语言切换器支持：
- English
- 简体中文
- 繁體中文

三种语言共享同一页面结构，只切换可见文案。

## 安全边界

WebUI 永远不会：
- 直接打开 SQLite
- 在浏览器读取本地文件
- 在浏览器读取环境变量或凭据
- 将原始 proof payload 公开渲染为页面正文

WebUI 只通过 `/api/v1/runtime/*` 与 `/api/v1/events/stream` 与 API Server 通信。

## 推荐操作路径

1. 先看 **仪表盘** 获取当前脉冲
2. 再看 **任务看板** 理解队列结构
3. 对外交付前看 **发布中心**
4. 被问到为什么看不到原始 proof 时看 **Proof 治理**
5. 需要 run 分配视角时看 **派单实时流**

## 截图说明

本指南对应的三语截图产物生成在内部 proof 目录：

`/root/.hermes/projects/nexus-dispatch/docs/proofs/r40-webui/`

除非后续任务明确要求提升为公开素材，否则不进入 public repo。
