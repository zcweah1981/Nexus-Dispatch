import express, { Request, Response, Router } from 'express';

export interface UserIntent {
  updateId: number;
  messageId: number;
  chatId: number;
  text: string;
  receivedAt: number;
}

const DEBOUNCE_WINDOW_MS = 2000;

export class TelegramGateway {
  public router: Router;
  private processedUpdates = new Map<number, number>(); // update_id -> timestamp

  constructor() {
    this.router = express.Router();
    this.setupRoutes();
  }

  private setupRoutes() {
    this.router.post('/webhook/telegram', this.handleWebhook.bind(this));
  }

  private isDuplicate(updateId: number): boolean {
    const now = Date.now();
    
    // Clean up old entries to prevent memory leak
    for (const [key, timestamp] of this.processedUpdates.entries()) {
        if (now - timestamp > DEBOUNCE_WINDOW_MS * 2) {
             this.processedUpdates.delete(key);
        }
    }

    if (this.processedUpdates.has(updateId)) {
      const lastProcessed = this.processedUpdates.get(updateId)!;
      if (now - lastProcessed < DEBOUNCE_WINDOW_MS) {
        return true;
      }
    }

    this.processedUpdates.set(updateId, now);
    return false;
  }

  private parseIntent(body: any): UserIntent | null {
      if (!body || !body.update_id) return null;
      
      const updateId = body.update_id;
      let messageId = 0;
      let chatId = 0;
      let text = '';
      
      if (body.message) {
          messageId = body.message.message_id;
          chatId = body.message.chat?.id;
          text = body.message.text || '';
      } else if (body.edited_message) {
          messageId = body.edited_message.message_id;
          chatId = body.edited_message.chat?.id;
          text = body.edited_message.text || '';
      } else if (body.callback_query) {
          messageId = body.callback_query.message?.message_id;
          chatId = body.callback_query.message?.chat?.id;
          text = body.callback_query.data || '';
      } else {
          return null; // Ignore unknown updates
      }
      
      return {
          updateId,
          messageId,
          chatId,
          text,
          receivedAt: Date.now()
      };
  }

  private handleWebhook(req: Request, res: Response) {
      const body = req.body;
      
      if (!body || !body.update_id) {
          return res.status(400).json({ error: 'Invalid update format' });
      }

      const updateId = body.update_id;

      if (this.isDuplicate(updateId)) {
          // Send 200 OK so Telegram doesn't retry, but ignore the payload
          return res.status(200).json({ status: 'ignored', reason: 'duplicate' });
      }

      const intent = this.parseIntent(body);
      
      if (!intent) {
           return res.status(200).json({ status: 'ignored', reason: 'unsupported_type' });
      }
      
      // Pass the intent to the PM Sandbox layer (simulated here)
      // IN A REAL APP: PmSandbox.processIntent(intent)
      
      return res.status(200).json({ status: 'processed', intent });
  }
}
