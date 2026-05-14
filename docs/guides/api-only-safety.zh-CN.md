# API-only 安全边界

[English](./api-only-safety.md)

---

## 核心规则

在 Nexus Dispatch 中，Worker、WebUI、Daemon 都**不能**直接打开 SQLite。

SQLite / Prisma 访问权只属于 API Server。

## 为什么要这样设计

这样才能保持产品治理模型一致：
- 单一权威控制平面
- 按项目隔离的读写
- 可审查的状态流转
- 秘钥统一收口
- 降低随意直写数据库的风险

## 各层允许做什么

### API Server
- 拥有 SQLite / Prisma
- 负责请求校验
- 负责鉴权和 schema 检查
- 暴露 Runtime API 路由

### WebUI
- 只通过 `/api/v1/runtime/*` 读取
- 通过 `/api/v1/events/stream` 接收事件
- 只渲染脱敏摘要
- 不在浏览器读取本地文件、环境变量或原始 DB 数据

### Worker
- 接收派单 payload
- 执行任务
- 通过 Runtime API 回传 proof
- 不允许通过直写 DB 自主完成任务

### Daemon
- 协调轮询 / 派单 / 审核流程
- 通过批准的 Runtime/API/FSM 边界推进状态
- 不能作为 public integration 的隐式 SQLite 客户端

## 实际安全收益

因为有这条边界：
- 截图可以保持可读且不泄露 secrets
- 审核逻辑可以集中审计状态流转
- 更容易保证项目隔离
- public docs 可以对外解释一套稳定集成契约

## 对外一句话解释

如果你只想用一句话说明：

> Nexus Dispatch 天生是 API-only：SQLite 归 API Server 所有，WebUI、Worker、Daemon 都只能通过 Runtime API 读写状态。

## 相关参考

- [Architecture](../architecture.md)
- [Runtime API](../runtime-api.md)
- [WebUI Guide](./webui-guide.md)
- [Proof Governance Guide](./proof-governance-guide.md)
