# Nexus Dispatch System

Nexus Dispatch 是一个 **API-only / SQLite SSoT / Daemon Tick Loop / WebUI 观测** 的多 Agent 调度控制平面。当前主线对齐 V8 Runtime API：所有生产主流程通过 `POST/GET /api/v1/runtime/...` 访问统一 API，SQLite 仅由 API Server/PrismaDAL 在进程内访问；Worker、PM、WebUI 不直接操作数据库。

> 安全边界：README、compose、systemd 示例均不包含真实 token、chat_id、连接串或私钥。请从 `.env.example` 复制并在目标环境本地填写。

## 1. 当前真实端口与入口

| 组件 | 默认端口/入口 | 说明 |
| --- | --- | --- |
| API Server | `PORT=8000` / `npm start` / `node dist/index.js` | Express + V8 Runtime API；`/api/v1/*` 需要 Bearer token。 |
| Daemon | `npm run daemon` / `node dist/daemon/main.js` | 按 `TICK_INTERVAL` 轮询 Runtime API；不暴露 HTTP 端口。 |
| WebUI | `3030`（Docker Nginx）或 Vite dev port | 读取 API/SSE 做观测，不写数据库。 |
| SQLite | Docker volume `nexus-sqlite-data:/data` | `DATABASE_URL=file:/data/nexus.db`，由 Prisma 使用。 |

当前仓库没有可用的 `install.sh` 一键安装脚本，也没有 Swagger UI 文档页；请使用下方 curl smoke 命令验证真实 API。

## 2. V8 Runtime API 快速索引

所有 `/api/v1/*` 请求默认需要：

```bash
-H "Authorization: Bearer <api-token>"
```

常用路径：

```text
GET  /api/v1/events/stream
GET  /api/v1/runtime/tasks/pending?project_id=nexus-dispatch
POST /api/v1/runtime/tasks/:taskId/claim
POST /api/v1/runtime/tasks/transition
POST /api/v1/runtime/runs
PATCH /api/v1/runtime/runs/:runId/status
POST /api/v1/runtime/reports
PATCH /api/v1/runtime/reports/:reportId/status
POST /api/v1/runtime/artifacts
POST /api/v1/runtime/projects/:projectId/agents
GET  /api/v1/runtime/projects/:projectId/agents
GET  /api/v1/runtime/projects/:projectId/review-policies
POST /api/v1/runtime/projects/cronjobs
GET  /api/v1/runtime/projects/:projectId/cronjobs
PATCH /api/v1/runtime/projects/:projectId/cronjobs/:cronjobId/status
POST /api/v1/runtime/blueprints/freeze
POST /api/v1/runtime/blueprints/thaw-current-phase
POST /api/v1/runtime/blueprints/advance-phase
```

旧 `/api/v1/agents/register`、`/api/v1/tasks/*` 等兼容路径仍可能存在于历史代码片段中，但生产部署与新接入应优先使用 `/api/v1/runtime/...`。

## 3. Docker Compose 部署

### 3.1 准备

```bash
git clone https://github.com/zcweah1981/Nexus-Dispatch.git /opt/projects/nexus-dispatch
cd /opt/projects/nexus-dispatch
cp .env.example .env
# 编辑 .env：至少设置 API/Daemon 共享认证 token；不要提交 .env
```

### 3.2 构建并启动

```bash
docker compose up -d --build
```

Compose 会启动：

- `nexus-api`：构建 TypeScript、执行 `prisma migrate deploy`、监听容器 `8000`，宿主机默认映射 `${NEXUS_API_PORT:-8000}`。
- `nexus-daemon`：等待 API 端口后运行 `node dist/daemon/main.js`。
- `nexus-webui`：构建 WebUI 后由 Nginx 暴露宿主机 `${NEXUS_WEBUI_PORT:-3030}`。
- `nexus-sqlite-data`：持久化 `/data/nexus.db`。

### 3.3 Compose smoke

```bash
# 容器状态
docker compose ps

# API 认证边界：无 token 应返回 401
curl -i http://localhost:${NEXUS_API_PORT:-8000}/api/v1/runtime/tasks/pending?project_id=nexus-dispatch

# API 真实业务探活：带 token 后应返回 JSON（空任务也是正常）
curl -sS \
  -H "Authorization: Bearer <api-token>" \
  "http://localhost:${NEXUS_API_PORT:-8000}/api/v1/runtime/tasks/pending?project_id=${NEXUS_PROJECT_ID:-nexus-dispatch}"

# SSE：应先返回 connected/ping；用 timeout 防止长连接占住终端
timeout 5 curl -N http://localhost:${NEXUS_API_PORT:-8000}/events/stream

# WebUI
curl -I http://localhost:${NEXUS_WEBUI_PORT:-3030}/

# 综合健康脚本（允许在首启时给出无任务/无日志 warning）
./scripts/health-check.sh --quick
```

## 4. 本地开发

```bash
npm install
cp .env.example .env
npx prisma generate
npx prisma migrate deploy
npm run build
npm start
```

另一个终端启动 Daemon：

```bash
npm run daemon
```

WebUI：

```bash
npm --prefix src/webui install
npm --prefix src/webui run build
# 开发态：npm --prefix src/webui run dev
```

## 5. Worker Agent 注册

Worker 是外部执行节点，不打包进 Nexus 主控容器。注册走 Runtime API：

```bash
curl -sS -X POST "http://localhost:${NEXUS_API_PORT:-8000}/api/v1/runtime/projects/${NEXUS_PROJECT_ID:-nexus-dispatch}/agents" \
  -H "Authorization: Bearer <api-token>" \
  -H "Content-Type: application/json" \
  -d '{
    "agent_id": "long-coder-1",
    "endpoint": "http://worker-host:8647/v1/runs",
    "lane": "DEV",
    "dialect": "openclaw",
    "max_concurrency": 1,
    "status": "online"
  }'
```

Worker endpoint 至少需要能接收 Daemon 下发的 HTTP POST；是否另有 `/health` 取决于具体 Worker 实现，Nexus 主线调度以 Runtime API 中登记的 `status/lane/endpoint` 为准。

## 6. Production deployment checklist

上线前逐项确认：

- [ ] `.env` 来自 `.env.example`，真实 token/chat_id 只存在目标机本地，未进入 Git。
- [ ] `DATABASE_URL=file:/data/nexus.db` 或等价绝对路径已确认；SQLite 所在目录可写、可备份。
- [ ] `PM_API_TOKEN` 与 `API_AUTH_TOKEN` 一致或按网关策略显式设置。
- [ ] `NEXUS_PROJECT_ID` 指向当前项目，例如 `nexus-dispatch`。
- [ ] `npx prisma validate && npx prisma migrate deploy && npm run build` 通过。
- [ ] API 只通过内网/Tailscale/反向代理暴露；公网入口必须保留 Bearer token 与 TLS。
- [ ] WebUI 不展示 raw proof、token、chat_id、run_id 等运行时敏感标识。
- [ ] Daemon 只使用 Runtime API 操作任务状态；Cron 启停只通过 `project_cronjobs` registry 审核后由外部 scheduler adapter 执行。
- [ ] 已配置日志轮转、SQLite 备份、磁盘告警、进程自启（Docker restart 或 systemd）。
- [ ] 执行下方 smoke/health 命令并保存输出到部署记录。

## 7. systemd 长跑方案（裸机部署）

适合不使用 Docker 的 VPS。示例 unit 在 `scripts/nexus-dispatch-api.service` 与 `scripts/nexus-dispatch-daemon.service`。

```bash
sudo useradd --system --home /opt/projects/nexus-dispatch --shell /usr/sbin/nologin nexus || true
sudo mkdir -p /opt/projects/nexus-dispatch/data /opt/projects/nexus-dispatch/logs
sudo chown -R nexus:nexus /opt/projects/nexus-dispatch

cd /opt/projects/nexus-dispatch
sudo -u nexus npm ci
sudo -u nexus npm --prefix src/webui ci
sudo -u nexus npm --prefix src/webui run build
sudo -u nexus npx prisma migrate deploy
sudo -u nexus npm run build

sudo cp scripts/nexus-dispatch-api.service /etc/systemd/system/
sudo cp scripts/nexus-dispatch-daemon.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now nexus-dispatch-api.service
sudo systemctl enable --now nexus-dispatch-daemon.service

systemctl status nexus-dispatch-api.service --no-pager
systemctl status nexus-dispatch-daemon.service --no-pager
journalctl -u nexus-dispatch-daemon -n 80 --no-pager
```

启停策略：API 先启动、Daemon 后启动；停止时先停 Daemon 再停 API，避免 tick 中途失败。

```bash
sudo systemctl stop nexus-dispatch-daemon.service
sudo systemctl restart nexus-dispatch-api.service
sudo systemctl start nexus-dispatch-daemon.service
```

## 8. Telegram delivery 配置

Nexus 的派单可见通知遵循项目红线：**由被派 Agent 自己的 bot 发送到群组**，不是 Daemon/PM 代发。Daemon 读取 `AGENT_NOTIFICATIONS`，按 `agent_id` 找对应 bot 配置。示例只使用占位符：

```bash
AGENT_NOTIFICATIONS='{
  "long-coder-1": {"bot_token": "${LONG_CODER_BOT_TOKEN}", "chat_id": "${NEXUS_GROUP_CHAT_ID}"},
  "shun-designer-1": {"bot_token": "${SHUN_DESIGNER_BOT_TOKEN}", "chat_id": "${NEXUS_GROUP_CHAT_ID}"}
}'
```

生产建议：

1. 在 systemd `EnvironmentFile` 或 Docker secret/env 中注入真实值。
2. 不在 README、compose、Git tracked 文件、日志中打印真实 token/chat_id。
3. 每个 Agent 使用自己的 bot token；没有配置时 Daemon 静默跳过可见通知，但 Runtime proof/report 仍应落库。
4. 可见消息只给人类读：完整 task/run/dispatch/trace 追踪进入 DB artifact/report，不进入群组正文。

## 9. Cron scheduler adapter 边界

`project_cronjobs` 是项目级 registry，不等于真实后台 cronjob 已启动。当前边界：

- Runtime API 负责绑定、查询、状态更新：`active | paused | disabled`。
- `enabled_policy` 用于 adapter 筛选：`always_on | manual | project_active | maintenance_only`。
- Telegram session 只选择当前项目，不自动 start/stop cronjob。
- Daemon tick 不应直接调用 `cronjob.start/stop/pause/resume`。
- 真正的 scheduler adapter 必须先读取 `/api/v1/runtime/projects/:projectId/cronjobs?eligible=true`，再按项目校验后的 registry 决定是否启动外部 Hermes cronjob。

推荐启停流程：

```bash
# 暂停 registry（不直接 kill 外部进程，由 adapter 收敛）
curl -sS -X PATCH \
  "http://localhost:${NEXUS_API_PORT:-8000}/api/v1/runtime/projects/${NEXUS_PROJECT_ID:-nexus-dispatch}/cronjobs/<cronjob_id>/status" \
  -H "Authorization: Bearer <api-token>" \
  -H "Content-Type: application/json" \
  -d '{"status":"paused"}'

# adapter 下一轮读取 eligible 列表后停止/跳过对应外部 job，并写入自己的 proof。
```

## 10. 故障排查

| 现象 | 检查命令 | 常见原因/处理 |
| --- | --- | --- |
| API 起不来 | `docker compose logs nexus-api` / `journalctl -u nexus-dispatch-api -n 100` | `DATABASE_URL` 缺失、迁移失败、端口占用。 |
| 请求返回 401 | `确认运行环境中的 API/Daemon 共享认证 token` 并检查 header | Bearer token 未带或与 API 启动 token 不一致。 |
| Daemon 不派单 | `docker compose logs nexus-daemon --since=10m` | 无 pending task、Agent 未 online、lane 不匹配、Worker endpoint 不通。 |
| SQLite 不更新 | `docker compose exec nexus-api npx prisma validate` | volume 权限错误、错误连接到旧 `data/nexus.db`。 |
| WebUI 空白 | `curl -I http://localhost:3030/` / 浏览器 console | WebUI 未 build、API URL/SSE 路径不通、反代未转发 SSE。 |
| Telegram 没消息 | 检查 `AGENT_NOTIFICATIONS` JSON 是否可解析 | 未给对应 `agent_id` 配置 bot、token/chat_id 错误、Bot 无群发权限。 |
| Cron 没执行 | 查询 `/runtime/projects/:projectId/cronjobs?eligible=true` | registry 为 paused/disabled、policy 不匹配、外部 adapter 未运行。 |

## 11. 验证命令汇总

```bash
npm run build
npm test -- --runInBand tests/v8/v8_retire_legacy_routes.test.ts
npx prisma validate
npm --prefix src/webui run build
git diff --check
./scripts/health-check.sh --quick || true
```

`health-check.sh` 在空环境或未启动 Docker/systemd 时可能返回 warning/critical；它用于部署机巡检，不代表源码构建失败。源码交付以 build/test/prisma/diff-check 为准。
