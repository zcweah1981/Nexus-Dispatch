import { SessionManager } from '../../src/pm-core/SessionManager';
import * as http from 'http';

/**
 * T5.2 PM Core Session Isolation & State Rehydration
 *
 * V2: Tests the API-driven SessionManager (no better-sqlite3 imports).
 * Spins up a minimal HTTP server to mock the API layer, verifying that
 * rehydrateState correctly consumes the RESTful API and builds the prompt.
 */
describe('T5.2 PM Core Session Isolation & State Rehydration (API-driven)', () => {
    let sessionManager: SessionManager;
    let mockServer: http.Server;
    let mockServerPort: number;
    let receivedRequests: { url: string; headers: Record<string, string> }[] = [];

    beforeAll(async () => {
        // Set up a minimal mock API server
        mockServer = http.createServer((req, res) => {
            receivedRequests.push({
                url: req.url || '/',
                headers: req.headers as Record<string, string>,
            });

            res.writeHead(200, { 'Content-Type': 'application/json' });

            if (req.url?.includes('/api/v1/tasks')) {
                // Return mock tasks
                res.end(JSON.stringify([
                    { id: 'task_1', title: 'Build DB Schema', lane: 'LANE_CODE', status: 'completed' },
                    { id: 'task_2', title: 'Implement SSE API', lane: 'LANE_API', status: 'dispatched' },
                ]));
            } else {
                res.end(JSON.stringify([]));
            }
        });

        await new Promise<void>((resolve) => {
            mockServer.listen(0, () => resolve());
        });
        mockServerPort = (mockServer.address() as any).port;

        sessionManager = new SessionManager(`http://localhost:${mockServerPort}`, 'test-token');
    });

    afterAll(async () => {
        await new Promise<void>((resolve) => mockServer.close(() => resolve()));
    });

    beforeEach(() => {
        receivedRequests = [];
    });

    it('AC1: /resume test_proj clears history and generates exact System Prompt with progress state', async () => {
        const projectId = 'test_proj_rehydrate';
        const projectMd = `# Project X\n## Objective\nTesting rehydration\n`;

        const { systemPrompt } = await sessionManager.resumeSession(projectId, projectMd);

        // Verify system prompt content
        expect(systemPrompt).toContain('You are resuming work on project test_proj_rehydrate.');
        expect(systemPrompt).toContain('=== PROJECT DOMAIN (PROJECT.md) ===');
        expect(systemPrompt).toContain('Testing rehydration');
        expect(systemPrompt).toContain('=== PROGRESS CHECK (STATE MACHINE) ===');
        expect(systemPrompt).toContain('- Task [task_1]: Build DB Schema | Lane: LANE_CODE | Status: completed');
        expect(systemPrompt).toContain('- Task [task_2]: Implement SSE API | Lane: LANE_API | Status: dispatched');
    });

    it('AC2: SessionManager calls API endpoint (no direct DB access)', async () => {
        const projectId = 'api_verification_proj';
        await sessionManager.rehydrateState(projectId, '# Test');

        // Verify the API was called
        expect(receivedRequests.length).toBeGreaterThanOrEqual(1);
        const req = receivedRequests[0];
        expect(req.url).toContain('/api/v1/tasks');
        expect(req.url).toContain(encodeURIComponent(projectId));
        // Verify auth token was passed
        expect(req.headers['authorization']).toBe('Bearer test-token');
    });

    it('AC3: handles API failure gracefully (returns empty task list)', async () => {
        // Create a session manager pointing to a non-existent server
        const badManager = new SessionManager('http://localhost:1', 'bad-token');
        const result = await badManager.rehydrateState('ghost_project', '# Ghost');
        expect(result).toContain('No active tasks found');
    });

    it('R7-T3: selecting a Telegram session only records the current project selector and never mutates cronjob registry', async () => {
        const calls: Array<{ projectId: string; action: string }> = [];
        const selectorManager = new SessionManager(`http://localhost:${mockServerPort}`, 'test-token', {
            onCronjobMutationAttempt: async (projectId: string, action: string) => {
                calls.push({ projectId, action });
                throw new Error(`cronjob mutation should not be called: ${action}`);
            },
        });

        const selected = await selectorManager.selectTelegramSessionProject('telegram-chat-42', 'api_verification_proj');

        expect(selected).toEqual({
            chat_id: 'telegram-chat-42',
            project_id: 'api_verification_proj',
        });
        expect(selectorManager.getSelectedTelegramSessionProject('telegram-chat-42')).toBe('api_verification_proj');
        expect(calls).toEqual([]);
        expect(receivedRequests).toEqual([]);
    });
});
