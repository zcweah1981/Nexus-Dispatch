import { Request, Response, NextFunction } from 'express';
import * as crypto from 'crypto';

interface UserIntent {
    source: string;
    update_id: string;
    message_id: string;
    text: string;
    timestamp: number;
}

export class TelegramGateway {
    // In-memory debounce cache: map of update_id to timestamp
    private debounceCache: Map<string, number> = new Map();
    // 2 seconds TTL
    private DEBOUNCE_TTL_MS: number = 2000;

    constructor() {}

    /**
     * Express middleware for debouncing incoming webhooks
     */
    public debounceMiddleware = (req: Request, res: Response, next: NextFunction) => {
        const updateId = req.body?.update_id;

        if (!updateId) {
            // Missing update_id: either not telegram or malformed
            return res.status(400).json({ error: 'Missing update_id' });
        }

        const updateIdStr = String(updateId);
        const now = Date.now();
        const lastSeen = this.debounceCache.get(updateIdStr);

        if (lastSeen && (now - lastSeen < this.DEBOUNCE_TTL_MS)) {
            console.log(`[Gateway] Debounced duplicate webhook update_id: ${updateIdStr}`);
            // Return 200 OK immediately so Telegram doesn't retry
            return res.status(200).json({ status: 'ignored_duplicate' });
        }

        // Cache the update_id
        this.debounceCache.set(updateIdStr, now);

        // Housekeeping: remove stale entries
        for (const [id, timestamp] of this.debounceCache.entries()) {
            if (now - timestamp >= this.DEBOUNCE_TTL_MS) {
                this.debounceCache.delete(id);
            }
        }

        next();
    };

    /**
     * Parses the raw Telegram webhook payload and assembles a standardized UserIntent object.
     * Does NOT perform business logic breakdown or DB writes.
     */
    public parseIntent(payload: any): UserIntent | null {
        if (!payload || !payload.message) {
            return null;
        }

        const message = payload.message;
        
        return {
            source: 'telegram',
            update_id: String(payload.update_id),
            message_id: String(message.message_id),
            text: message.text || '',
            timestamp: message.date * 1000 // Telegram date is in seconds
        };
    }
}
