import { Request, Response, Router } from 'express';
import { EventEmitter } from 'events';

export interface RuntimeRealtimeEvent {
  id: number;
  type: string;
  data: Record<string, any>;
  timestamp: number;
}

interface RealtimeConnection {
  connection_id: string;
  project_id: string | null;
  connected_at: number;
}

export class RealtimeEventHub {
  private events: RuntimeRealtimeEvent[] = [];
  private connections = new Map<string, RealtimeConnection>();
  private nextEventId = 1;

  private maxBufferedEvents = 500;
  private droppedEventsCount = 0;

  constructor(maxEvents = 500) {
    this.maxBufferedEvents = maxEvents;
  }

  record(rawEvent: any): RuntimeRealtimeEvent {
    const event: RuntimeRealtimeEvent = {
      id: this.nextEventId++,
      type: String(rawEvent?.type ?? 'unknown'),
      data: rawEvent?.data && typeof rawEvent.data === 'object' ? rawEvent.data : {},
      timestamp: typeof rawEvent?.timestamp === 'number' ? rawEvent.timestamp : Date.now(),
    };
    this.events.push(event);
    if (this.events.length > this.maxBufferedEvents) {
      this.droppedEventsCount += (this.events.length - this.maxBufferedEvents);
      this.events.splice(0, this.events.length - this.maxBufferedEvents);
    }
    return event;
  }

  shouldDeliver(event: RuntimeRealtimeEvent | any, projectId?: string | null): boolean {
    if (!projectId) return true;
    const data = event?.data ?? {};
    const eventProjectId = data.project_id ?? event?.project_id;
    return eventProjectId === projectId;
  }

  poll(projectId: string, after = 0, limit = 100): RuntimeRealtimeEvent[] {
    const safeLimit = Math.max(1, Math.min(limit, 200));
    return this.events
      .filter((event) => event.id > after && this.shouldDeliver(event, projectId))
      .slice(0, safeLimit);
  }

  addConnection(projectId: string | null): RealtimeConnection {
    const connection: RealtimeConnection = {
      connection_id: `sse:${Date.now()}:${Math.random().toString(16).slice(2)}`,
      project_id: projectId,
      connected_at: Date.now(),
    };
    this.connections.set(connection.connection_id, connection);
    return connection;
  }

  removeConnection(connectionId: string) {
    this.connections.delete(connectionId);
  }

  connectionState(projectId: string) {
    const scopedConnections = Array.from(this.connections.values()).filter((conn) => conn.project_id === projectId);
    return {
      transport: 'sse',
      fallback_transport: 'polling',
      project_scoped: true,
      active_connections: scopedConnections.length,
      dropped_events: this.droppedEventsCount,
      active_connection_ids: scopedConnections.map((conn) => conn.connection_id),
      retained_events: this.events.filter((event) => this.shouldDeliver(event, projectId)).length,
    };
  }
}

export const realtimeEventHub = new RealtimeEventHub();

export function attachRealtimeRecorder(emitter: EventEmitter, hub = realtimeEventHub) {
  const marker = '__nexusR39RealtimeRecorderAttached';
  const anyEmitter = emitter as any;
  if (anyEmitter[marker]) return;
  anyEmitter[marker] = true;
  emitter.on('state_change', (event: any) => {
    hub.record(event);
  });
}

function writeSse(res: Response, eventName: string, payload: unknown) {
  res.write(`event: ${eventName}\n`);
  res.write(`data: ${JSON.stringify(payload)}\n\n`);
}

export function createRealtimeRouter(emitter: EventEmitter, hub = realtimeEventHub) {
  attachRealtimeRecorder(emitter, hub);
  const router = Router();

  router.get('/events/stream', (req: Request, res: Response) => {
    const projectId = (req.query.project_id as string | undefined) || null;
    const connection = hub.addConnection(projectId);

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');

    writeSse(res, 'connected', {
      type: 'connected',
      message: 'SSE connection established',
      connection_id: connection.connection_id,
      project_id: projectId,
      connection_state: projectId ? hub.connectionState(projectId) : { transport: 'sse', fallback_transport: 'polling', project_scoped: false },
      timestamp: Date.now(),
    });

    const heartbeat = setInterval(() => {
      try {
        writeSse(res, 'ping', { type: 'ping', connection_id: connection.connection_id, timestamp: Date.now() });
      } catch {
        clearInterval(heartbeat);
      }
    }, 15000);

    const onStateChange = (rawEvent: any) => {
      const event = rawEvent && typeof rawEvent.id === 'number' ? rawEvent : { ...rawEvent, timestamp: rawEvent?.timestamp ?? Date.now() };
      if (!hub.shouldDeliver(event, projectId)) return;
      try {
        writeSse(res, 'state_change', event);
      } catch {
        clearInterval(heartbeat);
      }
    };

    emitter.on('state_change', onStateChange);

    req.on('close', () => {
      clearInterval(heartbeat);
      emitter.off('state_change', onStateChange);
      hub.removeConnection(connection.connection_id);
    });
  });

  router.get('/runtime/projects/:projectId/events/state', (req: Request, res: Response) => {
    const projectId = req.params.projectId as string;
    return res.status(200).json({ project_id: projectId, connection_state: hub.connectionState(projectId) });
  });

  router.get('/runtime/projects/:projectId/events/poll', (req: Request, res: Response) => {
    const projectId = req.params.projectId as string;
    const after = req.query.after ? Number(req.query.after) : 0;
    const limit = req.query.limit ? Number(req.query.limit) : 100;
    const events = hub.poll(projectId, Number.isFinite(after) ? after : 0, Number.isFinite(limit) ? limit : 100);
    const nextCursor = events.length > 0 ? events[events.length - 1].id : (Number.isFinite(after) ? after : 0);
    return res.status(200).json({
      project_id: projectId,
      transport: 'polling',
      events,
      next_cursor: nextCursor,
      connection_state: hub.connectionState(projectId),
    });
  });

  return router;
}
