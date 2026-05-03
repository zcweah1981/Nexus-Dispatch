# Nexus Dispatch System (独立调度枢纽)

> **“零信任验收” + “绝对沙盒”**：从“单机脚本本地跑”向“云原生微服务多智能体控制平面”跨越的核心底座。

Nexus Dispatch 旨在解决大模型在处理长周期、多节点（PM, Coder, Designer, QA）工程项目时容易出现的“上下文遗忘”、“陷入幻觉死循环”和“并发冲突”等痛点。它通过将系统任务状态管理收敛到关系型数据库（SQLite SSoT）和抢占式的守护进程 (Daemon) 中，确保系统的执行严格按照有向无环图 (DAG) 推进，实现可观测、可被机器校验的自动化执行流转。

## 🎯 核心特性

- **单一真相源 (SSoT)**: 全局使用持久化的 SQLite 数据库，聊天记录和 LLM History 不再用作流程控制。
- **DAG 引擎防死锁**: 三色标记法 DFS 算法验证依赖节点，阻断死循环幻觉与互相死锁。
- **沙盒会话拦截**: `PM Core` 拥有严苛的工作区 Chroot 与指令限流防抖，实现状态的物理级防污染与快速重入。
- **零信任 Webhook 验收**: Worker (智能体节点) 执行结束后需提交可验证产物 (Artifacts)，禁止单纯的口头宣称“已完成”。
- **多通道与方言适配**: 调度中枢同时兼容本地 Hermes MCP 工具链和远端 OpenClaw Serverless 节点的混合赛道 (Lanes) 编排。
- **SSE WebUI 观测大屏**: 即时反映底层状态机的数据流变化，展示多智能体协作全景图和算力雷达。

## 🏗️ 架构拓扑

```text
[ User ]       [ PM Core ]        [ SQLite DB ]        [ Daemon ]        [ Worker ]
   │                │                   │                  │                 │
   ├── (Telegram) ─►│                   │                  │                 │
   │                ├── (拆分 DAG 任务)►│                  │                 │
   │                │                   │◄── (轮询 created 任务) ─         │
   │                │                   │                  │                 │
   │                │                   │                  ├── (HTTP 派单) ─►│
   │                │                   │                  │                 │
   │                │                   │◄── (Webhook 提产物与证明) ─────────│
   │                │                   │                  │                 │
   │                │                   ├── (审计验收闭环) ─►│                 │
   │◄── (项目完结通报)│                   │                  │                 │
```

## 🚀 极简部署 (Quick Start)

为了最大程度降低用户的部署门槛，我们提供了一键安装脚本。您无需手动执行克隆、拷贝变量或构建等复杂指令，只需在宿主机终端执行以下**一条命令**：

```bash
curl -sSL https://raw.githubusercontent.com/zcweah1981/Nexus-Dispatch/main/install.sh | bash
```

该脚本会自动为您在 `/opt/nexus-dispatch` 目录拉取最新代码、初始化隔离的数据卷环境并自动拉起所有微服务。

**访问大屏与接口**：
* WebUI (拓扑观测大屏): `http://localhost:3030`
* API Swagger (接口调试): `http://localhost:8000/docs`

---

## 🔌 接入 4 个 Worker Agent (执行节点) 操作指南

本系统作为独立的主控中枢 (Control Plane)，支持外挂多个异构执行智能体 (Agents) 如 Coder, Designer, Ops, Content 等。**执行节点不需要也不应该打包进主控的 Docker 内。** 挂载这 4 个 Agent 仅需简单的注册操作：

### 步骤一：启动执行节点的 API 服务
在各自的执行环境（本机或其他服务器）上启动 Agent，并确保其暴露 HTTP 服务。该服务必须提供以下两个接口：
1. `GET /health`：供中枢 Daemon 心跳探活，返回其当前可用槽位。
2. `POST /v1/runs`：供中枢下发派单 JSON 载荷。

### 步骤二：通过 API 将 4 个 Agent 注册进主控
系统提供了标准的 RESTful API 用于节点动态注册。在主控系统启动后，直接使用 `curl` 命令将这 4 个 Agent 的名字、地址与**专属赛道(Lane)** 注册到中枢：

```bash
# 注册 Coder Agent (开发赛道)
curl -X POST http://localhost:8000/api/v1/agents/register \
  -H "Content-Type: application/json" \
  -d '{
    "agent_id": "long-coder-1",
    "endpoint": "http://127.0.0.1:8647/v1/runs",
    "lane": "DEV",
    "max_concurrency": 1
  }'

# 注册 Designer Agent (设计赛道)
curl -X POST http://localhost:8000/api/v1/agents/register \
  -H "Content-Type: application/json" \
  -d '{
    "agent_id": "shun-designer-1",
    "endpoint": "http://127.0.0.1:8645/v1/runs",
    "lane": "DESIGN",
    "max_concurrency": 1
  }'
  
# (以此类推，注册 OPS 和 CONTENT 节点...)
```

---

## 🌐 对外发布与网络配置

Nexus 默认运行在隔离的 `nexus-internal` Docker 网络中。根据您的服务器环境，选择以下对应的暴露方案：

### 方案一：纯内网组网 (Tailscale / 异地 Agent 推荐)
如果您不需要对外公开大屏，仅仅是为了自己能在家里看，或者为了让其他云服务器上的 Agent 连上 API：
1. 在所有相关机器上运行 `curl -fsSL https://tailscale.com/install.sh | sh && sudo tailscale up`。
2. 直接通过 Tailscale 分配的内网 IP 访问：`http://100.x.y.z:3030`。

### 方案二：Docker 容器化反向代理 (针对独立 Proxy 网络的 Caddy/Nginx)
如果您的服务器上已经运行了一个全局的 Caddy 或 Nginx Docker 容器，并且它位于一个独立的 Docker 网络（例如名为 `proxy`），您可以通过桥接网络让反代容器直接访问到 Nexus：

**1. 修改 Nexus 的 `docker-compose.yml`**
在文件的末尾添加对外部网络 `proxy` 的声明，并将需要暴露的服务（`nexus-webui` 和 `nexus-api`）接入该网络：

```yaml
services:
  nexus-webui:
    # ...其他配置保留...
    networks:
      - nexus-internal
      - proxy   # 加入外部的反代网络

  nexus-api:
    # ...其他配置保留...
    networks:
      - nexus-internal
      - proxy   # 加入外部的反代网络

networks:
  nexus-internal:
    driver: bridge
  proxy:
    external: true # 声明这是一个已存在的外部网络
```

**2. 配置 Caddyfile / Nginx**
现在，您的 Caddy 容器可以直接通过 Docker 内部 DNS 解析到 `nexus-webui` 容器名，而无需走宿主机 IP：

*如果您使用的是 Caddy (`Caddyfile`):*
```caddyfile
dispatch.yourdomain.com {
    reverse_proxy nexus-webui:3030
}
api.dispatch.yourdomain.com {
    reverse_proxy nexus-api:8000
}
```

*如果您使用的是 Nginx (`nginx.conf`):*
```nginx
server {
    listen 80;
    server_name dispatch.yourdomain.com;
    location / {
        proxy_pass http://nexus-webui:3030;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

### 方案三：宿主机反向代理 (针对非 Docker 运行的 Web Server)
如果您是在宿主机直接运行的 Nginx/Caddy（未使用 Docker），因为 Nexus 已经在宿主机映射了 `3030` 和 `8000` 端口，您可以直接代理到本地地址：

```nginx
location / {
    # 宿主机反代直接指向 127.0.0.1 暴露的端口
    proxy_pass http://127.0.0.1:3030; 
}
```

---

## 🔐 安全与红线约定
* **SQL 注入防范**：无论是 PM Agent 还是查询工具，必须采用 ORM 或 Parameterized Queries，严禁拼接。
* **目录越权**：执行层底层 `read_file`/`write_file` 必须执行 `os.path.abspath` 并进行前缀校验锁定。
* **脱敏红线**：API 密钥不可作为 Prompt 或打在系统日志中，必须通过运行时容器环境变量挂载。