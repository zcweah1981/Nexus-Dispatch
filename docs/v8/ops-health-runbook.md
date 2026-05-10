# Nexus Dispatch System — systemd/docker Health Runbook

> Task: `nexus-v8-r7-t5-ops-runbook` | Lane: OPS | Agent: hyoga-ops-1
> 本文档为 Nexus Dispatch 系统的健康检查运维手册，覆盖 Docker Compose 部署与 systemd 裸机部署两种场景。

---

## 一、文档说明

### 1.1 文档目的

为运维人员提供标准化的健康检查、故障诊断与恢复操作手册，确保系统可观测性与快速恢复能力。

### 1.2 适用对象

运维工程师（OPS Lane）、PM Daemon（watchdog/patrol cronjob）、自动化巡检 Worker。

### 1.3 系统架构概览

```
┌─────────────────────────────────────────────────────────┐
│                   Nexus Dispatch System                  │
│                                                         │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌────────┐ │
│  │ nexus-db │  │nexus-api │  │nexus-    │  │nexus-  │ │
│  │ (SQLite) │  │ (Express)│  │ daemon   │  │ webui  │ │
│  │ :none    │  │ :8000    │  │ (Tick)   │  │ :3030  │ │
│  │          │  │ :8001←   │  │          │  │ (nginx)│ │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └────────┘ │
│       │              │              │                    │
│       └─────── data/nexus.db ──────┘                    │
│              (Prisma / SQLite VFS)                      │
└─────────────────────────────────────────────────────────┘
```

### 1.4 服务清单

| 服务 | 端口 | 部署形态 | 健康方式 |
|------|------|----------|----------|
| nexus-api | 8000 (internal) / 8001 (mapped) | Docker / systemd | HTTP GET `/health` |
| nexus-daemon | none | Docker / systemd | 日志 `[Tick Summary]` 输出 |
| nexus-db | none (SQLite VFS) | Docker (sidecar) / shared FS | 文件可读性 |
| nexus-webui | 3030 | Docker (nginx:alpine) | HTTP GET `:3030` |

---

## 二、快速健康检查

### 2.1 一键健康检查脚本

```bash
# 完整检查
cd /opt/projects/nexus-dispatch
./scripts/health-check.sh

# 快速检查（跳过日志分析）
./scripts/health-check.sh --quick

# JSON 输出（适合 cronjob / watchdog 解析）
./scripts/health-check.sh --json
```

**退出码定义：**

| 退出码 | 含义 | 处理 |
|--------|------|------|
| 0 | 全部通过 | 无需操作 |
| 1 | CRITICAL 级别故障 | 立即处理 |
| 2 | WARNING 级别告警 | 排期处理 |

### 2.2 Docker Compose 速查

```bash
# 查看全部服务状态
docker compose ps

# 查看实时日志
docker compose logs -f --tail=50

# 单服务日志
docker compose logs -f --tail=100 nexus-api
docker compose logs -f --tail=100 nexus-daemon
```

### 2.3 systemd 速查（裸机部署）

```bash
# 服务状态
systemctl status nexus-dispatch-api
systemctl status nexus-dispatch-daemon

# 实时日志
journalctl -u nexus-dispatch-api -f
journalctl -u nexus-dispatch-daemon -f --since "10 minutes ago"
```

---

## 三、Docker Compose 部署健康检查

### 3.1 容器存活检查

```bash
# 检查所有服务是否 running
docker compose ps --format "table {{.Name}}\t{{.Status}}\t{{.Ports}}"

# 预期输出：所有 4 个服务状态为 running (healthy)
```

**异常处理：**

| 现象 | 诊断命令 | 恢复操作 |
|------|----------|----------|
| 容器 exited | `docker compose logs <svc> --tail=50` | `docker compose up -d <svc>` |
| 容器 restarting | `docker inspect --format='{{.State.Error}}' <cid>` | 检查 .env / 磁盘空间 / 端口占用 |
| 容器 not found | `docker compose config` | 检查 docker-compose.yml 完整性 |

### 3.2 API Server 健康检查

```bash
# HTTP 健康探针
curl -sf http://localhost:8001/health | jq .

# 预期：HTTP 200 + JSON status 字段

# 认证保护验证（无 token 应 401）
curl -sf -o /dev/null -w "%{http_code}" http://localhost:8001/api/v1/projects
# 预期：401
```

**API 故障排查：**

| 现象 | 可能原因 | 恢复操作 |
|------|----------|----------|
| connection refused | 容器未启动 / 端口未映射 | `docker compose up -d nexus-api` |
| 500 Internal Error | 数据库损坏 / Prisma Client 过期 | `npx prisma generate && docker compose restart nexus-api` |
| 401 on valid token | JWT_SECRET 不匹配 | 检查 .env JWT_SECRET |

### 3.3 Daemon Tick Loop 健康检查

```bash
# 检查 Daemon 容器最近 5 分钟是否有 tick 输出
docker compose logs --since 5m nexus-daemon 2>&1 | grep "\[Tick Summary\]"

# 预期：每 tickInterval (默认 5s) 输出一行 [Tick Summary]
```

**Daemon 故障排查：**

| 现象 | 可能原因 | 恢复操作 |
|------|----------|----------|
| 无 [Tick Summary] | Daemon crash / API 不可达 | `docker compose restart nexus-daemon` |
| 频繁 `Error fetching pending` | API Server 异常 | 先恢复 API Server |
| 频繁 `dispatch-error` | Worker Agent endpoint 不可达 | 检查 Agent 注册状态与 endpoint |
| 大量 `recovered` 任务 | Worker 处理过慢 / 超时 | 检查 `RECOVERY_TIMEOUT_MINUTES` 配置 |

### 3.4 数据库健康检查

```bash
# SQLite 文件
ls -lh data/nexus.db

# Prisma schema 验证
npx prisma validate

# Prisma Client 与 schema 同步检查
npx prisma generate
```

### 3.5 网络连通性检查

```bash
# 内部网络
docker network inspect nexus-dispatch_nexus-internal

# API 与 Daemon 跨容器通信（在 nexus-daemon 容器内）
docker compose exec nexus-daemon wget -q -O - http://nexus-api:8000/health
```

---

## 四、systemd 裸机部署健康检查

### 4.1 Unit 文件安装

```bash
# 复制 unit 文件
sudo cp scripts/nexus-dispatch-api.service /etc/systemd/system/
sudo cp scripts/nexus-dispatch-daemon.service /etc/systemd/system/

# 创建运行用户
sudo useradd -r -s /bin/false nexus || true

# 设置权限
sudo chown -R nexus:nexus /opt/projects/nexus-dispatch/data

# 重载 systemd
sudo systemctl daemon-reload

# 启用并启动
sudo systemctl enable --now nexus-dispatch-api
sudo systemctl enable --now nexus-dispatch-daemon
```

### 4.2 服务状态检查

```bash
# API Server
sudo systemctl status nexus-dispatch-api
# 关键指标：
#   Active: active (running)
#   Main PID: <pid>
#   Memory: < usage >

# Daemon
sudo systemctl status nexus-dispatch-daemon
# 关键指标：
#   Active: active (running)
#   Watchdog: 每 600s 检查 tick 输出
```

### 4.3 日志查询

```bash
# API 日志
journalctl -u nexus-dispatch-api -f
journalctl -u nexus-dispatch-api --since "1 hour ago" --no-pager | tail -100

# Daemon 日志
journalctl -u nexus-dispatch-daemon -f --since "10 minutes ago"

# 搜索错误
journalctl -u nexus-dispatch-api -p err --since "1 hour ago"
journalctl -u nexus-dispatch-daemon -p err --since "1 hour ago"
```

### 4.4 systemd 健康检查机制

| 机制 | API Server | Daemon |
|------|-----------|--------|
| Restart | `on-failure` (5s delay) | `on-failure` (10s delay) |
| Watchdog | 无 | 600s tick activity check |
| StartLimit | 5 burst / 120s | 3 burst / 300s |
| MemoryMax | 512M | 256M |

---

## 五、故障诊断流程图

```
健康检查失败
  │
  ├─ CRITICAL: 容器/服务未运行
  │    ├─ 检查 docker compose ps / systemctl status
  │    ├─ 查看服务日志确认退出原因
  │    ├─ 检查 .env 配置完整性
  │    └─ 重启: docker compose up -d / systemctl restart
  │
  ├─ CRITICAL: API 不可达
  │    ├─ 检查端口占用: ss -tlnp | grep 8001
  │    ├─ 检查 API 日志是否有 500 错误
  │    ├─ 检查数据库文件: ls -lh data/nexus.db
  │    └─ 重启 API: docker compose restart nexus-api
  │
  ├─ CRITICAL: 数据库不可用
  │    ├─ 检查文件权限: ls -la data/
  │    ├─ 检查磁盘空间: df -h
  │    ├─ 验证 Prisma schema: npx prisma validate
  │    └─ 恢复: npx prisma db push (开发环境)
  │
  ├─ WARNING: Daemon 无 tick 输出
  │    ├─ 检查 API Server 是否可达（Daemon 依赖 API）
  │    ├─ 检查 Daemon 日志中 error/fatal
  │    ├─ 检查 AGENT_NOTIFICATIONS 环境变量格式
  │    └─ 重启 Daemon
  │
  └─ WARNING: 磁盘使用率高
       ├─ 清理 Docker: docker system prune -af
       ├─ 清理旧日志: journalctl --vacuum-time=7d
       └─ 检查 data/ 目录增长趋势
```

---

## 六、标准操作手册 (SOP)

### SOP-01: 服务重启

```bash
# Docker 部署
cd /opt/projects/nexus-dispatch
docker compose restart nexus-api        # 单服务
docker compose restart nexus-daemon      # 单服务
docker compose restart                   # 全部重启

# systemd 部署
sudo systemctl restart nexus-dispatch-api
sudo systemctl restart nexus-dispatch-daemon
```

**注意：** Daemon 依赖 API Server，必须确保 API 先恢复。

### SOP-02: 版本升级与重新部署

```bash
cd /opt/projects/nexus-dispatch
git pull origin main
npm install
npx prisma generate
npm run build

# Docker
docker compose up -d --build

# systemd
sudo systemctl restart nexus-dispatch-api
sudo systemctl restart nexus-dispatch-daemon
```

### SOP-03: 数据库备份

```bash
# SQLite 热备份（确保无写入时）
cp data/nexus.db "data/nexus.db.$(date +%Y%m%d_%H%M%S).bak"

# 或通过 Prisma
npx prisma db pull --print > "data/schema_dump_$(date +%Y%m%d).prisma"
```

### SOP-04: 日志轮转配置

```bash
# Docker: 在 daemon.json 中配置
# /etc/docker/daemon.json
{
  "log-driver": "json-file",
  "log-opts": {
    "max-size": "10m",
    "max-file": "3"
  }
}

# systemd: /etc/systemd/journald.conf
[Journal]
SystemMaxUse=500M
MaxRetentionSec=7day
```

### SOP-05: 紧急回滚

```bash
cd /opt/projects/nexus-dispatch

# 回滚到上一个 commit
git log --oneline -5
git checkout <previous-stable-commit>

# 重新构建
npm install && npm run build

# 重启
docker compose up -d --build
# 或
sudo systemctl restart nexus-dispatch-api nexus-dispatch-daemon

# 验证
./scripts/health-check.sh
```

---

## 七、监控与告警建议

### 7.1 关键指标

| 指标 | 采集方式 | 告警阈值 |
|------|----------|----------|
| API 响应时间 | curl `-w %{time_total}` | > 2s |
| API 5xx 率 | 日志统计 | > 1% |
| Daemon tick 频率 | `[Tick Summary]` 间隔 | > 60s 无输出 |
| 任务堆积 | GET `/api/v1/runtime/projects/:id/tasks?status=created` | > 50 pending |
| SQLite 文件大小 | `stat data/nexus.db` | > 100MB |
| 磁盘使用率 | `df -h` | > 85% |
| 容器重启次数 | `docker inspect --format='{{.RestartCount}}'` | > 3 次/小时 |

### 7.2 watchdog/patrol 集成

通过 R7-T1 `project_cronjobs` registry 与 R7-T4 `renderPrompt()` 渲染巡检 prompt：

```bash
# 健康检查 JSON 输出供 watchdog worker 解析
./scripts/health-check.sh --json

# 输出结构：
# {
#   "timestamp": "ISO8601",
#   "status": "healthy|degraded|unhealthy",
#   "criticals": N,
#   "warnings": N,
#   "results": [...]
# }
```

watchdog/patrol Worker 应：
1. 调用 `health-check.sh --json`
2. 解析 `status` / `criticals` / `warnings`
3. 仅生成观察报告，**严禁自动修复**（遵守 R7-T4 guardrail）
4. 修复操作必须另行派 DEV 任务并走 V8 API/service/FSM Controller

---

## 八、安全注意事项

1. **健康检查脚本不触碰生产 DB**：所有检查均为只读操作，不执行写入/修改。
2. **不暴露敏感信息**：脚本输出不包含 JWT_SECRET、bot_token、chat_id 等敏感值。
3. **文件权限**：systemd unit 文件中 `ProtectSystem=strict`，仅 `data/` 和 `logs/` 可写。
4. **健康检查通过 V8 API-only 主线**：不直接操作 SQLite、不回退 legacy DAL。

---

## 九、变更记录

| 日期 | 版本 | 作者 | 说明 |
|------|------|------|------|
| 2026-05-09 | v1.0 | hyoga-ops-1 | R7-T5 初始版本：健康检查脚本 + systemd unit + runbook |
