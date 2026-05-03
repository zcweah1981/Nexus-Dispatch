     1|# Nexus Dispatch System (独立调度枢纽)
     2|
     3|> **“零信任验收” + “绝对沙盒”**：从“单机脚本本地跑”向“云原生微服务多智能体控制平面”跨越的核心底座。
     4|
     5|Nexus Dispatch 旨在解决大模型在处理长周期、多节点（PM, Coder, Designer, QA）工程项目时容易出现的“上下文遗忘”、“陷入幻觉死循环”和“并发冲突”等痛点。它通过将系统任务状态管理收敛到关系型数据库（SQLite SSoT）和抢占式的守护进程 (Daemon) 中，确保系统的执行严格按照有向无环图 (DAG) 推进，实现可观测、可被机器校验的自动化执行流转。
     6|
     7|## 🎯 核心特性
     8|
     9|- **单一真相源 (SSoT)**: 全局使用持久化的 SQLite 数据库，聊天记录和 LLM History 不再用作流程控制。
    10|- **DAG 引擎防死锁**: 三色标记法 DFS 算法验证依赖节点，阻断死循环幻觉与互相死锁。
    11|- **沙盒会话拦截**: `PM Core` 拥有严苛的工作区 Chroot 与指令限流防抖，实现状态的物理级防污染与快速重入。
    12|- **零信任 Webhook 验收**: Worker (智能体节点) 执行结束后需提交可验证产物 (Artifacts)，禁止单纯的口头宣称“已完成”。
    13|- **多通道与方言适配**: 调度中枢同时兼容本地 Hermes MCP 工具链和远端 OpenClaw Serverless 节点的混合赛道 (Lanes) 编排。
    14|- **SSE WebUI 观测大屏**: 即时反映底层状态机的数据流变化，展示多智能体协作全景图和算力雷达。
    15|
    16|## 🏗️ 架构拓扑
    17|
    18|```text
    19|[ User ]       [ PM Core ]        [ SQLite DB ]        [ Daemon ]        [ Worker ]
    20|   │                │                   │                  │                 │
    21|   ├── (Telegram) ─►│                   │                  │                 │
    22|   │                ├── (拆分 DAG 任务)►│                  │                 │
    23|   │                │                   │◄── (轮询 created 任务) ─         │
    24|   │                │                   │                  │                 │
    25|   │                │                   │                  ├── (HTTP 派单) ─►│
    26|   │                │                   │                  │                 │
    27|   │                │                   │◄── (Webhook 提产物与证明) ─────────│
    28|   │                │                   │                  │                 │
    29|   │                ├── (审计验收闭环) ─►│                  │                 │
    30|   │◄── (项目完结通报)│                   │                  │                 │
    31|```
    32|
    33|## 🚀 极简部署 (Quick Start)
    34|
    35|为了最大程度降低用户的部署门槛，我们提供了一键安装脚本。您无需手动执行克隆、拷贝变量或构建等复杂指令，只需在宿主机终端执行以下**一条命令**：
    36|
    37|```bash
    38|curl -sSL https://raw.githubusercontent.com/zcweah1981/Nexus-Dispatch/main/install.sh | bash
    39|```
    40|
    41|该脚本会自动为您在 `/opt/nexus-dispatch` 目录拉取最新代码、初始化隔离的数据卷环境并自动拉起所有微服务。
    42|
    43|**访问大屏与接口**：
    44|* WebUI (拓扑观测大屏): `http://localhost:3030`
    45|* API Swagger (接口调试): `http://localhost:8000/docs`
    46|
    47|---
    48|
    49|## 🔌 接入 4 个 Worker Agent (执行节点) 操作指南
    50|
    51|本系统作为独立的主控中枢 (Control Plane)，支持外挂多个异构执行智能体 (Agents) 如 Coder, Designer, Ops, Content 等。**执行节点不需要也不应该打包进主控的 Docker 内。** 挂载这 4 个 Agent 仅需简单的注册操作：
    52|
    53|### 步骤一：启动执行节点的 API 服务
    54|在各自的执行环境（本机或其他服务器）上启动 Agent，并确保其暴露 HTTP 服务。该服务必须提供以下两个接口：
    55|1. `GET /health`：供中枢 Daemon 心跳探活，返回其当前可用槽位。
    56|2. `POST /v1/runs`：供中枢下发派单 JSON 载荷。
    57|
    58|### 步骤二：将 4 个 Agent 注册进主控 SQLite 数据库
    59|在主控系统启动后，直接使用 SQL 将这 4 个 Agent 的名字、端口与**专属赛道(Lane)** 录入数据库（在实际应用中，可通过 `POST /v1/agents` 接口动态注册，这里演示底层原理）：
    60|
    61|```bash
    62|# 登录 SQLite 数据库，执行注册 SQL
    63|sqlite3 /opt/nexus-dispatch/data/nexus.db "
    64|INSERT INTO agents (agent_id, endpoint, metadata_json, created_at, updated_at) VALUES 
    65|('long-coder-1', 'http://127.0.0.1:8647/v1/runs', '{"lane": "DEV", "health_status": "healthy", "max_concurrency": 1}', datetime('now'), datetime('now')),
    66|('shun-designer-1', 'http://127.0.0.1:8645/v1/runs', '{"lane": "DESIGN", "health_status": "healthy", "max_concurrency": 1}', datetime('now'), datetime('now')),
    67|('hyoga-ops-1', 'http://127.0.0.1:8648/v1/runs', '{"lane": "OPS", "health_status": "healthy", "max_concurrency": 1}', datetime('now'), datetime('now')),
    68|('ikki-content-1', 'http://127.0.0.1:8649/v1/runs', '{"lane": "CONTENT", "health_status": "healthy", "max_concurrency": 1}', datetime('now'), datetime('now'));
    69|"
    70|```
    71|
    72|### 步骤三：系统自动化发现与分发
    73|1. 完成注册后，主控的 `nexus-daemon` 守护进程会在下一个 60 秒心跳周期自动通过 `GET /health` 发现这 4 个节点。
    74|2. 当 PM 拆解出一个带有 `lane="DEV"` 标签的“前端开发任务”时，Daemon 会精准地将任务派发给 `long-coder-1`。如果是画图任务 (`lane="DESIGN"`)，则会自动派发给 `shun-designer-1`，全自动无缝运转。
    75|
    76|
## 🌐 局域网组网与对外访问 (Tailscale)

本系统的核心架构为 `nexus-internal` 纯内网隔离。这意味着，**默认情况下所有服务（包括 API 和 WebUI）都不会暴漏到公网**，从而从物理层面杜绝了外部黑客攻击。

但在实际的多机器、多 Agent 协作场景中，如果您需要：
1. **让主理人在家里的电脑随时查看服务器上的 WebUI 大屏**；
2. **让部署在另一台 VPS 上的 Coder Agent 能连上主控的 API Server 提交产物**；

我们强烈建议使用 **Tailscale** 构建虚拟局域网（VPN），实现跨机器的安全互访。

### 1. 组建 Tailscale 虚拟网
在运行 Nexus Dispatch 主控的服务器，以及所有挂载的 Agent 服务器、您个人的电脑上，执行一键安装：
```bash
curl -fsSL https://tailscale.com/install.sh | sh
sudo tailscale up
```
完成后，Tailscale 会为每台机器分配一个固定的内网 IP（例如 `100.x.y.z`）。

### 2. 通过内网 IP 安全访问
* **访问大屏**：主理人无需在服务器防火墙上开放任何公网端口，直接在本地浏览器输入 `http://100.x.y.z:3030` 即可查看进度。
* **Agent 接入**：在另一台机器上部署的 Coder Agent，其对接配置中的 `BASE_URL` 可以直接填入 `http://100.x.y.z:8000`，安全高效地完成跨机通信。

> **注意**：如果您确实需要对全网公众公开，请使用 Caddy/Nginx 在宿主机配置反向代理，并为其绑定 SSL 证书。

## 🔐 安全与红线约定
    77|* **SQL 注入防范**：无论是 PM Agent 还是查询工具，必须采用 ORM 或 Parameterized Queries，严禁拼接。
    78|* **目录越权**：执行层底层 `read_file`/`write_file` 必须执行 `os.path.abspath` 并进行前缀校验锁定。
    79|* **脱敏红线**：API 密钥不可作为 Prompt 或打在系统日志中，必须通过运行时容器环境变量挂载。
    80|
    81|---
    82|*Generated by PM Agent - Phase 1 Milestone Closure.*