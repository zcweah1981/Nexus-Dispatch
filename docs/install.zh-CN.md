# 安装与部署指南

<p align="center">
  <a href="./install.md">English</a> · <b>简体中文</b> · <a href="./install.zh-TW.md">繁體中文</a>
</p>

> R13_API_SERVER_DEPLOY_GUIDE_CONTRACT
>
> 本文是 API Server 的安装与部署中文导览版，用于三语导航与中文阅读入口。
> 如需完整命令细节、全部章节和逐步排障，请同时参考英文主文档 [install.md](./install.md)。
>
> `docs/assets/guide/` 下的图片资源由三语文档共享；若图片内仍有英文标签，以本页中文标题、说明和上下文为准。

![Guide cover](./assets/guide/nexus-guide-cover.jpg)

## 可视化导览

> 共享素材说明：以下部署流程图、集成图和验证截图在 English / 简体中文 / 繁體中文 三个版本中复用，避免重复维护多套截图资产。

### 部署流程

![Deployment flow](./assets/guide/deployment-flow.png)

说明：展示从克隆仓库、配置环境变量、构建 API/Daemon/WebUI 到完成基础验证的整体路径。

### Hermes 集成

![Hermes integration](./assets/guide/hermes-integration.png)

说明：用于说明 Hermes Agent 如何作为执行端/接入端与 Nexus Dispatch Runtime API 协同。

### OpenClaw Worker 集成

![OpenClaw integration](./assets/guide/openclaw-integration.png)

说明：用于说明 OpenClaw 风格 Worker 的注册、派单与回传 proof 闭环。

### 双系统架构图

![Dual-system architecture](./assets/guide/dual-system-architecture.png)

说明：强调「单 PM 大脑 + 多异构 Worker 哑执行」和 API-only 边界。

### API Server 验证截图

![API server verification proof](./assets/guide/api-server-verification-proof.png)

说明：该图用于展示部署验证形态；公开文档版本应只保留与验证结果相关的信息，不暴露聊天对象、token、chat_id 或其他敏感字段。

---

## 阅读路径建议

### 我是首次部署用户
1. 先阅读英文完整版 [install.md](./install.md) 的 **Docker Compose Deployment**。
2. 再查看 **Bare-Metal Deployment with systemd** 与 **Troubleshooting**。
3. 最后执行文末 **Verification Commands** 做收尾检查。

### 我只想确认架构和接入方式
- 看本页的部署流程图、Hermes/OpenClaw 集成图、双系统架构图。
- 回到项目主页 [README.zh-CN.md](../README.zh-CN.md) 查看产品定位与核心能力。

### 我需要完整命令与参数
- 英文主文档： [install.md](./install.md)
- 产品概览： [README.zh-CN.md](../README.zh-CN.md)
- 英文 README： [README.md](../README.md)

---

## 语言与素材策略

- 三语文档统一复用 `docs/assets/guide/` 下的公共素材。
- 若图片内有英文界面/命令文字，优先通过本地化标题、说明与前后文消除阅读障碍。
- 后续如新增强文本型截图，优先补充无文字版、裁剪版或可三语共用的注释版，避免英文图直接破坏中文阅读流。

## 验证入口

如需执行正式部署验证，请使用英文主文档末尾的命令集合：
- [Verification Commands](./install.md#12-verification-commands)
- [Troubleshooting](./install.md#11-troubleshooting)
- [Docker Compose Deployment](./install.md#3-docker-compose-deployment)
- [Bare-Metal Deployment with systemd](./install.md#7-bare-metal-deployment-with-systemd)
