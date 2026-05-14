# Agent 注册表指南

[English](./agent-registry-guide.md)

---

## 目标

本指南说明如何阅读 Nexus Dispatch 的 Agent 注册表页面。

## 页面展示什么

每张卡片展示：
- `agent_id`
- lane
- dialect
- status
- endpoint display reference

## 页面不展示什么

不会暴露：
- 原始 endpoint 凭据
- Worker 主机上的本地文件路径
- bot token / chat ID
- 原始 agent payload JSON

endpoint ref 只是脱敏后的显示引用。

## 字段如何理解

### Agent ID
用于派单路由与 proof 归因的稳定逻辑身份。

### Lane
对应的工作 lane，例如：
- DEV
- OPS
- DESIGN
- CONTENT
- RESEARCH
- ORCHESTRATOR

### Dialect
执行风格 / 适配器类型，例如 Hermes 或 OpenClaw。

### Status
用于操作层判断的高层可用性信号。
它不能代替更深层的 Worker 健康诊断。

### Endpoint display ref
帮助操作者区分不同 Worker 的安全提示值，不暴露真实连接秘密。

## 推荐使用场景

适合回答：
- 这个 lane 由谁负责？
- 某个 lane 是否已经有 Worker 覆盖？
- 当前接入的是哪种 dialect？
- 哪个 agent 看起来离线或陈旧？

## 不推荐的使用方式

不要把 Agent 注册表当作：
- secret 管理页面
- transport 调试台
- Worker 立即可成功执行的最终证明

更深层检查应结合：
- Dispatch Live
- Observability
- Runtime API agent list

## 操作提示

注册表是可读性层。真正的权威仍在 Runtime API 与项目级调度逻辑中。
