/**
 * Nexus Dispatch API Server
 * V8-R10: production entry exposes V8/API-only routes and keeps legacy direct DB routes disconnected.
 */

import express = require('express');
import cors = require('cors');
import { EventEmitter } from 'events';

import { createApiRouter } from './routes';
import { createRealtimeRouter } from './realtime_events';
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
  app.use('/api/v1', createRealtimeRouter(stateEmitter));
  app.use('/api/v1', createApiRouter(authToken, prismaDal));

  // ─── 404 handler for unmatched API routes ─────────────────────────
  app.use('/api/v1', notFoundHandler);

  // ─── Global error handler (must be last) ──────────────────────────
  app.use(globalErrorHandler);

  return app;
}
