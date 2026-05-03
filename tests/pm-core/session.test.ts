import { SessionManager } from '../../src/pm-core/SessionManager';
import Database from 'better-sqlite3';
import * as path from 'path';
import * as fs from 'fs';
import { v4 as uuidv4 } from 'uuid';

describe('T5.2 PM Core Session Isolation & State Rehydration', () => {
    let sessionManager: SessionManager;
    let dbPath: string;
    let projectId: string;
    let db: Database.Database;

    beforeAll(() => {
        dbPath = path.resolve(__dirname, '../../data/nexus_test_session.db');
        if (fs.existsSync(dbPath)) {
            fs.unlinkSync(dbPath);
        }
        db = new Database(dbPath);
        
        // Initialize schema for testing
        db.exec(`
            CREATE TABLE IF NOT EXISTS nexus_projects (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                status TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS nexus_tasks (
                id TEXT PRIMARY KEY,
                project_id TEXT NOT NULL,
                title TEXT NOT NULL,
                objective TEXT,
                lane TEXT NOT NULL,
                status TEXT DEFAULT 'created',
                max_retries INTEGER DEFAULT 3,
                retry_count INTEGER DEFAULT 0,
                payload_schema TEXT,
                ext_meta TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (project_id) REFERENCES nexus_projects(id)
            );
        `);
        
        sessionManager = new SessionManager(dbPath);
    });

    afterAll(() => {
        if (db) db.close();
        if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
    });

    it('AC1: /resume test_proj clears history and generates exact System Prompt with progress state', async () => {
        projectId = 'test_proj_rehydrate';
        
        db.exec(`INSERT INTO nexus_projects (id, name, status) VALUES ('${projectId}', 'Test Rehydrate', 'active')`);
        db.exec(`INSERT INTO nexus_tasks (id, project_id, title, lane, status) VALUES ('task_1', '${projectId}', 'Build DB Schema', 'LANE_CODE', 'completed')`);
        db.exec(`INSERT INTO nexus_tasks (id, project_id, title, lane, status) VALUES ('task_2', '${projectId}', 'Implement SSE API', 'LANE_API', 'dispatched')`);
        
        const projectMd = `# Project X
## Objective
Testing rehydration
`;

        const { systemPrompt } = await sessionManager.resumeSession(projectId, projectMd);
        
        expect(systemPrompt).toContain('You are resuming work on project test_proj_rehydrate.');
        expect(systemPrompt).toContain('=== PROJECT DOMAIN (PROJECT.md) ===');
        expect(systemPrompt).toContain('Testing rehydration');
        expect(systemPrompt).toContain('=== PROGRESS CHECK (STATE MACHINE) ===');
        expect(systemPrompt).toContain('- Task [task_1]: Build DB Schema | Lane: LANE_CODE | Status: completed');
        expect(systemPrompt).toContain('- Task [task_2]: Implement SSE API | Lane: LANE_API | Status: dispatched');
    });
});
