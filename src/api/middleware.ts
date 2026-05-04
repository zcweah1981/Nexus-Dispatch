/**
 * Nexus Dispatch API — Middleware Layer
 * T2.6: API 鉴权 + 输入校验加固
 *
 * - bearerAuth():  Bearer Token 校验，无效/缺失返回 401
 * - validateBody(schema): Ajv JSON Schema 校验，不匹配返回 422
 * - Standard error shape: { error: string, code: string, details?: any }
 */

import { Request, Response, NextFunction } from 'express';
import Ajv, { ValidateFunction } from 'ajv';

const ajv = new Ajv({ allErrors: true });

// ─── Standard Error Response Helpers ────────────────────────────────

export interface ApiError {
  error: string;
  code: string;
  details?: any;
}

export function sendError(res: Response, status: number, error: string, code: string, details?: any): Response {
  const body: ApiError = { error, code };
  if (details !== undefined) body.details = details;
  return res.status(status).json(body);
}

// Error code constants
export const ErrorCodes = {
  UNAUTHORIZED:       'UNAUTHORIZED',
  FORBIDDEN:          'FORBIDDEN',
  NOT_FOUND:          'NOT_FOUND',
  VALIDATION_ERROR:   'VALIDATION_ERROR',
  BAD_REQUEST:        'BAD_REQUEST',
  INTERNAL_ERROR:     'INTERNAL_ERROR',
} as const;

// ─── Bearer Token Auth Middleware ────────────────────────────────────

export function bearerAuth(authToken: string) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const authHeader = req.headers.authorization;

    // Missing header entirely
    if (!authHeader) {
      sendError(res, 401, 'Missing Authorization header', ErrorCodes.UNAUTHORIZED);
      return;
    }

    // Must be "Bearer <token>" format
    const parts = authHeader.split(' ');
    if (parts.length !== 2 || parts[0] !== 'Bearer') {
      sendError(res, 401, 'Invalid Authorization header format. Expected: Bearer <token>', ErrorCodes.UNAUTHORIZED);
      return;
    }

    const token = parts[1];

    // Constant-time comparison to prevent timing attacks
    if (token.length !== authToken.length || !timingSafeEqual(token, authToken)) {
      sendError(res, 401, 'Invalid or expired token', ErrorCodes.UNAUTHORIZED);
      return;
    }

    next();
  };
}

// Simple constant-time string comparison
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

// ─── Ajv JSON Schema Validation Middleware ──────────────────────────

// Cache compiled validators by schema key for performance
const validatorCache = new Map<string, ValidateFunction>();

export function validateBody(schemaKey: string, schema: object) {
  let validate: ValidateFunction;

  if (validatorCache.has(schemaKey)) {
    validate = validatorCache.get(schemaKey)!;
  } else {
    validate = ajv.compile(schema);
    validatorCache.set(schemaKey, validate);
  }

  return (req: Request, res: Response, next: NextFunction): void => {
    // If body is not an object (missing / null / parse failure), reject
    if (!req.body || typeof req.body !== 'object') {
      sendError(res, 400, 'Request body must be a JSON object', ErrorCodes.BAD_REQUEST);
      return;
    }

    const valid = validate(req.body);
    if (!valid) {
      const errors = validate.errors?.map(e => ({
        field:   (e.instancePath || '/').replace(/^\//, '') || 'root',
        message: e.message || 'Validation failed',
        params:  e.params,
      }));
      sendError(res, 422, 'Request body validation failed', ErrorCodes.VALIDATION_ERROR, errors);
      return;
    }

    next();
  };
}

// ─── 404 Handler for unmatched /api/v1/* routes ─────────────────────

export function notFoundHandler(req: Request, res: Response): void {
  sendError(res, 404, `Route not found: ${req.method} ${req.path}`, ErrorCodes.NOT_FOUND);
}

// ─── Global Error Handler (catch-all) ───────────────────────────────

export function globalErrorHandler(err: Error, req: Request, res: Response, _next: NextFunction): void {
  console.error('[API Error]', err.message, err.stack);
  sendError(res, 500, 'Internal server error', ErrorCodes.INTERNAL_ERROR, { message: err.message });
}
