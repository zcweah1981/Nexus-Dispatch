import { describe, expect, it, beforeEach } from '@jest/globals';
import http from 'http';
import request from 'supertest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { createServer, stateEmitter } from '../../src/api/server';

const TOKEN = 'test-token';

function readSseBody(url: string, headers: Record<string, string>, emit: () => void, windowMs = 180): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = '';
    const req = http.get(url, { headers }, (res) => {
      res.on('data', (chunk: Buffer) => {
        data += chunk.toString();
      });
      setTimeout(() => {
        emit();
      }, 30);
      setTimeout(() => {
        res.destroy();
        resolve(data);
      }, windowMs);
    });
    req.on('error', reject);
    req.setTimeout(2000, () => {
      req.destroy();
      resolve(data);
    });
  });
}

describe('R39-T3 project-scoped realtime event stream', () => {
  beforeEach(() => {
    stateEmitter.removeAllListeners('state_change');
    jest.resetModules();
  });

  it('serves authenticated /api/v1/events/stream with connection state and filters events by project_id', async () => {
    const { createServer: freshCreateServer, stateEmitter: freshEmitter } = await import('../../src/api/server');
    const app = freshCreateServer(TOKEN);
    const server = http.createServer(app);
    await new Promise<void>((resolve) => server.listen(0, () => resolve()));
    const port = (server.address() as any).port;

    try {
      const body = await readSseBody(
        `http://127.0.0.1:${port}/api/v1/events/stream?project_id=project-a`,
        { Authorization: `Bearer ${TOKEN}`, Accept: 'text/event-stream' },
        () => {
          freshEmitter.emit('state_change', { type: 'task_transitioned', data: { project_id: 'project-b', task_id: 'other-task', new_status: 'running' } });
          freshEmitter.emit('state_change', { type: 'task_transitioned', data: { project_id: 'project-a', task_id: 'visible-task', new_status: 'running' } });
        },
      );

      expect(body).toContain('event: connected');
      expect(body).toContain('connection_id');
      expect(body).toContain('event: state_change');
      expect(body).toContain('visible-task');
      expect(body).not.toContain('other-task');

      const state = await request(app)
        .get('/api/v1/runtime/projects/project-a/events/state')
        .set('Authorization', `Bearer ${TOKEN}`)
        .expect(200);
      expect(state.body).toMatchObject({ project_id: 'project-a' });
      expect(state.body.connection_state).toMatchObject({ transport: 'sse', project_scoped: true });
      expect(state.body.connection_state.active_connections).toBeGreaterThanOrEqual(0);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it('exposes project-scoped polling fallback without leaking cross-project events', async () => {
    const { createServer: freshCreateServer, stateEmitter: freshEmitter } = await import('../../src/api/server');
    const app = freshCreateServer(TOKEN);

    freshEmitter.emit('state_change', { type: 'report_created', data: { project_id: 'project-a', report_id: 'report-a', summary: 'safe summary' } });
    freshEmitter.emit('state_change', { type: 'report_created', data: { project_id: 'project-b', report_id: 'report-b', summary: 'must not leak' } });

    const res = await request(app)
      .get('/api/v1/runtime/projects/project-a/events/poll')
      .set('Authorization', `Bearer ${TOKEN}`)
      .expect(200);

    expect(res.body).toMatchObject({ project_id: 'project-a', transport: 'polling' });
    const serialized = JSON.stringify(res.body.events);
    expect(serialized).toContain('report-a');
    expect(serialized).not.toContain('report-b');
    expect(res.body.next_cursor).toBeGreaterThan(0);
  });

  it('WebUI realtime client uses project-scoped EventSource plus polling fallback and no DB/file access', () => {
    const hookSource = readFileSync(join(__dirname, '../../src/webui/src/hooks/useSSE.ts'), 'utf8');
    const apiClientSource = readFileSync(join(__dirname, '../../src/webui/src/apiClient.ts'), 'utf8');
    const webuiRealtimeSource = `${hookSource}\n${apiClientSource}`;

    expect(webuiRealtimeSource).toContain('R39_REALTIME_PROJECT_SCOPED_STREAM_CONTRACT');
    expect(webuiRealtimeSource).toContain('project_id=');
    expect(webuiRealtimeSource).toContain('pollRealtimeEvents');
    expect(webuiRealtimeSource).toContain('/events/poll');
    expect(webuiRealtimeSource).toContain('connection_state');
    expect(webuiRealtimeSource).not.toMatch(/better-sqlite3|sqlite3|@prisma\/client|PrismaClient|DATABASE_URL|process\.env|\bfs\b|readFile|writeFile|\/root\/|bot_token|chat_id/);
  });
});
