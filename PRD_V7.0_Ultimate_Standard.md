# Nexus Dispatch System PRD V7.0 (API & WebUI 驱动重构版)

> **修订声明**：本版本彻底废弃“直接操作 SQLite”的作坊式后门，将所有能力（包含15项核心诉求）全面上卷至 **RESTful API** 与 **WebUI 控制台**。PM Agent 仅作为 API 的调用方，禁止直连数据库。

---

## 模块一：系统初始化与物理隔离边界

### 1. 自创建项目结构与注册机制 (API 驱动)
**痛点**：过去靠人工建立文件夹和文件，极易遗漏。
**系统化方案**：
* **API**: `POST /api/v1/projects/init` (由 WebUI 按钮或 PM 调用)。
* **行为**：系统在挂载的数据卷（如 `/data/projects/{project_name}`）中自动生成标准目录树：
  * `PROJECT.md`：项目的全局目标与红线约束。
  * `FILE_INDEX.md`：防幻觉的相对路径路由表。
  * `PHASES_AND_TASKS.md`：阶段拆解的只读副本。
  * `governance/RULES.md`：具体的开发/设计/审查规范。
* **数据库注册**：自动向 `projects` 表写入记录，并初始化初始状态。

### 2. 防止上下文污染的解决方案 (Context Sandbox)
**痛点**：Agent 聊久了容易把 A 项目的上下文带入 B 项目。
**系统化方案**：
* **单次派单原则**：Worker Agent 没有记忆。每次派单（Dispatch Payload）必须且只能包含本次任务所需的绝对必要上下文（即 `context_required` 字段指定的文件切片）。
* **工作区 Chroot**：Worker 在执行时，API 网关会在 payload 中下发专属的 `workdir`。Worker 无法读取 `workdir` 之外的任何项目文件，物理隔绝污染。

### 3. 容器化 Docker & Docker-Compose 配置标准
**方案**：
* 采用 `docker-compose.yml` 统一部署，包含四大独立服务：
  1. `nexus-api`：核心管控网关 (Node.js/TS 或 FastAPI)，暴露 `8000` 端口。
  2. `nexus-daemon`：无状态的调度引擎，只负责轮询调用 API，不直连 DB。
  3. `nexus-webui`：前端监控与配置大屏，暴露 `3030` 端口。
  4. `nexus-db`：SQLite 持久化数据卷挂载 `./data:/app/data`。
* **网络隔离**：统一部署在 `nexus-internal` bridge 网络，仅对外按需暴露 8000 和 3030。

---

## 模块二：身份注入与权限治理 (SOUL System)

### 11. 单 PM Agent 的人设 (SOUL) 与能力 (Tools) 注入
**系统化方案**：
* **入口**：WebUI -> "PM Settings" 页面。
* **注入机制**：PM 不再是写死在代码里的脚本。通过调用 `PUT /api/v1/system/pm_config`，管理员可以将 PM 的 System Prompt (SOUL) 保存至数据库。
* **能力挂载**：在界面勾选 PM 允许使用的 Tools（如 `dispatch_task`, `audit_proof`），网关会自动生成对应的 OpenAPI Schema 供 PM 使用。

### 12. Worker 的人设 (SOUL) 与能力 (Tools) 注入
**系统化方案**：
* **入口**：WebUI -> "Agent Roster" (节点花名册)。
* **注入机制**：管理员新建 Worker 时，输入其 Prompt 模板和允许的工具集。
* **分发机制**：在调度器向 Worker 派发任务时，Payload 中会动态合成该 Worker 的专属 SOUL，使其每次唤醒都处于绝对正确的角色状态。

### 14. PM Agent 的管理权限设计 (RBAC)
**设计**：
* PM 拥有**最高调度权限** (Orchestrator Role)，可调用 `/api/v1/tasks/*` 进行任务的 CRUD，以及调用 `/api/v1/projects/*` 修改项目状态。
* PM **被剥夺代码执行权限**：API 层硬性拦截 PM 调用的 `execute_code` 或 `terminal` 写入数据面的能力，强制其必须通过派发卡片让 Worker 去干活，实现“劳心者治人，劳力者治于人”。

---

## 模块三：调度中心与动态流转 (Dispatch Engine)

### 5. Worker 并行派发任务机制
**系统化方案**：
* **DAG 解析**：有向无环图引擎会实时计算。只要多个状态为 `created` 的任务，其 `dependencies`（前置任务数组）均已处于 `completed` 状态，调度器就会**同时将它们抓取出来**。
* **并发分发**：调度引擎启动多线程/异步协程，并行调用不同 Worker 的 Webhook 端点，实现真正的并发执行。

### 10. 调度器 (Dispatcher) 的动态分发逻辑
**逻辑链路**：
1. **健康检查**：派单前，先调用所有注册 Agent 的 `/health` 接口，过滤掉宕机或并发已满的节点。
2. **标签匹配**：将任务的 `lane` 标签与健康 Agent 的 `lane` 标签进行精准匹配。
3. **负载均衡**：若同一 `lane` 有多个空闲 Agent，采用 Round-Robin（轮询）或基于当前任务队列长度的最少连接路由。

### 13. Lane (赛道) 的实现机制
**机制**：
* Lane 是一种硬路由标签。在 WebUI 注册 Agent 时，必须赋予其 Lane（如 `DEV`, `DESIGN`, `OPS`, `CONTENT`）。
* PM 在拆解任务时，API 强制要求指定该任务属于哪个 Lane。
* 调度器在执行“动态分发”时，遇到无 Agent 认领的 Lane，会将任务挂起（挂起状态在 WebUI 标红告警），绝不跨赛道乱派（防止让画图节点去写代码）。

### 15. 状态机轮询机制 (State Machine)
**闭环流转**：
* 守护进程 (Daemon) 每 15 秒执行一次轮询（Tick）。
* **状态定义**：`created` (新建) -> `dispatched` (已派发，Worker 执行中) -> `validating` (Worker 提交了产物，等待 PM 验收) -> `completed` (完成) 或 `failed` (打回重做)。
* **阻断空转**：一旦发现全盘任务均为 `completed`，触发一次闭环 Webhook 给 Channel，然后该项目的轮询进入休眠 (`archived` 状态)。

---

## 模块四：API 网关与方言适配器 (Control API & Gateway)

### 6. API Server 的具体实现标准
**实现要求**：
* 架构：Node.js + Express/NestJS (配合 Prisma ORM) 或 Python + FastAPI。
* 核心路由域：
  * `/api/v1/projects` (项目大盘)
  * `/api/v1/tasks` (DAG 任务节点控制)
  * `/api/v1/agents` (Worker 注册与健康度)
  * `/api/v1/channels` (外部通讯网关)
* **鉴权**：所有接口受 Bearer Token 保护，系统初始化时生成 `NEXUS_API_KEY`。

### 8. API 网关建设 (Control API) 与 WebUI 对接
**建设方案**：
* 网关不仅处理 CRUD，还提供 `SSE` (Server-Sent Events) 端点：`GET /api/v1/stream/events`。
* WebUI 通过 SSE 实时接收数据库状态变更，实现“任务变绿、雷达闪烁”等大屏毫秒级刷新，完全取代 F5 刷新。

### 7. 统一调度 Hermes 与 OpenClaw 的 Payload 方言适配器
**痛点**：Hermes 接口接收的 JSON 格式与 OpenClaw 的格式要求不同。
**系统化方案**：
* **Adapter 模式设计**：在 API Server 派单层植入 `DialectAdapter` 类。
* 在 Agent 注册时，指定其 `dialect` 属性（枚举：`hermes`, `openclaw`, `openai_compat`）。
* **派单前转换**：
  * 若为 `hermes`：将指令包装为特定的 Tool Call Request 格式。
  * 若为 `openclaw`：转换其特有的 `system_message` 与 `function_declarations` 键名。
  * **抹平差异**：对 PM 而言，无需关心底层差异，它只需调用统一的 `/api/v1/tasks/dispatch`。

### 9. 派发任务流程、提示词与验收机制 (Acceptance Loop)
**系统化方案**：
1. **派发提示词合成**：API Server 根据任务描述、所在项目 `PROJECT.md` 的红线、加上该 Worker 的 SOUL，动态合成一段完整的 System Prompt 下发。
2. **Worker 提交流程**：Worker 跑完后，调用 `POST /api/v1/tasks/{id}/submit_proof`，提交修改的文件列表 (Git SHA) 与执行日志。状态变为 `validating`。
3. **PM 验收闭环**：PM 轮询到 `validating` 任务，自动挂载 `audit_proof` 工具。比对任务卡的 `Acceptance_Criteria`。合格则调用 API 将其置为 `completed`；不合格则置为 `failed` 并附带 `rejection_reason`，进入下一轮调度。

---

## 模块五：外部通道 (Channel Integration)

### 4. Channel 怎么接入
**系统化方案**：
* **入口**：WebUI -> "Channels Config"。
* **支持类型**：Telegram (Bot Token + Chat ID), Discord (Webhook), 飞书 (Webhook)。
* **触发机制**：在 API Server 内部实现 Event Emitter。只有发生以下三种关键事件时，才会调用 Channel API 进行极简卡片推送：
  1. 项目初始化完成。
  2. 任务流转失败 (`failed`) 触发告警。
  3. 项目全节点完成 (`all_completed`) 触发总结。
* 彻底废除旧版“每隔几秒扫描一次并乱发群聊”的野生脚本做法。