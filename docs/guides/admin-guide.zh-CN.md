# Admin 指南

[English](./admin-guide.md)

---

## 目标

本指南说明如何在不破坏 API-only 边界的前提下，安全操作 Nexus Dispatch 的 WebUI 与 Runtime API 可视层。

## 当前 public 产品中的 admin 范围

当前 public WebUI 的管理员范围刻意收敛为：
- Runtime 可见性
- 少量 API 支持的受控动作预览
- 只读设置与策略查看
- 安全 proof 暴露

它**不是**一个宽权限浏览器后台。

## 管理员应重点使用的页面

### 项目设置
- 展示由 Runtime API 返回的只读项目设置
- 适合确认 visible language 与策略状态
- 不用于查看 secrets 或原始 env 值

### 受控动作
- 展示 preview → validation → confirm → result → audit reference 的流程
- 当前低风险写入路径必须显式走 API
- 部分卡片仍是 preview-only，直到匹配的 controlled API 完成

### 可观测性
- 展示 API、daemon、worker heartbeat、failed runs、report / artifact / event 计数
- 当你需要先确认控制平面是否健康，优先看这里

### 发布中心
- 对外汇报前，先在这里确认可见报告是否真正就绪
- `run completed` 不等于对外交付完成

## Review policy 与 cron registry

public admin 认知必须与真实产品边界一致：

- Review policy 是项目级 Runtime 数据
- `project_cronjobs` 中的 cron 行只是**注册表记录**，不代表真实外部调度器一定正在运行
- Telegram 项目选择不会自动启停 cronjob
- Daemon 的状态驱动仍必须走 Runtime API 边界

## 安全管理员检查单

在判断项目健康前，至少确认：
- [ ] API 状态健康
- [ ] 队列深度可解释
- [ ] 已检查阻塞 / 死信数量
- [ ] 已在发布中心检查 pending reports
- [ ] Proof 治理页面已确认仅展示安全摘要
- [ ] 没有人把浏览器可见信息当作完整证据替代品

## 管理员不应做的事

- 不要绕过 Runtime API 直接操作 SQLite
- 不要把 endpoint display ref 当成真实凭据
- 不要在公开截图里暴露 raw proof、run ID、chat ID、token
- 不要因为 registry 有行就宣称 cron 自动化一定在运行

## 何时离开 WebUI

遇到以下场景，应切换到更深的 Runtime/API 证据层：
- 查看原始 proof payload
- 查看比可见摘要更深的 audit 事件
- 排查服务重启 / 部署问题
- 调试 scheduler adapter
- 排查数据库 / schema 问题

## 相关指南

- [WebUI Guide](./webui-guide.md)
- [Release Center Guide](./release-center-guide.md)
- [Proof Governance Guide](./proof-governance-guide.md)
- [API-only Safety Boundary](./api-only-safety.md)
