import { TelegramGateway } from '../../src/gateway/TelegramGateway';
import { Request, Response, NextFunction } from 'express';

describe('T5.1 Channel Gateway (Telegram) Debounce & Anti-Reentrancy', () => {
    let gateway: TelegramGateway;

    beforeEach(() => {
        gateway = new TelegramGateway();
        jest.useFakeTimers();
    });

    afterEach(() => {
        jest.useRealTimers();
    });

    it('AC1: Should allow the first webhook and drop subsequent identical update_ids within 2 seconds', () => {
        const req1 = { body: { update_id: 'update123' } } as Request;
        const res1 = {
            status: jest.fn().mockReturnThis(),
            json: jest.fn()
        } as unknown as Response;
        const next1 = jest.fn();

        // 1st request -> next() called
        gateway.debounceMiddleware(req1, res1, next1);
        expect(next1).toHaveBeenCalled();
        expect(res1.status).not.toHaveBeenCalled();

        // 2nd request (instant) -> dropped, 200 OK returned
        const req2 = { body: { update_id: 'update123' } } as Request;
        const res2 = {
            status: jest.fn().mockReturnThis(),
            json: jest.fn()
        } as unknown as Response;
        const next2 = jest.fn();
        gateway.debounceMiddleware(req2, res2, next2);
        expect(next2).not.toHaveBeenCalled();
        expect(res2.status).toHaveBeenCalledWith(200);
        expect(res2.json).toHaveBeenCalledWith({ status: 'ignored_duplicate' });

        // 3rd request (+1.5s) -> dropped
        jest.advanceTimersByTime(1500);
        const req3 = { body: { update_id: 'update123' } } as Request;
        const res3 = {
            status: jest.fn().mockReturnThis(),
            json: jest.fn()
        } as unknown as Response;
        const next3 = jest.fn();
        gateway.debounceMiddleware(req3, res3, next3);
        expect(next3).not.toHaveBeenCalled();
        expect(res3.status).toHaveBeenCalledWith(200);

        // 4th request (+2.1s from start) -> allowed
        jest.advanceTimersByTime(600);
        const req4 = { body: { update_id: 'update123' } } as Request;
        const res4 = {
            status: jest.fn().mockReturnThis(),
            json: jest.fn()
        } as unknown as Response;
        const next4 = jest.fn();
        gateway.debounceMiddleware(req4, res4, next4);
        expect(next4).toHaveBeenCalled();
        expect(res4.status).not.toHaveBeenCalled();
    });

    it('Should parse valid Telegram intent', () => {
        const payload = {
            update_id: 1234567,
            message: {
                message_id: 888,
                date: 1714731234,
                text: '/resume nexus_project'
            }
        };

        const intent = gateway.parseIntent(payload);
        expect(intent).toEqual({
            source: 'telegram',
            update_id: '1234567',
            message_id: '888',
            text: '/resume nexus_project',
            timestamp: 1714731234000
        });
    });
});
