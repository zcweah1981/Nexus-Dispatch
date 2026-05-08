import express from 'express';
import request from 'supertest';
import { TelegramGateway } from './telegram_webhook';
import { describe, it, expect, beforeEach } from '@jest/globals';

describe('TelegramGateway', () => {
  let app: express.Application;
  let gateway: TelegramGateway;

  beforeEach(() => {
    app = express();
    app.use(express.json());
    gateway = new TelegramGateway();
    app.use('/v1', gateway.router);
  });

  it('should ignore duplicate updates within debounce window', async () => {
    const payload = {
      update_id: 12345,
      message: {
        message_id: 1,
        chat: { id: 987 },
        text: 'hello'
      }
    };

    // First request should be processed
    const res1 = await request(app).post('/v1/webhook/telegram').send(payload);
    expect(res1.status).toBe(200);
    expect(res1.body.status).toBe('processed');

    // Second request immediately after should be ignored as duplicate
    const res2 = await request(app).post('/v1/webhook/telegram').send(payload);
    expect(res2.status).toBe(200);
    expect(res2.body.status).toBe('ignored');
    expect(res2.body.reason).toBe('duplicate');
  });

  it('should process multiple identical concurrent updates, allowing only the first', async () => {
      const payload = {
          update_id: 67890,
          message: {
              message_id: 2,
              chat: { id: 987 },
              text: '/start'
          }
      };

      const promises = Array(5).fill(null).map(() =>
          request(app).post('/v1/webhook/telegram').send(payload)
      );

      const results = await Promise.all(promises);

      const processed = results.filter(r => r.body.status === 'processed');
      const ignored = results.filter(r => r.body.status === 'ignored' && r.body.reason === 'duplicate');

      expect(processed.length).toBe(1);
      expect(ignored.length).toBe(4);
  });
});