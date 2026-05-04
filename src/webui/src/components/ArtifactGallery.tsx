/**
 * ArtifactGallery — Real-time artifact display with SSE-driven card appending.
 *
 * AC: ArtifactGallery 新产物卡片实时追加
 *
 * Data flow:
 *  1. On mount, fetches recent artifacts from API (if available)
 *  2. Subscribes to SSE via useSSE hook
 *  3. On artifact_created events, prepends new artifact card
 */

import React, { useState, useEffect } from 'react';
import { useSSE } from '../hooks/useSSE';

// ─── Types ─────────────────────────────────────────────────────────

interface Artifact {
  id: string;
  run_id: string;
  artifact_type: string;
  task_id?: string;
  payload?: any;
  created_at?: string;
}

// ─── Artifact type → icon/color map ────────────────────────────────

const TYPE_STYLES: Record<string, { icon: string; color: string; label: string }> = {
  'git_commit': { icon: '📝', color: 'border-green-500/40 bg-green-900/20', label: 'Git Commit' },
  'screenshot': { icon: '📸', color: 'border-purple-500/40 bg-purple-900/20', label: 'Screenshot' },
  'log_output': { icon: '📋', color: 'border-blue-500/40 bg-blue-900/20', label: 'Log Output' },
  'test_result': { icon: '✅', color: 'border-emerald-500/40 bg-emerald-900/20', label: 'Test Result' },
  'code_review': { icon: '🔍', color: 'border-yellow-500/40 bg-yellow-900/20', label: 'Code Review' },
  'deploy_proof': { icon: '🚀', color: 'border-orange-500/40 bg-orange-900/20', label: 'Deploy Proof' },
};

function getTypeStyle(type: string) {
  return TYPE_STYLES[type] || { icon: '📦', color: 'border-gray-500/40 bg-gray-800/50', label: type };
}

function truncateHash(hash: string, len = 7): string {
  if (!hash) return '—';
  return hash.length > len ? hash.substring(0, len) : hash;
}

// ─── Component ─────────────────────────────────────────────────────

const ArtifactGallery: React.FC = () => {
  const [artifacts, setArtifacts] = useState<Artifact[]>([]);
  const [loading, setLoading] = useState(true);
  const sse = useSSE();

  // ─── SSE-driven real-time updates ──────────────────────────────
  useEffect(() => {
    if (!sse.lastEvent) return;
    const event = sse.lastEvent;

    if (event.type === 'artifact_created') {
      const { id, run_id, artifact_type, task_id, payload, created_at } = event.data;
      if (!id) return;

      setArtifacts((prev) => {
        // Avoid duplicates
        if (prev.some((a) => a.id === id)) return prev;
        return [
          {
            id,
            run_id,
            artifact_type,
            task_id,
            payload,
            created_at: created_at || new Date().toISOString(),
          },
          ...prev,
        ];
      });
    }
  }, [sse.lastEvent]);

  // Mark loading complete after first SSE connection or a timeout
  useEffect(() => {
    if (sse.connected) {
      setLoading(false);
    }
    const timer = setTimeout(() => setLoading(false), 3000);
    return () => clearTimeout(timer);
  }, [sse.connected]);

  // ─── Render ────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="h-full w-full flex items-center justify-center bg-gray-900">
        <div className="flex flex-col items-center">
          <div className="w-8 h-8 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
          <div className="mt-3 text-[#8b949e] font-mono text-xs tracking-[0.15em]">LOADING_ARTIFACTS...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 h-full overflow-auto bg-gray-900">
      {/* Header with connection status */}
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xl font-mono text-purple-400">Artifact Gallery</h2>
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${sse.connected ? 'bg-green-400' : 'bg-red-400 animate-pulse'}`} />
          <span className="text-[10px] font-mono text-[#8b949e]">
            {sse.connected ? 'LIVE' : `RECONNECTING (${sse.reconnectCount})`}
          </span>
        </div>
      </div>

      {artifacts.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20">
          <div className="text-4xl mb-4">📦</div>
          <div className="text-[#8b949e] font-mono text-sm">NO_ARTIFACTS_YET</div>
          <div className="text-[#484f58] font-mono text-xs mt-1">
            Artifacts will appear here in real-time when workers submit proofs
          </div>
        </div>
      ) : (
        <div className="columns-1 md:columns-2 lg:columns-3 gap-4 space-y-4">
          {artifacts.map((art) => {
            const style = getTypeStyle(art.artifact_type);
            const sha = truncateHash(art.run_id);
            const timeStr = art.created_at
              ? new Date(art.created_at).toLocaleTimeString()
              : '';

            return (
              <div
                key={art.id}
                className={`break-inside-avoid rounded-lg overflow-hidden shadow-lg border ${style.color} hover:border-purple-500 transition-all duration-300 animate-in fade-in slide-in-from-bottom-2`}
              >
                {/* Card header bar */}
                <div className="px-4 py-2 flex justify-between items-center border-b border-gray-700/50 bg-black/20">
                  <span className="flex items-center gap-1.5 text-xs font-bold text-purple-400">
                    <span>{style.icon}</span>
                    <span>{art.task_id || art.run_id}</span>
                  </span>
                  <span className="text-[10px] font-mono text-gray-500">{sha}</span>
                </div>

                {/* Card body */}
                <div className="p-4">
                  <div className="flex justify-between items-center mb-2">
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${style.color}`}>
                      {style.label}
                    </span>
                    {timeStr && <span className="text-[10px] font-mono text-gray-500">{timeStr}</span>}
                  </div>

                  {/* Payload preview */}
                  {art.payload && (
                    <div className="mt-2 bg-black/30 rounded p-2 text-[10px] font-mono text-gray-400 overflow-hidden max-h-[80px]">
                      <pre className="whitespace-pre-wrap break-all">
                        {typeof art.payload === 'string'
                          ? art.payload.substring(0, 200)
                          : JSON.stringify(art.payload, null, 2).substring(0, 200)}
                      </pre>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Summary */}
      {artifacts.length > 0 && (
        <div className="mt-4 text-xs font-mono text-[#8b949e]">
          Total artifacts: <strong className="text-purple-400">{artifacts.length}</strong>
        </div>
      )}
    </div>
  );
};

export default ArtifactGallery;
