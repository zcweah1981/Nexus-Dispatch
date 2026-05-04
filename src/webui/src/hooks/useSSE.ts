/**
 * useSSE — Shared EventSource hook with automatic reconnection.
 *
 * AC: EventSource 连接 /api/v1/events/stream + 断线自动重连
 *
 * Features:
 *  - Connects to /api/v1/events/stream (proxied by Vite dev server)
 *  - Listens for named SSE events: `state_change`
 *  - Auto-reconnects with exponential backoff (1s → 2s → 4s → max 30s)
 *  - Provides latest event + full event history for consumers
 *  - Cleans up on unmount
 */

import { useEffect, useRef, useState, useCallback } from 'react';

// ─── SSE Event Types ──────────────────────────────────────────────

export type SSEEventType =
  | 'connected'
  | 'ping'
  // Task lifecycle
  | 'task_created'
  | 'task_status_updated'
  | 'task_acknowledged'
  | 'task_accepted'
  | 'task_rejected'
  | 'tasks_batch_injected'
  | 'tasks_recovered'
  // Run lifecycle
  | 'run_created'
  | 'run_status_updated'
  // Agent lifecycle
  | 'agent_registered'
  | 'agent_status_updated'
  // Artifact
  | 'artifact_created'
  // Review
  | 'review_spawned'
  // Controller
  | 'controller_config_updated';

export interface SSEEvent {
  type: SSEEventType;
  data: Record<string, any>;
  timestamp?: number;
}

export interface SSEState {
  /** Whether the EventSource connection is currently open */
  connected: boolean;
  /** The most recent event received */
  lastEvent: SSEEvent | null;
  /** Number of reconnection attempts since last successful connect */
  reconnectCount: number;
}

const SSE_URL = '/api/v1/events/stream';
const MAX_BACKOFF_MS = 30_000;
const INITIAL_BACKOFF_MS = 1_000;

export function useSSE(): SSEState {
  const [state, setState] = useState<SSEState>({
    connected: false,
    lastEvent: null,
    reconnectCount: 0,
  });

  const esRef = useRef<EventSource | null>(null);
  const backoffRef = useRef(INITIAL_BACKOFF_MS);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);

  const connect = useCallback(() => {
    // Clean up previous connection if any
    if (esRef.current) {
      esRef.current.close();
      esRef.current = null;
    }

    const es = new EventSource(SSE_URL);
    esRef.current = es;

    es.onopen = () => {
      if (!mountedRef.current) return;
      backoffRef.current = INITIAL_BACKOFF_MS;
      setState(prev => ({ ...prev, connected: true, reconnectCount: 0 }));
    };

    // The backend sends named events: `event: state_change\ndata: {...}\n\n`
    // EventSource fires addEventListener('state_change', ...) for these.
    es.addEventListener('state_change', (rawEvent: MessageEvent) => {
      if (!mountedRef.current) return;
      try {
        const parsed: SSEEvent = JSON.parse(rawEvent.data);
        setState(prev => ({
          ...prev,
          connected: true,
          lastEvent: parsed,
        }));
      } catch (err) {
        console.error('[useSSE] Failed to parse state_change event:', err);
      }
    });

    // Fallback: unnamed events (e.g. `connected`, `ping`)
    es.onmessage = (rawEvent: MessageEvent) => {
      if (!mountedRef.current) return;
      try {
        const parsed: SSEEvent = JSON.parse(rawEvent.data);
        if (parsed.type !== 'ping') {
          setState(prev => ({
            ...prev,
            connected: true,
            lastEvent: parsed,
          }));
        }
      } catch {
        // Ignore non-JSON messages (e.g. heartbeat comments)
      }
    };

    es.onerror = () => {
      if (!mountedRef.current) return;
      es.close();
      esRef.current = null;
      setState(prev => ({ ...prev, connected: false }));

      // Schedule reconnect with exponential backoff
      const delay = backoffRef.current;
      backoffRef.current = Math.min(backoffRef.current * 2, MAX_BACKOFF_MS);

      reconnectTimerRef.current = setTimeout(() => {
        if (!mountedRef.current) return;
        setState(prev => ({ ...prev, reconnectCount: prev.reconnectCount + 1 }));
        connect();
      }, delay);
    };
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    connect();

    return () => {
      mountedRef.current = false;
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
      }
      if (esRef.current) {
        esRef.current.close();
        esRef.current = null;
      }
    };
  }, [connect]);

  return state;
}
