import { Task } from '../db/dal';
import Database from 'better-sqlite3';
import * as path from 'path';

export class SessionManager {
    private dbPath: string;

    constructor(dbPath: string = path.resolve(__dirname, '../../data/nexus.db')) {
        this.dbPath = dbPath;
    }

    /**
     * Clear LLM Provider conversation history for physical cutoff
     * In a real implementation, this would call out to the LLM Gateway/Provider's API
     * to purge the specific session context.
     * For PM Core, we mock this interface.
     */
    public async clearLlmMemory(projectId: string): Promise<boolean> {
        console.log(`[SessionManager] Physical truncation: Cleared LLM memory for project ${projectId}`);
        // MOCK: physical truncate operation
        return true;
    }

    /**
     * Perform State Rehydration (状态重入)
     * Rebuilds the System Prompt strictly containing:
     * 1. The Project's PROJECT.md content (as the source of truth)
     * 2. The Current progress list from the SQLite Task State Machine
     */
    public rehydrateState(projectId: string, projectMdContent: string): string {
        const db = new Database(this.dbPath);
        
        // Fetch current tasks for the project to rebuild progress context
        const rows = db.prepare(`
            SELECT id, title, status, lane
            FROM nexus_tasks
            WHERE project_id = ?
            ORDER BY created_at ASC
        `).all(projectId) as any[];
        
        db.close();

        let progressList = "Current SQLite Task State:\\n";
        if (rows.length === 0) {
            progressList += "- No active tasks found.\\n";
        } else {
            rows.forEach(r => {
                progressList += `- Task [${r.id}]: ${r.title} | Lane: ${r.lane} | Status: ${r.status}\\n`;
            });
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
        const systemPrompt = this.rehydrateState(projectId, projectMdContent);
        
        return {
            systemPrompt
        };
    }
}
