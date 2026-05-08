# Nexus Dispatch V8 Clean Rebuild Baseline

本目录是 V8-R0 冻结旧线后的新基线入口。

## R0 范围

- 只建立测试/仓库/契约边界。
- 只提供 smoke contract 与 smoke schema，用于证明后续测试 DB 可以从受控 schema 初始化。
- 不实现 R1-R9 的 Runtime API、Prisma repository、daemon、review、report、cron、WebUI 重构。

## Legacy 冻结策略

旧 V7.x 主流程、旧 DAL、旧 schema-drift 测试保留为参考与迁移对象。后续 R1+ 必须基于本目录的契约和正式 PRD/SSD 继续拆任务执行，不能在旧 failing path 上继续补丁。

## R1 单一数据层主线

- `prisma/schema.prisma` 是 V8 数据层 SSoT。
- `src/repositories/v8.ts` 是 R1 Repository 主线；R2+ Runtime API / FSM Controller 必须基于该 Repository 边界继续。
- `src/db/dal.ts`、`data/nexus.db` 与 `tests/legacy/**` 进入 legacy DAL 只读适配 / archive 边界，不得参与 V8 新主流程。
- 详细边界见 `docs/v8/legacy-dal-boundary.md` 与 `docs/v8/prisma-schema-boundary.md`。
- R2 FSM 状态枚举与 transition matrix 位于 `src/fsm/v8_state_matrix.ts`；legacy 状态映射只允许出现在 `docs/v8/legacy-status-mapping.md`。
