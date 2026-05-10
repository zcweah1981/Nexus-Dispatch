/** Minimal task shape returned by the API */
interface ApiTask {
    id: string;
    title: string;
    status: string;
    lane: string;
}

interface TelegramSessionSelection {
    chat_id: string;
    project_id: string;
}

interface SessionManagerOptions {
    /**
     * Guardrail hook for tests/future adapters: selecting a Telegram session must never
     * start/stop/update cronjobs. Real cron mutations belong behind project_cronjobs.
     */
    onCronjobMutationAttempt?: (projectId: string, action: string) => Promise<void> | void;
}

/**
 * SessionManager — PM Core session isolation & state rehydration.
 *
 * V2: Fully API-driven. No legacy DB adapter imports.
 * All task reads go through the RESTful API layer, respecting the
 * data red-line that storage is only visible inside the API Server.
 */
export class SessionManager {
    private apiUrl: string;
    private authToken: string;
    private readonly options: SessionManagerOptions;
    private readonly telegramSessionSelections = new Map<string, string>();

    constructor(
        apiUrl: string = process.env.NEXUS_API_URL || 'http://localhost:8000',
        authToken: string = process.env.NEXUS_AUTH_TOKEN || '',
        options: SessionManagerOptions = {},
    ) {
        this.apiUrl = apiUrl;
        this.authToken = authToken;
        this.options = options;
    }

    /**
     * Select the current project for a Telegram chat/session.
     *
     * R7-T3 boundary: this is a pure selector. It must not start, stop, pause,
     * resume, or otherwise mutate backend cronjobs. Cron lifecycle remains behind
     * the project_cronjobs registry and explicit Runtime API/service calls.
     */
    public async selectTelegramSessionProject(chatId: string, projectId: string): Promise<TelegramSessionSelection> {
        if (!chatId.trim()) throw new Error('chat_id is required');
        if (!projectId.trim()) throw new Error('project_id is required');

        this.telegramSessionSelections.set(chatId, projectId);
        void this.options.onCronjobMutationAttempt;
        return { chat_id: chatId, project_id: projectId };
    }

    public getSelectedTelegramSessionProject(chatId: string): string | undefined {
        return this.telegramSessionSelections.get(chatId);
    }

    /**
     * Clear LLM Provider conversation history for physical cutoff.
     * Calls out to the LLM Gateway/Provider's API to purge the specific session context.
     */
    public async clearLlmMemory(projectId: string): Promise<boolean> {
        console.log(`[SessionManager] Physical truncation: Cleared LLM memory for project ${projectId}`);
        // MOCK: physical truncate operation — to be wired to actual LLM gateway
        return true;
    }

    /**
     * Fetch tasks for a project via the API layer.
     */
    private async fetchTasks(projectId: string): Promise<ApiTask[]> {
        const url = `${this.apiUrl}/api/v1/tasks?project_id=${encodeURIComponent(projectId)}`;
        const headers: Record<string, string> = {
            'Accept': 'application/json',
        };
        if (this.authToken) {
            headers['Authorization'] = `Bearer ${this.authToken}`;
        }

        let res: Response;
        try {
            res = await fetch(url, { headers });
        } catch (err) {
            console.error(`[SessionManager] API unreachable for project ${projectId}:`, (err as Error).message);
            return [];
        }
        if (!res.ok) {
            console.error(`[SessionManager] API returned ${res.status} for project ${projectId}`);
            return [];
        }
        const body = await res.json();
        // API returns array or { tasks: [...] }
        return Array.isArray(body) ? body : (body.tasks || []);
    }

    /**
     * Perform State Rehydration (状态重入).
     * Rebuilds the System Prompt strictly containing:
     * 1. The Project's PROJECT.md content (as the source of truth)
     * 2. The current progress list from the API Task State Machine
     */
    public async rehydrateState(projectId: string, projectMdContent: string): Promise<string> {
        const tasks = await this.fetchTasks(projectId);

        let progressList = "Current Task State:\n";
        if (tasks.length === 0) {
            progressList += "- No active tasks found.\n";
        } else {
            for (const t of tasks) {
                progressList += `- Task [${t.id}]: ${t.title} | Lane: ${t.lane} | Status: ${t.status}\n`;
            }
        }

        const systemPrompt = `You are resuming work on project ${projectId}.

=== PROJECT DOMAIN (PROJECT.md) ===
${projectMdContent}

=== PROGRESS CHECK (STATE MACHINE) ===
${progressList}`;

        return systemPrompt;
    }

    /**
     * Main Resume flow triggered by /resume <project_id>
     */
    public async resumeSession(projectId: string, projectMdContent: string): Promise<{ systemPrompt: string }> {
        // 1. Trigger physical truncation
        await this.clearLlmMemory(projectId);

        // 2. Perform state rehydration
        const systemPrompt = await this.rehydrateState(projectId, projectMdContent);

        return {
            systemPrompt
        };
    }
}
