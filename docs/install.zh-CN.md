# 安装与部署指南

<p align="center">
  <a href="./install.md">English</a> · <b>简体中文</b> · <a href="./install.zh-TW.md">繁體中文</a>
</p>

> R13_API_SERVER_DEPLOY_GUIDE_CONTRACT
>
> 本文是 API Server 的完整安装与部署指南。产品概览请参阅 [README.zh-CN.md](../README.zh-CN.md)。
>
> `docs/assets/guide/` 下的图片资源由三语文档共享；若图片内仍有英文标签，以本页中文标题、说明和上下文为准。

![Guide cover](./assets/guide/nexus-guide-cover.jpg)

## 可视化导览

> 共享素材说明：以下部署流程图、集成图和验证截图在 English / 简体中文 / 繁體中文 三个版本中复用，避免重复维护多套截图资产。

### 部署流程

![Deployment flow](./assets/guide/deployment-flow.png)

**说明**：展示从克隆仓库、配置环境变量、构建 API/Daemon/WebUI 到完成基础验证的整体路径。

### Hermes 集成

![Hermes integration](./assets/guide/hermes-integration.png)

**说明**：展示 Hermes Agent 如何作为执行端与 Nexus Dispatch Runtime API 协同。

### OpenClaw Worker 集成

![OpenClaw integration](./assets/guide/openclaw-integration.png)

**说明**：展示 OpenClaw 风格 Worker 的注册、派单与回传 proof 闭环。

### 双系统架构图

![Dual-system architecture](./assets/guide/dual-system-architecture.png)

**说明**：强调「单 PM 大脑 + 多异构 Worker 哑执行」和 API-only 边界。

### API Server 验证截图

![API server verification proof](./assets/guide/api-server-verification-proof.png)

**说明**：该图展示部署验证形态。公开文档中不会暴露 token、chat_id 或其他敏感字段。

---

## 1. 端口与端点

| 组件 | 默认端口 / 入口 | 说明 |
| --- | --- | --- |
| API Server | `PORT=8000`，通过 `npm start` 或 `node dist/index.js` | Express + V8 Runtime API。所有 `/api/v1/*` 路由要求 Bearer token 鉴权。 |
| Daemon | `npm run daemon` / `node dist/daemon/main.js` | Tick-loop 轮询 Runtime API。不暴露 HTTP 端口。 |
| WebUI | `3030`（Docker Nginx）或 Vite 开发服务器端口 | 只读可观测性仪表盘，通过 API/SSE 读取数据，永不直接写数据库。 |
| SQLite | Docker 卷 `nexus-sqlite-data:/data` | `DATABASE_URL=file:/data/nexus.db`，由 API 进程内的 Prisma 管理。 |

系统没有一键安装脚本（`install.sh`）或 Swagger UI 页面。请使用下文的冒烟测试命令验证 API 状态。

---

## 2. V8 Runtime API 快速参考

所有 `/api/v1/*` 请求必须携带：

```bash
  -H "Authorization: Bearer $API_AUTH_TOKEN" \
```

核心端点：

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

旧版路径（`/api/v1/agents/register`、`/api/v1/tasks/*`）可能仍存在于历史代码中，但不应在生产环境使用。

---

## 3. Docker Compose 部署

### 3.1 准备

**目的**：克隆仓库并创建环境配置文件。

```bash
git clone https://github.com/zcweah1981/Nexus-Dispatch.git /opt/projects/nexus-dispatch
cd /opt/projects/nexus-dispatch
cp .env.example .env
# 编辑 .env：至少填写 API/Daemon 共享鉴权 token。绝不要将 .env 提交到 Git。
```

**预期结果**：项目目录就绪，`.env` 文件已创建。
**常见问题**：如果 `git clone` 失败，检查网络连接和 Git 认证；确保 `/opt/projects/` 目录存在且有写权限。

### 3.2 构建与启动

**目的**：使用 Docker Compose 一键构建并启动所有服务。

```bash
docker compose up -d --build
```

**预期结果**：Compose 启动以下服务：

- **nexus-api** — 编译 TypeScript，执行 `prisma migrate deploy`，监听容器端口 `8000`。宿主机端口默认为 `${NEXUS_API_PORT:-8000}`。
- **nexus-daemon** — 等待 API 健康检查通过后，运行 `node dist/daemon/main.js`。
- **nexus-webui** — 构建 WebUI，由 Nginx 在宿主机端口 `${NEXUS_WEBUI_PORT:-3030}` 上提供服务。
- **nexus-sqlite-data** — 持久化卷，存储 `/data/nexus.db`。

**成功标志**：所有容器状态为 `running` / `healthy`。

**常见问题**：
- 端口冲突：确认 8000 和 3030 端口未被占用，或在 `.env` 中修改 `NEXUS_API_PORT` / `NEXUS_WEBUI_PORT`。
- 构建失败：检查 Node.js 版本和依赖安装日志。

### 3.3 冒烟测试

**目的**：验证各服务已正常运行且鉴权生效。

```bash
# 检查容器状态
docker compose ps

# 鉴权边界测试：无 token 应返回 401
curl -i "http://localhost:${NEXUS_API_PORT:-8000}/api/v1/runtime/tasks/pending?project_id=nexus-dispatch"

# 鉴权请求：应返回 JSON（空任务列表为正常）
curl -sS \
  -H "Authorization: Bearer $API_AUTH_TOKEN" \
  "http://localhost:${NEXUS_API_PORT:-8000}/api/v1/runtime/tasks/pending?project_id=${NEXUS_PROJECT_ID:-nexus-dispatch}"

# SSE 流：应显示 connected/ping（timeout 防止终端阻塞）
timeout 5 curl -N -H "Authorization: Bearer ***" "http://localhost:${NEXUS_API_PORT:-8000}/api/v1/events/stream"

# WebUI
curl -I "http://localhost:${NEXUS_WEBUI_PORT:-3030}/"

# 综合健康检查脚本（首次启动时出现 warning 为正常）
./scripts/health-check.sh --quick
```

**成功标志**：
- `docker compose ps` 显示所有服务 `running`
- 无 token 请求返回 `401`
- 有 token 请求返回 `200` + JSON
- WebUI 返回 `200`

**常见问题**：
- 持续返回 `401`：检查 `.env` 中 `API_AUTH_TOKEN` 是否与 curl 中使用的 token 一致
- 连接被拒绝：确认容器已完全启动，等待 `start_period`（30 秒）后再试

### 3.4 从克隆到完成第一个任务

**目的**：从全新克隆到第一个任务达到 `completed` 状态的最短端到端路径。

1. **克隆并配置**

   ```bash
   git clone https://github.com/zcweah1981/Nexus-Dispatch.git /opt/projects/nexus-dispatch
   cd /opt/projects/nexus-dispatch
   cp .env.example .env
   # 填写 API_AUTH_TOKEN 和 PM_API_TOKEN 为相同的本地密钥
   ```

2. **执行数据库迁移并启动 API**

   ```bash
   npm ci
   npx prisma generate
   npx prisma migrate deploy
   npm run build
   npm start
   ```

   **预期结果**：API Server 在端口 8000 上监听，Prisma migration 完成。
   **常见问题**：`prisma migrate deploy` 失败时检查 `DATABASE_URL` 是否正确，确保 data 目录可写。

3. **在另一个终端，创建项目、注册 Worker、创建任务**

   ```bash
   export API_AUTH_TOKEN="<local-api-token>"
   export NEXUS_PROJECT_ID="nexus-dispatch"

   curl -sS -X POST "http://localhost:8000/api/v1/runtime/projects" \
     -H "Authorization: Bearer $API_AUTH_TOKEN" \
     -H "Content-Type: application/json" \
     -d '{"id":"nexus-dispatch","name":"nexus-dispatch"}'

   curl -sS -X POST "http://localhost:8000/api/v1/runtime/projects/nexus-dispatch/agents" \
     -H "Authorization: Bearer $API_AUTH_TOKEN" \
     -H "Content-Type: application/json" \
     -d '{"agent_id":"long-coder-1","endpoint":"http://worker-host:8647/v1/runs","lane":"DEV","dialect":"openclaw","max_concurrency":1,"status":"online"}'

   curl -sS -X POST "http://localhost:8000/api/v1/runtime/tasks" \
     -H "Authorization: Bearer $API_AUTH_TOKEN" \
     -H "Content-Type: application/json" \
     -d '{"project_id":"nexus-dispatch","id":"first-task","title":"First task","objective":"Verify the API Server lifecycle","lane_required":"DEV","acceptance_mode":"group_only","acceptance_criteria":["task reaches completed through Runtime API transitions"]}'
   ```

   **预期结果**：每个 curl 返回 `200` / `201` + JSON。
   **常见问题**：返回 `401` 检查 token；返回 `409` 说明项目/Agent 已存在。

4. **通过 Runtime API 驱动最小 V8 生命周期**

   ```bash
   for event in dispatch start submit_completion request_review review_pass; do
     curl -sS -X POST "http://localhost:8000/api/v1/runtime/tasks/transition" \
       -H "Authorization: Bearer $API_AUTH_TOKEN" \
       -H "Content-Type: application/json" \
       -d "{\"project_id\":\"nexus-dispatch\",\"task_id\":\"first-task\",\"event\":\"${event}\",\"proof\":{\"source\":\"install-guide-smoke\"}}"
   done
   ```

   **预期结果**：每次 transition 返回 `200`，任务状态逐步推进。

5. **验证第一个任务**

   ```bash
   curl -sS "http://localhost:8000/api/v1/runtime/tasks/first-task?project_id=nexus-dispatch" \
     -H "Authorization: Bearer $API_AUTH_TOKEN" \
   # 预期：task.status == "completed"
   ```

   **成功标志**：返回的 JSON 中 `status` 字段为 `"completed"`。

进入真实 Worker 操作时，需在注册 Worker 后启动 `npm run daemon`；Daemon 通过已注册的 Worker 端点进行派单，Worker 通过同一 Runtime API 边界提交 proof。

---

## 4. 本地开发

**目的**：搭建本地开发环境。

```bash
npm install
cp .env.example .env
npx prisma generate
npx prisma migrate deploy
npm run build
npm start
```

在另一个终端启动 Daemon：

```bash
npm run daemon
```

WebUI 开发：

```bash
npm --prefix src/webui install
npm --prefix src/webui run build
# 开发模式：npm --prefix src/webui run dev
```

**预期结果**：API 在 8000 端口监听，Daemon 在另一终端轮询。
**常见问题**：`npm install` 失败时检查 Node.js 版本（需要 Node 20+）。

---

## 5. Worker Agent 注册

**目的**：注册外部执行节点到 Nexus 控制面。

Worker 是外部执行节点——**不**包含在 Nexus 控制面容器内。通过 Runtime API 注册：

```bash
curl -sS -X POST \
  "http://localhost:${NEXUS_API_PORT:-8000}/api/v1/runtime/projects/${NEXUS_PROJECT_ID:-nexus-dispatch}/agents" \
  -H "Authorization: Bearer $API_AUTH_TOKEN" \
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

**预期结果**：返回 `200` 或 `201` + Agent 信息 JSON。

Worker 端点必须接受来自 Daemon 的 HTTP POST 派单请求。是否暴露 `/health` 端点取决于具体 Worker 实现——Nexus 根据 Runtime API 中注册的 `status`、`lane` 和 `endpoint` 字段进行调度。

**常见问题**：
- 返回 `409`：Agent ID 已存在，可先删除或更换 ID
- Worker 端点不可达：检查网络连通性和防火墙规则

---

## 6. 生产部署检查清单

上线前，逐一确认以下每一项：

- [ ] `.env` 已从 `.env.example` 复制。真实 token 和 chat_id 仅存在于目标机器——绝不进入 Git。
- [ ] `DATABASE_URL=file:/data/nexus.db`（或等效绝对路径）已确认。SQLite 目录可写且已备份。
- [ ] `PM_API_TOKEN` 与 `API_AUTH_TOKEN` 一致，或按网关策略显式设置不同值。
- [ ] `NEXUS_PROJECT_ID` 指向当前项目（如 `nexus-dispatch`）。
- [ ] `npx prisma validate && npx prisma migrate deploy && npm run build` 全部通过。
- [ ] API 仅通过内网、Tailscale 或反向代理暴露。公网端点必须强制 Bearer token 鉴权 + TLS。
- [ ] WebUI 不展示原始 proof、token、chat_id、run ID 或其他运行时敏感标识。
- [ ] Daemon 仅通过 Runtime API 驱动任务状态。Cron 启停通过 `project_cronjobs` 注册表——由外部调度器适配器审查和执行。
- [ ] 日志轮转、SQLite 备份、磁盘告警、进程自动重启（Docker restart 策略或 systemd）已配置。
- [ ] 冒烟/健康检查命令已执行，输出已保存到部署记录。

---

## 7. systemd 裸金属部署

**目的**：在无 Docker 的 VPS 上直接部署。示例服务单元文件位于 `scripts/nexus-dispatch-api.service` 和 `scripts/nexus-dispatch-daemon.service`。

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

**预期结果**：
- 两个服务均显示 `active (running)`
- API 日志显示 Express 在 8000 端口启动
- Daemon 日志显示 tick loop 正常运行

**成功标志**：`systemctl status` 显示 `active (running)`，`journalctl` 无 error。

**常见问题**：
- `nexus` 用户权限不足：确认 data/ 和 logs/ 目录归属
- migration 失败：在服务启动前手动运行 `sudo -u nexus npx prisma migrate deploy`
- 端口冲突：确认 8000 端口未被其他进程占用

启动/停止顺序：先 API，后 Daemon。重启时，先停 Daemon 再停 API，避免 tick 中途失败。

```bash
sudo systemctl stop nexus-dispatch-daemon.service
sudo systemctl restart nexus-dispatch-api.service
sudo systemctl start nexus-dispatch-daemon.service
```

---

## 8. Telegram 投递配置

Nexus 遵循严格的通知边界：**每个被派单的 Agent 通过自己的 Bot 发送通知**——Daemon 和 PM 绝不代发。Daemon 读取 `AGENT_NOTIFICATIONS` 并按 `agent_id` 查找 bot/chat 配置；可见语言不是在 Agent 上配置的。Telegram 正文语言从项目的 Runtime 设置 `visible_language` 中解析（默认 `zh-CN`，支持 `en-US`）。以下示例使用环境变量占位符：

```bash
AGENT_NOTIFICATIONS='{
  "long-coder-1": {"bot_token": "${LONG_CODER_BOT_TOKEN}", "chat_id": "${NEXUS_GROUP_CHAT_ID}"},
  "shun-designer-1": {"bot_token": "${SHUN_DESIGNER_BOT_TOKEN}", "chat_id": "${NEXUS_GROUP_CHAT_ID}"}
}'
```

项目创建后，通过 Runtime API 设置项目可见语言：

```bash
curl -sS -X PATCH "$PM_API_URL/runtime/projects/nexus-dispatch/settings/visible-language" \
  -H "Authorization: Bearer $API_AUTH_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"visible_language":"en-US"}'
```

生产环境指南：

1. 通过 systemd `EnvironmentFile`、Docker secrets 或环境变量注入真实 bot/chat 值。
2. 绝不在 README、compose 文件、Git 跟踪文件或日志中打印真实 token 或 chat_id。
3. `AGENT_NOTIFICATIONS` 仅包含凭证（`bot_token`、`chat_id`）。不要在此添加语言字段；语言通过 `visible_language` 在项目维度设置。
4. 每个 Agent 使用自己的 bot token。如果某个 Agent 没有配置，Daemon 静默跳过可见通知——Runtime proof 和 report 仍然会写入数据库。
5. 可见消息仅供人类阅读。完整的 task/run/dispatch/trace 标识符留在 DB 的 artifact 和 report 中——绝不进入群聊文本。

---

## 9. Cron 调度器适配器边界

`project_cronjobs` 表是项目级注册表——表中有一行**不代表**外部 cronjob 正在运行。当前边界：

- Runtime API 处理绑定、查询和状态更新：`active | paused | disabled`。
- `enabled_policy` 控制适配器过滤：`always_on | manual | project_active | maintenance_only`。
- Telegram session 只选择当前项目——不会自动启停 cronjob。
- Daemon tick **不得**直接调用 `cronjob.start/stop/pause/resume`。
- 真实的调度器适配器必须先读取 `/api/v1/runtime/projects/:projectId/cronjobs?eligible=true`，再根据项目验证后的注册表决定是否启动外部 Hermes cronjob。

推荐的暂停流程：

```bash
# 暂停注册（不会终止外部进程——适配器在下次读取时收敛）
curl -sS -X PATCH \
  "http://localhost:${NEXUS_API_PORT:-8000}/api/v1/runtime/projects/${NEXUS_PROJECT_ID:-nexus-dispatch}/cronjobs/<cronjob_id>/status" \
  -H "Authorization: Bearer $API_AUTH_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"status":"paused"}'
```

---

## 10. 日志、迁移与运维操作

### 10.1 日志

Docker Compose：

```bash
docker compose logs -f --tail=100 nexus-api
docker compose logs -f --tail=100 nexus-daemon
docker compose logs -f --tail=100 nexus-webui
```

systemd：

```bash
journalctl -u nexus-dispatch-api -f
journalctl -u nexus-dispatch-daemon -f --since "10 minutes ago"
journalctl -u nexus-dispatch-api -n 100 --no-pager
```

Telegram 可见文本保持简短且人类可读；完整的运行时 ID 和原始 proof 留在 Runtime DB 的 artifact/report 中。

### 10.2 数据库迁移

API Server 拥有 SQLite/Prisma 的唯一操作权。Worker、WebUI 和 PM Daemon 禁止直接打开 SQLite。

```bash
npx prisma validate
npx prisma migrate deploy
npm run validate:api-deploy -- --skip-health
```

Docker entrypoint 在执行 `node dist/index.js` 之前运行 `npx prisma migrate deploy`，除非显式设置 `SKIP_PRISMA_MIGRATE=1`（用于受控恢复场景）。

**常见问题**：
- 迁移失败：检查 `DATABASE_URL` 和 data 目录权限
- Schema 不匹配：运行 `npx prisma validate` 检查 schema 文件

### 10.3 PM Daemon 启停

本地开发：

```bash
npm run daemon
```

systemd：

```bash
sudo systemctl stop nexus-dispatch-daemon.service
sudo systemctl start nexus-dispatch-daemon.service
sudo systemctl restart nexus-dispatch-daemon.service
```

重启顺序：先停 Daemon，再重启/迁移 API，最后启动 Daemon。避免 API 迁移/重启期间 Daemon tick 导致异常。

### 10.4 验证脚本

`npm run validate:api-deploy` 运行 Prisma 验证、R13 部署指南契约和 V8 Runtime API 边界子集。默认情况下，如果导出了 `API_AUTH_TOKEN` 或 `PM_API_TOKEN`，还会探测运行中的 API。

```bash
npm run validate:api-deploy -- --skip-health     # source/Prisma/test validation only
API_AUTH_TOKEN="<local-api-token>" npm run validate:api-deploy
npm run validate:api-deploy -- --json --skip-health
```

---

## 11. 故障排除

| 症状 | 检查命令 | 常见原因 / 修复 |
| --- | --- | --- |
| API 无法启动 | `docker compose logs nexus-api` / `journalctl -u nexus-dispatch-api -n 100` | 缺少 `DATABASE_URL`、迁移失败、端口冲突 |
| 请求返回 401 | 检查运行环境中的共享鉴权 token 和请求头 | Bearer token 缺失或不匹配 |
| Daemon 不派单 | `docker compose logs nexus-daemon --since=10m` | 无待处理任务、Agent 不在线、泳道不匹配、Worker 端点不可达 |
| SQLite 不更新 | `docker compose exec nexus-api npx prisma validate` | 卷权限问题、`data/nexus.db` 路径过期 |
| WebUI 空白 | `curl -I http://localhost:3030/` / 浏览器控制台 | WebUI 未构建、API/SSE URL 不可达、反向代理未转发 SSE |
| Telegram 静默 | 检查 `AGENT_NOTIFICATIONS` JSON 解析 | Agent 缺少 bot 配置、token/chat_id 错误、bot 缺少群组权限 |
| Cron 不执行 | 查询 `/runtime/projects/:projectId/cronjobs?eligible=true` | 注册表已暂停/禁用、策略不匹配、外部适配器未运行 |

---

## 12. 验证命令

```bash
npm run validate:api-deploy -- --skip-health
npm run build
npm test -- --runInBand tests/v8/v8_api_server_deploy_guide.test.ts tests/v8/v8_retire_legacy_routes.test.ts tests/v8/v8_runtime_api_route_boundary.test.ts
npx prisma validate
npm --prefix src/webui run build
docker compose config --quiet
git diff --check
./scripts/health-check.sh --quick || true
```

`validate-api-deploy.js` 面向源码/测试，可在开发者机器安全运行。`health-check.sh` 在空环境或非 Docker/systemd 环境下可能返回 warning 或 critical 状态——它是部署机器巡检工具。源码级别的交付验证由 build、test、prisma 和 diff-check 负责。
