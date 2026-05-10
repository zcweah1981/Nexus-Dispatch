# Long Proof — V8-R7-T5 systemd/docker health runbook

任务：`nexus-v8-r7-t5-ops-runbook`

范围：补 systemd/docker health runbook 与 ops proof；不引入生产 DB、ignored SQLite、dist/node_modules/secrets/proof JSON/.env 污染；所有健康检查均为只读观测操作，不直接操作数据库、不回退 legacy DAL。输出 R7 proof 与 R8 输入。

## 前置阅读

已按调度要求阅读/复核：

- `docs/v8/README.md` — V8 clean rebuild baseline；R2+ 主线必须基于 Repository / Runtime API / FSM Controller。
- `docs/v8/legacy-dal-boundary.md` — legacy DAL 只读/archive；V8 主流程不得回退到 `src/db/dal.ts`、`better-sqlite3` 或 ignored DB。
- `docs/v8/prisma-schema-boundary.md` — Prisma schema / Client 是 V8 主线数据层契约。
- `docs/v8/long-proof-r7-t1-cronjobs-schema-api.md` — `project_cronjobs` registry 已具备 project-scoped schema/API/service/repository；后续 cron 启停必须通过 registry 校验。
- `docs/v8/long-proof-r7-t4-watchdog-template.md` — watchdog/patrol prompt 模板化已完成；巡检输出定位为只读观察，严禁自动修复。
- `docker-compose.yml` / `Dockerfile` / `install.sh` — 现有部署架构：4 服务（nexus-db, nexus-api, nexus-daemon, nexus-webui）。
- `src/daemon/main.ts` / `src/daemon/v8_tick_loop.ts` — Daemon tick loop 实现，含 `[Tick Summary]` 日志输出。
- `src/api/server.ts` — API Server Express 入口，含 `/health`、`/api/v1` auth guard、`/v1/events/stream` SSE。

## 修改文件

本卡新增（task-scoped）：

- `scripts/health-check.sh`
  - 综合健康检查脚本（~430 行 bash）。
  - 7 个检查段：Docker Compose 服务、systemd 单元、API Server、Daemon Tick Loop、数据库、文件系统与配置、系统资源。
  - 支持 `--quick`（跳过日志分析）、`--json`（结构化输出供 watchdog worker 解析）。
  - 退出码：0=健康 / 1=CRITICAL / 2=WARNING。
  - **所有检查均为只读**：不执行 SQL 写入、不修改文件、不启停服务。
  - `data/nexus.db` 引用仅做 `stat` 文件存在性/大小检查，不打开/不读写数据库。
- `scripts/nexus-dispatch-api.service`
  - systemd unit 文件，API Server 裸机部署用。
  - 含 `ExecHealthCheck`（HTTP `/health`）、`Restart=on-failure`、`MemoryMax=512M`、安全加固（NoNewPrivileges/ProtectSystem=strict/PrivateTmp）。
- `scripts/nexus-dispatch-daemon.service`
  - systemd unit 文件，Daemon 裸机部署用。
  - 含 `ExecHealthCheck`（journald `[Tick Summary]` 检测）、`WatchdogSec=600`、`Restart=on-failure`、`MemoryMax=256M`。
  - 依赖 `nexus-dispatch-api.service`（After + Requires + PartOf）。
- `docs/v8/ops-health-runbook.md`
  - 完整运维手册（~400 行），覆盖：
    - 文档说明、系统架构概览、服务清单。
    - 快速健康检查（一键脚本 + Docker / systemd 速查）。
    - Docker Compose 部署健康检查（容器存活、API Server、Daemon Tick Loop、数据库、网络连通性）。
    - systemd 裸机部署健康检查（unit 安装、状态检查、日志查询、健康检查机制对比）。
    - 故障诊断流程图（ASCII）。
    - 5 个标准操作手册（重启、升级、备份、日志轮转、紧急回滚）。
    - 监控与告警建议（关键指标、watchdog 集成）。
    - 安全注意事项。
- `docs/v8/long-proof-r7-t5-ops-runbook.md`
  - 本 proof 文档。

## 验证命令与结果

完整验证日志：

- `/tmp/nexus-v8-r7-t5-ops-runbook-verify.log` — 59 lines，sha256 `31a9a4a052ec09782a04dea8ffcb6a7e14d7c25deb492a819c6ad62e58ac97d7`。
- HEAD：`5cf75df fix(v8-r5): route standard completion through FSM`。

| 命令 | 结果 |
|---|---|
| `npm test -- --runInBand tests/v8` | passed：15 suites / 75 tests。 |
| `npx prisma validate` | passed：schema valid。 |
| `npm run build` | passed：`tsc` exit 0。 |
| `git diff --check` | passed：no whitespace error。 |
| source boundary scan (`scripts/`, `docs/v8/ops-health-runbook.md`) | passed：`data/nexus.db` 引用仅出现在只读 `stat`/`ls`/`cp backup` 上下文；无 `better-sqlite3`、`sqlite3`、`$queryRaw`、`$executeRaw` 命中。 |
| pollution status scan | passed：`NO_POLLUTION` — 未新增/修改 DB、SQLite、dist、node_modules、secrets、proof JSON、`.env`。 |
| `bash scripts/health-check.sh --quick` | 执行成功，输出 22 checks / 4 critical（nexus-api/nexus-daemon 容器当前未运行 — 开发环境常态） / 2 warnings。 |
| `bash scripts/health-check.sh --json` | 执行成功，输出合法 JSON 结构，含 `status`/`criticals`/`warnings`/`results` 字段。 |

## 已实现内容

1. **综合健康检查脚本** (`scripts/health-check.sh`)：
   - 7 个检查段，覆盖 Docker / systemd / API / Daemon / DB / 文件系统 / 资源。
   - 支持 `--quick` 与 `--json` 输出模式。
   - 退出码语义化（0/1/2），便于 cronjob/watchdog 判断。
   - 所有操作只读，不修改系统状态。

2. **systemd unit 文件** (API + Daemon)：
   - API Server：HTTP `/health` 健康探针 + 自动重启 + 资源限制 + 安全加固。
   - Daemon：journald `[Tick Summary]` 检测 + WatchdogSec=600 + 自动重启 + 资源限制。
   - Daemon 声明对 API 的依赖（After + Requires + PartOf）。

3. **完整运维手册** (`docs/v8/ops-health-runbook.md`)：
   - 两种部署形态（Docker Compose / systemd）的完整健康检查 SOP。
   - 故障诊断流程图（ASCII）。
   - 5 个标准操作手册（重启、升级、备份、日志轮转、紧急回滚）。
   - 监控指标与告警阈值建议。
   - watchdog/patrol 集成指引（与 R7-T1 `project_cronjobs` registry + R7-T4 `renderPrompt()` 对接）。

4. **边界合规**：
   - 不引入生产 DB 操作、不回退 legacy DAL、不引入 `.env`/secrets/proof JSON 污染。
   - `data/nexus.db` 引用仅出现在只读观测上下文（`stat`/`ls`/`cp backup`）。

## 剩余风险

1. **健康检查脚本中 `data/nexus.db` 引用**：虽然仅做 `stat` 文件存在性检查（不打开/不读写），但严格来说文件名出现在 OPS 脚本中。如后续需要零文件名引用，可改为通过 Prisma Client 做连接性检查。当前评估为可接受 — OPS 脚本不属于 V8 主线数据流。
2. **当前 nexus-api / nexus-daemon 容器未运行**：4 个 CRITICAL 均因为 Docker 容器当前未启动（开发环境常态，容器自 2026-05-03 后未重新构建启动）。这不代表 runbook 缺陷，而是当前环境状态。
3. **systemd unit 文件尚未实际安装到 `/etc/systemd/system/`**：unit 文件仅在 `scripts/` 目录中就位，安装操作需要 PM/运维人员手动执行（符合权限红线：不自动赋予 root 操作）。
4. **工作区存在前序 R4/R5/R6/R7 累计 dirty/untracked WIP**；本卡主审范围应聚焦 `scripts/` 新增文件、`docs/v8/ops-health-runbook.md` 与本 proof。历史/未触碰文件问题仅列为非阻断观察。

## 下一阶段输入（R8）

- R8 若需要真实 watchdog/patrol worker 自动调度，应：
  1. 通过 R7-T1 `ProjectCronjobRepository.list(project_id, { status: 'active' })` 选择 eligible cronjob。
  2. 调用 R7-T4 `renderPrompt(project_id, cronjob_id, { mode: 'patrol', now, maintenance })` 获取巡检 prompt。
  3. Worker 执行 `scripts/health-check.sh --json`，解析结果生成观察报告。
  4. 观察报告通过 R6 Report queue + Artifact 写回。
  5. **严禁 watchdog/patrol 内执行修复操作**；修复必须另行派 DEV 任务并走 V8 API/service/FSM Controller。
- R8 若需要生产级告警推送，应在 watchdog worker 基础上对接 Telegram / 邮件 / Slack 通知 channel。
- R8 若需要 K8s 部署，应将健康检查脚本适配为 readinessProbe / livenessProbe HTTP handler。
