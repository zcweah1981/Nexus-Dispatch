# 安装与部署指南

<p align="center">
  <a href="./install.md">English</a> · <b>简体中文</b> · <a href="./install.zh-TW.md">繁體中文</a>
</p>

> 本指南带你完成 **Nexus Dispatch** 的安装与运行——一个单中枢大脑、多 Worker 哑终端的任务派单调度系统。完成后，你将拥有一个运行中的 API Server、Daemon 调度器和 WebUI 仪表盘。
>
> R13_API_SERVER_DEPLOY_GUIDE_CONTRACT
>
> 产品概览请参阅 [README.md](../README.md)。

![Guide cover](./assets/guide/nexus-guide-cover.jpg)

---

## 你将得到什么

Nexus Dispatch 由三个协同工作的服务组成：

| 服务 | 作用 | 是否对外暴露 |
| --- | --- | --- |
| **API Server** | 中枢大脑——接收任务、管理状态、执行鉴权 | 是，端口 `8000` |
| **Daemon** | 定时轮询调度器——将任务派发给已注册的 Worker | 无公开端口（仅内部通信） |
| **WebUI** | 只读仪表盘——展示任务、Agent 和运行历史 | 是，端口 `3030` |

所有数据存储在单个 **SQLite** 文件中——无需外部数据库服务器。

---

## 端口与环境变量速览

开始之前，先了解完整的端口与配置映射：

| 组件 | 默认端口 | 覆盖变量 | 说明 |
| --- | --- | --- | --- |
| API Server | `8000` | `NEXUS_API_PORT` | Express + V8 Runtime。所有路由要求 Bearer token 鉴权。 |
| WebUI | `3030` | `NEXUS_WEBUI_PORT` | Nginx 提供服务的 SPA（Docker）或 Vite 开发服务器（本地）。 |
| Daemon | —（无） | — | 内部轮询 API，不暴露 HTTP 端口。 |
| SQLite | — | `DATABASE_URL` | 默认：`file:/data/nexus.db`。Docker 中为持久化卷。 |

**Docker Compose 卷**：key `nexus-sqlite-data`（`name: nexus-dispatch-sqlite`）→ 挂载到 API 和 Daemon 容器内的 `/data` 目录。

**关键环境变量**（在 `.env` 中设置）：

| 变量 | 必填 | 用途 |
| --- | --- | --- |
| `API_AUTH_TOKEN` | ✅ | API 鉴权的共享密钥。 |
| `PM_API_TOKEN` | ✅ | Daemon 调用 API 时使用的 token。通常与 `API_AUTH_TOKEN` 一致。 |
| `NEXUS_PROJECT_ID` | ✅ | 项目范围（默认：`nexus-dispatch`）。 |
| `DATABASE_URL` | — | SQLite 路径。默认：`file:/data/nexus.db`。 |
| `TICK_INTERVAL` | — | Daemon 轮询间隔（毫秒）。默认：`5000`。 |
| `AGENT_NOTIFICATIONS` | — | 按 Agent 配置的 Telegram bot 配置。参见 [Telegram 投递配置](#telegram-投递配置)。 |

---

## 部署拓扑

![Dual-system architecture](./assets/guide/dual-system-architecture.png)

**各组件如何协作**：PM（你）通过 API 或 Agent 创建任务。Daemon 轮询待处理任务并派发给已注册的 Worker。Worker 执行任务并通过同一 API 提交 proof 回传。WebUI 通过 API/SSE 读取所有数据——它永远不会直接写入数据库。

---

## 方式一：Docker Compose（推荐）

最快的启动路径。一条命令完成构建和启动。

### 第 1 步 — 克隆并配置

```bash
git clone https://github.com/zcweah1981/Nexus-Dispatch.git /opt/projects/nexus-dispatch
cd /opt/projects/nexus-dispatch
cp .env.example .env
```

编辑 `.env`，**至少填写**：
- `API_AUTH_TOKEN` — 一个足够长的随机字符串（例如 `openssl rand -hex 32`）
- `PM_API_TOKEN` — 设为与 `API_AUTH_TOKEN` **相同的值**

> ⚠️ 绝对不要将 `.env` 提交到 Git。真实的 token 和 chat ID 只存在于目标机器上。

### 第 2 步 — 构建并启动

```bash
docker compose up -d --build
```

**启动内容**（按依赖顺序）：

| 容器 | 构建自 | 运行内容 |
| --- | --- | --- |
| `nexus-api` | `Dockerfile`（target: `api`） | 编译 TypeScript，运行 `prisma migrate deploy`，然后在端口 8000 上启动 `node dist/index.js` |
| `nexus-daemon` | 与 API 相同的镜像 | 等待 API 健康检查通过，然后运行 `node dist/daemon/main.js` |
| `nexus-webui` | `Dockerfile`（target: `webui`） | 构建 SPA，由 Nginx 在端口 3030 上提供服务 |

API 容器包含一个健康检查，每 30 秒 ping 自身的 `/api/v1/runtime/tasks/pending` 端点。Daemon 等待此健康检查通过后才会启动。

### 第 3 步 — 验证服务是否正常

运行以下命令确认所有服务健康：

```bash
# 检查容器状态——三个都应显示 "Up" 或 "healthy"
docker compose ps
```

```bash
# 测试鉴权边界——应返回 401（未提供 token）
curl -i "http://localhost:8000/api/v1/runtime/tasks/pending?project_id=nexus-dispatch"
# 预期：HTTP/1.1 401 Unauthorized
```

```bash
# 测试已鉴权请求——应返回 JSON（全新安装时空列表为正常）
curl -sS \
  -H "Authorization: Bearer $API_AUTH_TOKEN" \
  "http://localhost:8000/api/v1/runtime/tasks/pending?project_id=nexus-dispatch"
# 预期：{"data":[],"pagination":{...}}
```

```bash
# 测试 WebUI——应返回 200
curl -I "http://localhost:3030/"
# 预期：HTTP/1.1 200 OK
```

```bash
# 运行内置健康检查脚本（首次启动出现警告为正常）
./scripts/health-check.sh --quick
```

![Deployment flow](./assets/guide/deployment-flow.png)

---

## 方式二：Dockerfile / 手动容器

如果你更倾向于单独构建和运行容器（不使用 Compose），按以下步骤操作。

### 构建镜像

Dockerfile 包含两个构建目标：

```bash
# 构建 API 镜像
docker build --target api -t nexus-dispatch-api:local .

# 构建 WebUI 镜像
docker build --target webui -t nexus-dispatch-webui:local .
```

### 运行 API 容器

```bash
docker run -d --name nexus-api \
  -p 8000:8000 \
  -v nexus-sqlite-data:/data \
  -e DATABASE_URL="file:/data/nexus.db" \
  -e API_AUTH_TOKEN="$API_AUTH_TOKEN" \
  -e PM_API_TOKEN="$API_AUTH_TOKEN" \
  -e NEXUS_PROJECT_ID="nexus-dispatch" \
  --restart unless-stopped \
  nexus-dispatch-api:local
```

入口脚本（`scripts/docker-entrypoint.sh`）会自动运行 `prisma migrate deploy`，除非设置了 `SKIP_PRISMA_MIGRATE=1`。之后在端口 8000 上启动 API Server。

### 运行 Daemon 容器

```bash
docker run -d --name nexus-daemon \
  -v nexus-sqlite-data:/data \
  -e DATABASE_URL="file:/data/nexus.db" \
  -e PM_API_URL="http://<API_HOST>:8000/api/v1" \
  -e PM_API_TOKEN="$API_AUTH_TOKEN" \
  -e NEXUS_PROJECT_ID="nexus-dispatch" \
  --restart unless-stopped \
  nexus-dispatch-api:local daemon
```

> 注意：Daemon 使用与 API **相同的镜像**——只是运行不同的命令（`daemon` 而非 `api`）。

### 运行 WebUI 容器

```bash
docker run -d --name nexus-webui \
  -p 3030:80 \
  --restart unless-stopped \
  nexus-dispatch-webui:local
```

---

## 方式三：本地开发 / 本地源码开发

适用于开发、贡献代码或不使用 Docker 的场景。

### 前置条件

- **Node.js** 20+（推荐 LTS 版本）
- **npm** 10+
- **OpenSSL**（Prisma 依赖）

### 启动 API 和 Daemon

```bash
cd /opt/projects/nexus-dispatch
npm install
cp .env.example .env
# 编辑 .env，填入你的 token
npx prisma generate
npx prisma migrate deploy
npm run build
npm start
```

> `npm start` 后，API 监听 `http://localhost:8000`。

在**另一个终端**中启动 Daemon：

```bash
npm run daemon
```

### 启动 WebUI（开发模式）

```bash
npm --prefix src/webui install
npm --prefix src/webui run dev
# 或构建生产版本：npm --prefix src/webui run build
```

> Vite 开发服务器在 `src/webui/vite.config.ts` 中配置为 `http://localhost:3000`。Docker 默认将 Nginx 提供的生产构建发布到 `http://localhost:3030`。

---

## 进阶：从零到完成第一个任务

从全新安装到第一个任务完成的最短路径：

### 1. 创建项目

```bash
curl -sS -X POST "http://localhost:8000/api/v1/runtime/projects" \
  -H "Authorization: Bearer $API_AUTH_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"id":"nexus-dispatch","name":"nexus-dispatch"}'
# 预期：{"data":{"id":"nexus-dispatch",...}}
```

### 2. 注册 Worker

Worker 是**外部**执行节点——不包含在 Nexus 容器中。通过 API 注册：

```bash
curl -sS -X POST "http://localhost:8000/api/v1/runtime/projects/nexus-dispatch/agents" \
  -H "Authorization: Bearer $API_AUTH_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "agent_id": "long-coder-1",
    "endpoint": "http://worker-host:8647/v1/runs",
    "lane": "DEV",
    "dialect": "openclaw",
    "soul_prompt": "Execute assigned DEV tasks and return structured proof.",
    "tools_allowed": ["terminal", "file", "web"],
    "status": "online"
  }'
# 预期：{"data":{"agent_id":"long-coder-1",...}}
```

### 3. 创建任务

```bash
curl -sS -X POST "http://localhost:8000/api/v1/runtime/tasks" \
  -H "Authorization: Bearer $API_AUTH_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "project_id": "nexus-dispatch",
    "id": "first-task",
    "title": "First task",
    "objective": "Verify the API Server lifecycle",
    "lane_required": "DEV",
    "acceptance_mode": "group_only",
    "acceptance_criteria": ["task reaches completed through Runtime API transitions"]
  }'
# 预期：{"data":{"id":"first-task","status":"created",...}}
```

### 4. 驱动生命周期

```bash
for event in dispatch start submit_completion request_review review_pass; do
  curl -sS -X POST "http://localhost:8000/api/v1/runtime/tasks/transition" \
    -H "Authorization: Bearer $API_AUTH_TOKEN" \
    -H "Content-Type: application/json" \
    -d "{\"project_id\":\"nexus-dispatch\",\"task_id\":\"first-task\",\"event\":\"${event}\",\"proof\":{\"source\":\"install-guide-smoke\"}}"
done
```

### 5. 验证

```bash
curl -sS "http://localhost:8000/api/v1/runtime/tasks/first-task?project_id=nexus-dispatch" \
  -H "Authorization: Bearer $API_AUTH_TOKEN"
# 预期：task.status == "completed"
```

> 生产环境中，启动 Daemon（`npm run daemon` 或 Docker Daemon 容器）。它会自动将任务派发给已注册的 Worker。Worker 通过同一 Runtime API 提交 proof 回传。

![API server verification proof](./assets/guide/api-server-verification-proof.png)

---

## Worker Agent 集成

![OpenClaw integration](./assets/guide/openclaw-integration.png)

Worker 是独立进程，接受来自 Daemon 的 HTTP POST 派单请求。注册 Worker 时注意：

- **`endpoint`** 必须能从 Daemon 容器（或宿主机）访问到。
- **`lane`** 必须与任务的 `lane_required` 字段匹配。
- **`status`** 控制 Daemon 是否将该 Worker 纳入派单范围（`online` | `offline`）。
- **`dialect`** 定义通信协议格式（如 `openclaw`、`hermes`）。

Daemon 基于 `status`、`lane` 和 `endpoint` 进行调度。Worker 是否暴露 `/health` 端点取决于具体实现。

---

## Hermes 集成

![Hermes integration](./assets/guide/hermes-integration.png)

Hermes Agent 实例以 Worker 身份接入。它们轮询 Runtime API 获取待处理任务，执行后通过同一 API 提交 proof。集成完全基于 API——Hermes 不直接操作 SQLite。

---

## 裸金属部署（systemd）

适用于没有 Docker 的 VPS。示例服务单元文件位于 `scripts/` 目录。

### 安装

```bash
# 创建专用系统用户
sudo useradd --system --home /opt/projects/nexus-dispatch --shell /usr/sbin/nologin nexus || true
sudo mkdir -p /opt/projects/nexus-dispatch/data /opt/projects/nexus-dispatch/logs
sudo chown -R nexus:nexus /opt/projects/nexus-dispatch

# 以 nexus 用户构建
cd /opt/projects/nexus-dispatch
sudo -u nexus npm ci
sudo -u nexus npm --prefix src/webui ci
sudo -u nexus npm --prefix src/webui run build
sudo -u nexus npx prisma migrate deploy
sudo -u nexus npm run build

# 安装并启动服务
sudo cp scripts/nexus-dispatch-api.service /etc/systemd/system/
sudo cp scripts/nexus-dispatch-daemon.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now nexus-dispatch-api.service
sudo systemctl enable --now nexus-dispatch-daemon.service
```

### 验证

```bash
systemctl status nexus-dispatch-api.service --no-pager
systemctl status nexus-dispatch-daemon.service --no-pager
```

### 重启顺序

始终先停 Daemon，再重启 API，以避免轮询中途失败：

```bash
sudo systemctl stop nexus-dispatch-daemon.service
sudo systemctl restart nexus-dispatch-api.service
sudo systemctl start nexus-dispatch-daemon.service
```

---

## Telegram 投递配置

Nexus 遵循严格的通知边界：**每个 Agent 通过自己的 bot 发送通知**——Daemon 绝不代发。

在 `AGENT_NOTIFICATIONS` 中配置各 Agent 的投递方式：

```bash
AGENT_NOTIFICATIONS='{
  "long-coder-1": {"bot_token": "BOT_TOKEN_FOR_LONG", "chat_id": "GROUP_CHAT_ID"},
  "shun-designer-1": {"bot_token": "BOT_TOKEN_FOR_SHUN", "chat_id": "GROUP_CHAT_ID"}
}'
```

**规则**：
1. 通过 systemd `EnvironmentFile`、Docker secrets 或环境变量注入真实值。
2. 绝不在 README、compose 文件或日志中打印真实 token 或 chat ID。
3. 语言按项目维度设置（非按 Agent），在项目创建后配置：

```bash
curl -sS -X PATCH "$PM_API_URL/runtime/projects/nexus-dispatch/settings/visible-language" \
  -H "Authorization: Bearer $API_AUTH_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"visible_language":"zh-CN"}'
```

4. 如果某个 Agent 没有配置 bot，Daemon 会静默跳过通知——proof 仍会写入数据库。
5. 可见消息仅供人类阅读。完整的 task/run/trace ID 留在 DB artifacts 中。

---

## Cron 调度器适配器

`project_cronjobs` 表是一个**注册表**——表中存在一行并不代表外部 cronjob 正在运行。

- Runtime API 负责绑定、查询和状态更新（`active` | `paused` | `disabled`）。
- `enabled_policy` 控制适配器过滤：`always_on` | `manual` | `project_active` | `maintenance_only`。
- Telegram session 只选择当前项目——不会自动启停 cronjob。
- Daemon tick **不得**直接调用 `cronjob.start/stop/pause/resume`。

通过注册表暂停 cronjob（不会终止外部进程）：

```bash
curl -sS -X PATCH \
  "http://localhost:8000/api/v1/runtime/projects/nexus-dispatch/cronjobs/<cronjob_id>/status" \
  -H "Authorization: Bearer $API_AUTH_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"status":"paused"}'
```

---

## 日志与运维

### 查看日志

**Docker Compose**：

```bash
docker compose logs -f --tail=100 nexus-api
docker compose logs -f --tail=100 nexus-daemon
docker compose logs -f --tail=100 nexus-webui
```

**systemd**：

```bash
journalctl -u nexus-dispatch-api -f
journalctl -u nexus-dispatch-daemon -f --since "10 minutes ago"
```

### 数据库迁移

API Server 独占 SQLite/Prisma 操作权。Worker、WebUI 和 Daemon 禁止直接打开 SQLite。

```bash
npx prisma validate
npx prisma migrate deploy
npm run validate:api-deploy -- --skip-health
```

Docker 入口脚本自动运行 `prisma migrate deploy`，除非设置了 `SKIP_PRISMA_MIGRATE=1`。

### 验证脚本

```bash
# 仅 source/Prisma/测试验证（不探测运行中的 API）
npm run validate:api-deploy -- --skip-health

# 包含运行中 API 健康检查的完整验证
API_AUTH_TOKEN="$API_AUTH_TOKEN" npm run validate:api-deploy

# JSON 格式输出
npm run validate:api-deploy -- --json --skip-health
```

---

## 故障排除

| 症状 | 检查命令 | 可能原因与解决 |
| --- | --- | --- |
| API 无法启动 | `docker compose logs nexus-api` | 缺少 `DATABASE_URL`、迁移失败或端口冲突。 |
| 请求返回 401 | 检查环境变量和 `Authorization` 请求头中的 token | Bearer token 缺失，或 `API_AUTH_TOKEN` 与 `PM_API_TOKEN` 不匹配。 |
| Daemon 不派单 | `docker compose logs nexus-daemon --since=10m` | 没有待处理任务、Agent 非 `online`、lane 不匹配，或 Worker 端点不可达。 |
| SQLite 未更新 | `docker compose exec nexus-api npx prisma validate` | 卷权限问题或 `data/nexus.db` 路径过期。 |
| WebUI 空白 | `curl -I http://localhost:3030/` | WebUI 未构建、API/SSE URL 不可达，或反向代理未转发 SSE。 |
| Telegram 无通知 | 检查 `AGENT_NOTIFICATIONS` JSON | 该 Agent 缺少 bot 配置、token/chat_id 错误，或 bot 没有群组权限。 |
| Cron 不执行 | 查询 `/runtime/projects/:pid/cronjobs?eligible=true` | 注册表已暂停/禁用、策略不匹配，或外部适配器未运行。 |

---

## 生产环境检查清单

上线前，逐项确认：

- [ ] `.env` 已从 `.env.example` 复制。真实 token 仅存在于目标机器——绝不进入 Git。
- [ ] `DATABASE_URL=file:/data/nexus.db` 已确认。SQLite 目录可写且已备份。
- [ ] `PM_API_TOKEN` 与 `API_AUTH_TOKEN` 一致，或按网关策略显式设置不同值。
- [ ] `NEXUS_PROJECT_ID` 指向当前项目。
- [ ] `npx prisma validate && npx prisma migrate deploy && npm run build` 全部通过。
- [ ] API 仅通过内网、Tailscale 或带 TLS 的反向代理暴露。
- [ ] WebUI 不展示原始 token、chat ID、run ID 或其他敏感标识。
- [ ] Daemon 仅通过 Runtime API 驱动任务状态。Cron 启停通过 `project_cronjobs` 注册表操作。
- [ ] 日志轮转、SQLite 备份、磁盘告警和进程自动重启已配置。
- [ ] 冒烟/健康检查命令已执行，输出已保存到部署记录。

---

## V8 Runtime API 快速参考

所有 `/api/v1/*` 请求要求：

```
Authorization: Bearer <YOUR_RUNTIME_TOKEN>
```

| 方法 | 端点 | 用途 |
| --- | --- | --- |
| GET | `/api/v1/events/stream` | SSE 事件流 |
| GET | `/api/v1/runtime/tasks/pending?project_id=...` | 列出待处理任务 |
| POST | `/api/v1/runtime/tasks/:taskId/claim` | 认领任务 |
| POST | `/api/v1/runtime/tasks/transition` | 转换任务状态 |
| POST | `/api/v1/runtime/runs` | 创建运行 |
| PATCH | `/api/v1/runtime/runs/:runId/status` | 更新运行状态 |
| POST | `/api/v1/runtime/reports` | 提交报告 |
| PATCH | `/api/v1/runtime/reports/:reportId/status` | 更新报告状态 |
| POST | `/api/v1/runtime/artifacts` | 上传 artifact |
| POST | `/api/v1/runtime/projects/:projectId/agents` | 注册 Agent |
| GET | `/api/v1/runtime/projects/:projectId/agents` | 列出已注册 Agent |
| GET | `/api/v1/runtime/projects/:projectId/review-policies` | 获取审核策略 |
| POST | `/api/v1/runtime/projects/cronjobs` | 注册 cronjob |
| GET | `/api/v1/runtime/projects/:projectId/cronjobs` | 列出 cronjob |
| PATCH | `/api/v1/runtime/projects/:projectId/cronjobs/:cronjobId/status` | 更新 cronjob 状态 |
| POST | `/api/v1/runtime/blueprints/freeze` | 冻结当前阶段 |
| POST | `/api/v1/runtime/blueprints/thaw-current-phase` | 解冻当前阶段 |
| POST | `/api/v1/runtime/blueprints/advance-phase` | 推进到下一阶段 |

> 旧版路径（`/api/v1/agents/register`、`/api/v1/tasks/*`）可能仍存在于历史代码中，但不应在生产环境使用。

---

## 验证命令

运行以下命令验证完整部署：

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

> `validate-api-deploy.js` 面向源码/测试，在开发机上安全运行。`health-check.sh` 是部署环境检测工具——在非 Docker 环境下出现警告为正常现象。

---

*`docs/assets/guide/` 下的图片资源由 English / 简体中文 / 繁體中文 三语文档共享，避免重复维护多套截图资产。*
