/**
 * FleetRadar — Real-time agent fleet status dashboard.
 *
 * AC: FleetRadar Agent 状态实时更新
 *
 * Data flow:
 *  1. On mount, fetches all agents from /api/v1/agents
 *  2. Subscribes to SSE via useSSE hook
 *  3. On agent_registered events, upserts agent into the table
 */

import React, { useState, useEffect, useCallback } from 'react';
import { useSSE } from '../hooks/useSSE';

// ─── Types ─────────────────────────────────────────────────────────

interface Agent {
  agent_id: string;
  lane: string;
  endpoint?: string;
  dialect?: string;
  status: 'online' | 'offline';
  last_heartbeat?: string | null;
}

// ─── Lane color map ────────────────────────────────────────────────

const LANE_COLORS: Record<string, string> = {
  'DEV': 'text-[#3fb950] bg-[#238636]/10 border-[#238636]/30',
  'DESIGN': 'text-[#d2a8ff] bg-[#8957e5]/10 border-[#8957e5]/30',
  'OPS': 'text-[#f78166] bg-[#f85149]/10 border-[#f85149]/30',
  'CONTENT': 'text-[#58a6ff] bg-[#388bfd]/10 border-[#388bfd]/30',
  'RESEARCH': 'text-[#e3b341] bg-[#d29922]/10 border-[#d29922]/30',
  'ORCHESTRATOR': 'text-[#f0f6fc] bg-[#30363d] border-[#8b949e]/30',
};

const DEFAULT_LANE_COLOR = 'text-[#8b949e] bg-[#30363d]/10 border-[#30363d]/30';

function timeAgo(dateStr?: string | null): string {
  if (!dateStr) return '—';
  const diff = Date.now() - new Date(dateStr).getTime();
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ago`;
}

// ─── Component ─────────────────────────────────────────────────────

const FleetRadar: React.FC = () => {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const sse = useSSE();

  // ─── Initial fetch ─────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/v1/agents');
        if (!res.ok) throw new Error(`API returned ${res.status}`);
        const data = await res.json();
        if (!cancelled) {
          setAgents(data.agents || []);
          setLoading(false);
        }
      } catch (err: any) {
        if (!cancelled) {
          setError(err.message);
          setLoading(false);
        }
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // ─── SSE-driven real-time updates ──────────────────────────────
  useEffect(() => {
    if (!sse.lastEvent) return;
    const event = sse.lastEvent;

    if (event.type === 'agent_registered') {
      const { agent_id, lane, status, last_heartbeat, endpoint, dialect } = event.data;
      setAgents((prev) => {
        // Upsert: if agent_id already exists, update; otherwise add
        const idx = prev.findIndex((a) => a.agent_id === agent_id);
        const updatedAgent: Agent = {
          agent_id,
          lane,
          endpoint,
          dialect,
          status: status || 'online',
          last_heartbeat,
        };
        if (idx >= 0) {
          const copy = [...prev];
          copy[idx] = updatedAgent;
          return copy;
        }
        return [updatedAgent, ...prev];
      });
    }
  }, [sse.lastEvent]);

  // ─── Render ────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="h-full w-full flex items-center justify-center bg-gray-900">
        <div className="flex flex-col items-center">
          <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
          <div className="mt-3 text-[#8b949e] font-mono text-xs tracking-[0.15em]">SCANNING_FLEET...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 h-full overflow-auto bg-gray-900">
      {/* Header with connection status */}
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xl font-mono text-blue-400">Fleet Radar</h2>
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${sse.connected ? 'bg-green-400' : 'bg-red-400 animate-pulse'}`} />
          <span className="text-[10px] font-mono text-[#8b949e]">
            {sse.connected ? 'LIVE' : `RECONNECTING (${sse.reconnectCount})`}
          </span>
        </div>
      </div>

      {error && (
        <div className="mb-4 bg-red-900 border border-red-500 text-white px-3 py-2 rounded text-xs font-mono">
          ⚠ {error}
        </div>
      )}

      <div className="bg-gray-800 rounded-lg shadow overflow-hidden border border-gray-700">
        <table className="min-w-full divide-y divide-gray-700">
          <thead className="bg-gray-700">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Agent ID</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Lane</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Status</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Endpoint</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Last Heartbeat</th>
            </tr>
          </thead>
          <tbody className="bg-gray-800 divide-y divide-gray-700">
            {agents.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-6 py-8 text-center text-sm text-[#8b949e] font-mono">
                  NO_AGENTS_REGISTERED — Agents will appear here when they register via API
                </td>
              </tr>
            ) : (
              agents.map((agent) => (
                <tr key={agent.agent_id} className="hover:bg-gray-750 transition-colors">
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-mono text-gray-300">{agent.agent_id}</td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${LANE_COLORS[agent.lane] || DEFAULT_LANE_COLOR}`}>
                      {agent.lane}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                      agent.status === 'online'
                        ? 'bg-green-900 text-green-200 border border-green-500'
                        : 'bg-gray-700 text-gray-300 border border-gray-500'
                    }`}>
                      {agent.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-xs text-gray-400 font-mono truncate max-w-[200px]">{agent.endpoint || '—'}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-400">{timeAgo(agent.last_heartbeat)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Fleet summary */}
      <div className="mt-4 flex gap-4 text-xs font-mono text-[#8b949e]">
        <span>Total: <strong className="text-[#f0f6fc]">{agents.length}</strong></span>
        <span>Online: <strong className="text-green-400">{agents.filter(a => a.status === 'online').length}</strong></span>
        <span>Offline: <strong className="text-red-400">{agents.filter(a => a.status === 'offline').length}</strong></span>
      </div>
    </div>
  );
};

export default FleetRadar;
