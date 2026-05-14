# Proof 治理指南

[English](./proof-governance-guide.md)

---

## 目标

本指南解释 Nexus Dispatch 中公开“Proof Center”模型的工作方式。

产品原则非常简单：

**公开 WebUI 只展示安全摘要；完整 proof 保存在 Runtime 存储里。**

## 为什么需要这条边界

操作者需要可见性，但公开界面不能泄露：
- 原始 payload JSON
- 隐藏运行时 ID
- chat ID
- bearer token
- secrets
- 内部 reviewer 证据包

## Proof 治理页面展示什么

- artifact type
- 紧凑 run 引用
- 脱敏后的摘要 / 路径文案
- proof 边界提醒

## 哪些内容不会出现在公开页面

- 原始 report payload
- 原始 artifact 内容
- 完整 proof markdown / json
- 隐藏凭据材料
- 内部审核证据包

## 三条规则

### 1. 只展示摘要
WebUI 以扫读效率优先，不做完整证据 dump。

### 2. Runtime API 边界
完整 proof 留在 Runtime 存储和 API-only 边界之后。
浏览器不是数据库客户端。

### 3. 有审计链路但不泄露
操作者仍可通过以下信息追踪证据链：
- artifact type
- audit reference
- 通过受控后端流转保留的 project/task/run 关系

## 深层 proof 应放在哪里

本次 launch 相关的内部截图 proof、review proof 与治理产物应统一放在：

`/root/.hermes/projects/nexus-dispatch/docs/proofs/r40-webui/`

除非后续任务明确升级，否则不进入 public docs repo。

## 推荐操作行为

当有人要求在 public UI 中直接看到 raw proof：
1. 解释 summary-only 边界
2. 转向 Runtime/API 证据层做深度验证
3. 不要为了方便而扩大公开暴露面

## 相关指南

- [Release Center Guide](./release-center-guide.md)
- [Admin Guide](./admin-guide.md)
- [API-only Safety Boundary](./api-only-safety.md)
