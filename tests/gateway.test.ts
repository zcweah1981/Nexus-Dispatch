import request from 'supertest';
import express from 'express';
import { TelegramGateway } from '../src/gateway/telegram_webhook';

describe('Channel Gateway (Telegram) Debouncing', () => {
  let app: express.Application;

  beforeEach(() => {
    app = express();
    app.use(express.json());
    const gateway = new TelegramGateway();
    app.use('/v1', gateway.router);
  });

  it('AC1: should debounce rapid duplicate update IDs within 2 seconds', async () => {
    const payload = {
      update_id: 123456789,
      message: {
        message_id: 1,
        chat: { id: 98765 },
        text: '/start project'
      }
    };

    // First request should be processed
    const res1 = await request(app).post('/v1/webhook/telegram').send(payload);
    expect(res1.status).toBe(200);
    expect(res1.body.status).toBe('processed');
    expect(res1.body.intent.updateId).toBe(123456789);

    // Immediate second request with same update_id should be ignored
    const res2 = await request(app).post('/v1/webhook/telegram').send(payload);
    expect(res2.status).toBe(200);
    expect(res2.body.status).toBe('ignored');
    expect(res2.body.reason).toBe('duplicate');
    
    // Simulate 5 rapid requests
    const promises = [];
    for(let i=0; i<3; i++) {
        promises.push(request(app).post('/v1/webhook/telegram').send(payload));
    }
    
    const responses = await Promise.all(promises);
    responses.forEach(res => {
         expect(res.status).toBe(200);
         expect(res.body.status).toBe('ignored');
         expect(res.body.reason).toBe('duplicate');
    });
  });
  
  it('should process different update IDs', async () => {
    const payload1 = { update_id: 100, message: { text: 'A' } };
    const payload2 = { update_id: 101, message: { text: 'B' } };

    const res1 = await request(app).post('/v1/webhook/telegram').send(payload1);
    expect(res1.body.status).toBe('processed');

    const res2 = await request(app).post('/v1/webhook/telegram').send(payload2);
    expect(res2.body.status).toBe('processed');
  });
});
