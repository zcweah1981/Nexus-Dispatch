import { Task, Artifact, DagPlanTaskInput } from '../types';

/**
 * Headless PM Core 专有工具链 (Nexus Toolchain)
 * 封装在沙盒中，隐式注入 project_id。封杀原生子代理 (Subagent) 的直接创建，
 * 强制通过调度系统和系统提供的工具来操作。
 *
 * Updated for V7.5 type alignment (Prisma schema fields).
 */
export class NexusToolchain {
    private projectId: string;

    constructor(projectId: string) {
        this.projectId = projectId;
        // 封杀 Subagent 调用相关的任何环境依赖，强制无状态
    }

    /**
     * nexus_create_dag_plan(tasks)
     * 核心建单能力。底层拦截循环依赖。
     */
    async createDagPlan(tasks: DagPlanTaskInput[]): Promise<boolean> {
        console.log(`[NexusToolchain - ${this.projectId}] Validating DAG for ${tasks.length} tasks...`);
        if (this.hasCycle(tasks)) {
            throw new Error('400 Bad Request: Cycle detected in task dependencies (DAG violation)');
        }

        console.log(`[NexusToolchain - ${this.projectId}] Plan created successfully.`);
        return true;
    }

    /**
     * nexus_update_task_status(task_id, status)
     * 状态机拨拨盘
     */
    async updateTaskStatus(taskId: string, status: Task['status']): Promise<void> {
        console.log(`[NexusToolchain - ${this.projectId}] Updating task ${taskId} to status: ${status}`);
    }

    /**
     * nexus_query_board_view()
     * 拉取精简版 Kanban 状态
     */
    async queryBoardView(): Promise<{
        projectId: string;
        inProgress: number;
        blocked: number;
        completed: number;
    }> {
        console.log(`[NexusToolchain - ${this.projectId}] Querying Kanban board view`);
        return {
            projectId: this.projectId,
            inProgress: 0,
            blocked: 0,
            completed: 0
        };
    }

    /**
     * nexus_accept_artifact(task_id)
     * 验收 Worker 上报的标准化证据。
     */
    async acceptArtifact(taskId: string, artifact: Artifact): Promise<boolean> {
        console.log(`[NexusToolchain - ${this.projectId}] Validating artifact for task ${taskId}...`);

        const validTypes = ['repo_commit', 'live_url', 'screenshot', 'metric_log'];
        if (!validTypes.includes(artifact.artifact_type)) {
            console.warn(`[NexusToolchain - ${this.projectId}] Artifact validation failed: Invalid type ${artifact.artifact_type}`);
            return false;
        }

        console.log(`[NexusToolchain - ${this.projectId}] Artifact accepted: ${artifact.artifact_type}`);
        return true;
    }

    /**
     * nexus_ask_human(question)
     * 主动中断自动化，向 Channel 寻求人类确认或索要密钥
     */
    async askHuman(question: string): Promise<string> {
        console.log(`[NexusToolchain - ${this.projectId}] Escalating to human: ${question}`);
        return 'Human response simulation';
    }

    // 内部方法：DAG 环路检测
    private hasCycle(tasks: Array<{ id: string; dependencies: string[] }>): boolean {
        const adjList = new Map<string, string[]>();
        tasks.forEach(t => adjList.set(t.id, t.dependencies || []));

        const visited = new Set<string>();
        const recursionStack = new Set<string>();

        const dfs = (nodeId: string): boolean => {
            if (recursionStack.has(nodeId)) return true; // 发现环
            if (visited.has(nodeId)) return false;

            visited.add(nodeId);
            recursionStack.add(nodeId);

            const deps = adjList.get(nodeId) || [];
            for (const dep of deps) {
                if (dfs(dep)) return true;
            }

            recursionStack.delete(nodeId);
            return false;
        };

        for (const task of tasks) {
            if (dfs(task.id)) return true;
        }

        return false;
    }
}
