#!/usr/bin/env node
// R34_MOCK_WORKER_EXAMPLE_CONTRACT
'use strict';

const http = require('http');
const { randomUUID } = require('crypto');

const PORT = Number(process.env.MOCK_WORKER_PORT || 18647);
const HOST = process.env.MOCK_WORKER_HOST || '127.0.0.1';

function readJson(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk;
      if (body.length > 1024 * 1024) {
        reject(new Error('request_too_large'));
        req.destroy();
      }
    });
    req.on('end', () => {
      if (!body.trim()) return resolve({});
      try {
        resolve(JSON.parse(body));
      } catch (error) {
        reject(new Error('invalid_json'));
      }
    });
    req.on('error', reject);
  });
}

function sendJson(res, status, payload) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(payload, null, 2));
}

function extractDispatch(openAiBody) {
  const userMessage = Array.isArray(openAiBody.messages)
    ? openAiBody.messages.find(message => message && message.role === 'user')
    : null;
  if (!userMessage || typeof userMessage.content !== 'string') return null;
  try {
    const parsed = JSON.parse(userMessage.content);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

const server = http.createServer(async (req, res) => {
  if (req.method === 'GET' && req.url === '/health') {
    return sendJson(res, 200, { ok: true, service: 'nexus-dispatch-mock-worker' });
  }

  if (req.method !== 'POST' || req.url !== '/v1/runs') {
    return sendJson(res, 404, { error: 'not_found', expected: 'POST /v1/runs' });
  }

  try {
    const body = await readJson(req);
    const dispatch = extractDispatch(body);
    const metadata = body && typeof body === 'object' && body.metadata && typeof body.metadata === 'object'
      ? body.metadata
      : {};
    const task = dispatch && dispatch.task && typeof dispatch.task === 'object' ? dispatch.task : {};
    const workerRunId = `mock-worker-${randomUUID()}`;

    return sendJson(res, 202, {
      worker_run_id: workerRunId,
      status: 'accepted',
      message: 'Mock worker received dispatch payload and produced smoke proof. It does not mark tasks complete by itself.',
      metadata: {
        project_id: metadata.project_id || (dispatch && dispatch.project_id),
        task_id: metadata.task_id || task.id,
        run_id: metadata.run_id || (dispatch && dispatch.run_id),
        agent_id: metadata.agent_id || (dispatch && dispatch.agent && dispatch.agent.agent_id),
        lease_token: metadata.lease_token || (dispatch && dispatch.lease && dispatch.lease.lease_token),
      },
      proof: {
        contract: 'openai-compatible-dispatch-smoke',
        handled_task_title: task.title || null,
        received_messages: Array.isArray(body.messages) ? body.messages.length : 0,
        no_private_dependencies: true,
      },
    });
  } catch (error) {
    return sendJson(res, 400, { error: error.message || 'bad_request' });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`mock worker listening on http://${HOST}:${PORT}/v1/runs`);
});

process.on('SIGTERM', () => server.close(() => process.exit(0)));
process.on('SIGINT', () => server.close(() => process.exit(0)));
