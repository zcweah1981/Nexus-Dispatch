# Nexus Dispatch V8 Clean Rebuild Baseline

本目录是 V8-R0 冻结旧线后的新基线入口。

## R0 范围

- 只建立测试/仓库/契约边界。
- 只提供 smoke contract 与 smoke schema，用于证明后续测试 DB 可以从受控 schema 初始化。
- 不实现 R1-R9 的 Runtime API、Prisma repository、daemon、review、report、cron、WebUI 重构。

## Legacy 冻结策略

旧 V7.x 主流程、旧 DAL、旧 schema-drift 测试保留为参考与迁移对象。后续 R1+ 必须基于本目录的契约和正式 PRD/SSD 继续拆任务执行，不能在旧 failing path 上继续补丁。