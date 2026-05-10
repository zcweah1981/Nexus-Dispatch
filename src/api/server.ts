/**
 * Nexus Dispatch API Server
 * V8-R10: production entry exposes V8/API-only routes and keeps legacy direct DB routes disconnected.
 */

import express = require('express');
import { Request, Response } from 'express';
import cors = require('cors');
import { EventEmitter } from 'events';

import { createApiRouter } from './routes';
import { PrismaDAL } from '../db/prisma_dal';
import {
  bearerAuth,
  notFoundHandler,
  globalErrorHandler,
} from './middleware';

// Event emitter to broadcast state changes
export const stateEmitter = new EventEmitter();

export function createServer(arg1?: string | unknown, arg2?: PrismaDAL | string, arg3?: PrismaDAL) {
  const authToken = typeof arg1 === 'string' ? arg1 : (typeof arg2 === 'string' ? arg2 : 'valid-token');
  const prismaDal = (arg3 ?? (typeof arg2 !== 'string' ? arg2 : undefined)) as PrismaDAL | undefined;
  const app = express();

  // Enable CORS for frontend connection
  app.use(cors());
  app.use(express.json());

  // ─── Auth middleware: ALL /api/v1/* routes require Bearer token ────
  app.use('/api/v1', bearerAuth(authToken));

  // ─── API Router (all /api/v1/* business routes) ───────────────────
  app.use('/api/v1', createApiRouter(authToken, prismaDal));

  // SSE Endpoint for frontend (no auth — public event stream)
  app.get('/events/stream', (req: Request, res: Response) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('Access-Control-Allow-Origin', '*');

    res.write(`data: ${JSON.stringify({ type: 'connected', message: 'SSE connection established' })}\n\n`);

    const heartbeat = setInterval(() => {
      res.write(`data: ${JSON.stringify({ type: 'ping', timestamp: Date.now() })}\n\n`);
    }, 15000);

    const onStateChange = (event: any) => {
      res.write(`data: ${JSON.stringify(event)}\n\n`);
    };

    stateEmitter.on('state_change', onStateChange);

    req.on('close', () => {
      clearInterval(heartbeat);
      stateEmitter.off('state_change', onStateChange);
    });
  });

  // ─── 404 handler for unmatched API routes ─────────────────────────
  app.use('/api/v1', notFoundHandler);

  // ─── Global error handler (must be last) ──────────────────────────
  app.use(globalErrorHandler);

  return app;
}
