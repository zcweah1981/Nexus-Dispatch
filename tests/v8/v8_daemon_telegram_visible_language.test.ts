import express from 'express';
import http from 'http';
import Daemon, { AgentNotificationConfig } from '../../src/daemon/main';

describe('R12-T4 daemon Telegram visible language wiring', () => {
  let server: http.Server;
  let baseUrl: string;

  afterEach(async () => {
    if (server) {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  async function startRuntimeStub(visibleLanguage: 'zh-CN' | 'en-US') {
    const app = express();
    app.use(express.json());

    app.post('/api/v1/runtime/tasks/recover-timeouts', (_req, res) => {
      res.json({ recovered: 0, task_ids: [] });
    });
    app.get('/api/v1/runtime/tasks/pending', (_req, res) => {
      res.json({
        tasks: [
          {
            id: 'task-r12-daemon-visible-language',
            project_id: 'project-r12-visible',
            title: 'Wire daemon Telegram language',
            description: 'visible copy must follow project setting',
            lane_required: 'DEV',
          },
        ],
      });
    });
    app.get('/api/v1/runtime/projects/project-r12-visible/agents', (_req, res) => {
      res.json({
        agents: [
          {
            id: 'agent-r12-long',
            agent_id: 'long-coder-1',
            endpoint: `${baseUrl}/worker/long`,
            lane: 'DEV',
            dialect: 'openclaw',
            status: 'online',
          },
        ],
      });
    });
    app.get('/api/v1/runtime/projects/project-r12-visible/settings/visible-language', (_req, res) => {
      res.json({ project_id: 'project-r12-visible', visible_language: visibleLanguage, supported: ['zh-CN', 'en-US'] });
    });
    app.post('/api/v1/runtime/tasks/task-r12-daemon-visible-language/claim', (_req, res) => {
      res.json({ ok: true });
    });
    app.post('/api/v1/runtime/runs', (_req, res) => {
      res.status(201).json({ run: { run_id: 'run-r12-visible' } });
    });
    app.post('/worker/long', (_req, res) => {
      res.json({ ok: true });
    });

    server = http.createServer(app);
    await new Promise<void>((resolve) => server.listen(0, () => resolve()));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('runtime stub did not bind a TCP port');
    baseUrl = `http://127.0.0.1:${address.port}`;
    return `${baseUrl}/api/v1`;
  }

  async function runDaemonTick(visibleLanguage: 'zh-CN' | 'en-US') {
    const messages: Array<{ config: AgentNotificationConfig; message: string }> = [];
    const apiUrl = await startRuntimeStub(visibleLanguage);
    const daemon = new Daemon({
      apiUrl,
      authToken: 'test-token',
      projectId: 'project-r12-visible',
      dispatchTimeout: 3000,
      tickInterval: 5000,
      recoveryTimeoutMinutes: 15,
      agentNotifications: {
        'long-coder-1': { bot_token: 'fake-agent-bot-token', chat_id: '<group-chat-id>' },
      },
      notificationFn: async (config, message) => {
        messages.push({ config, message });
      },
    });

    const result = await daemon.tick();
    await daemon.stop();
    expect(result.dispatched).toBe(1);
    expect(messages).toHaveLength(1);
    expect(messages[0].config).toEqual({ bot_token: 'fake-agent-bot-token', chat_id: '<group-chat-id>' });
    return messages[0].message;
  }

  test('reads project visible_language before Telegram dispatch and keeps AGENT_NOTIFICATIONS bot/chat only', async () => {
    const message = await runDaemonTick('en-US');

    expect(message).toContain('[Task accepted]');
    expect(message).toContain('Task: Wire daemon Telegram language');
    expect(message).toContain('Owner: Long');
    expect(message).toContain('Proof stored in system');
    expect(message).not.toContain('任务已派发已接单');
    expect(message).not.toContain('Task ID');
    expect(message).not.toContain('task-r12-daemon-visible-language');
  }, 30000);

  test('falls back to zh-CN Telegram dispatch body when project setting remains default', async () => {
    const message = await runDaemonTick('zh-CN');

    expect(message).toContain('【接单】');
    expect(message).toContain('任务：Wire daemon Telegram language');
    expect(message).toContain('执行：Long');
    expect(message).toContain('Proof 已存系统');
    expect(message).not.toContain('[Task accepted]');
    expect(message).not.toContain('Task ID');
  }, 30000);
});
