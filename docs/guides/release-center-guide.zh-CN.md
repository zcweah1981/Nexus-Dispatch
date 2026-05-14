# 发布中心指南

[English](./release-center-guide.md)

---

## 目标

发布中心是 Nexus Dispatch 用来查看**可见交付是否准备好**的操作页面。

它回答的问题很简单：

**哪些项目输出已经准备好发给人，哪些还在等待？**

## 页面追踪什么

- 可发布任务组
- 待发送报告
- 已发送报告
- 脱敏后的报告摘要
- 报告发送状态

## 页面不追踪什么

这里不是用来查看：
- 原始 proof blob
- 完整 artifact payload
- 隐藏凭据
- 作为公开 UI 正文展示的私有运行时 ID

## 页面如何阅读

### 可发布任务组
已完成或已归档，因此具备发布摘要条件的任务组。

### 待发送报告
尚未完全发送的人类可见报告项。
这是对外交付中最重要的阻塞信号之一。

### 已发送报告
已经通过正常可见汇报链路交付出去的报告。

### 报告卡片
每张卡片展示：
- 脱敏摘要
- 报告消息类型
- 紧凑任务引用
- 状态 pill

## 推荐工作流

1. 先看 pending reports 数量
2. 阅读最新的脱敏摘要
3. 确认状态 pill 是否正在走向 sent / completed
4. 如果仍有疑问，转向 Runtime 证据层，而不是扩大 public UI 暴露面

## 交付原则

发布中心关注的是**可读交付状态**。
详细 proof 仍归属于 Runtime 存储与 reviewer 证据层。

## 常见误区

- 把“任务完成”当作“对外交付完成”
- 把 public WebUI 卡片当作唯一 proof 来源
- 在截图或状态同步里暴露原始内部 ID

## 相关指南

- [WebUI Guide](./webui-guide.md)
- [Proof Governance Guide](./proof-governance-guide.md)
- [Admin Guide](./admin-guide.md)
