/**
 * ArtifactGallery — Real-time artifact display with SSE-driven card appending.
 *
 * AC: ArtifactGallery 新产物卡片实时追加；V8_ARTIFACT_GALLERY_PROOF_SUMMARY_CONTRACT
 *
 * V8 WebUI boundary: only render Proof 摘要 for humans. Raw proof hidden in Runtime DB/artifacts.
 * Data flow:
 *  1. Subscribes to SSE via useSSE hook
 *  2. On artifact_created events, prepends a sanitized artifact card
 *  3. Visible cards show safe summary fields only; complete proof remains in backend audit storage
 */

import React, { useState, useEffect } from 'react';
import { useSSE } from '../hooks/useSSE';

// ─── Types ─────────────────────────────────────────────────────────

interface ArtifactPayload {
  proof_summary?: string;
  summary?: string;
  result?: string;
  command?: string;
  path?: string;
  title?: string;
  status?: string;
}

interface Artifact {
  id: string;
  artifact_type: string;
  task_id?: string;
  payload?: ArtifactPayload | string | null;
  created_at?: string;
}

function appendArtifactCard(next: Artifact, current: Artifact[]): Artifact[] {
  if (!next.id || current.some((artifact) => artifact.id === next.id)) return current;
  return [next, ...current];
}

// ─── Artifact type → icon/color map ────────────────────────────────

const TYPE_STYLES: Record<string, { icon: string; color: string; label: string }> = {
  'git_commit': { icon: '📝', color: 'border-green-500/40 bg-green-900/20', label: 'Git Commit' },
  'screenshot': { icon: '📸', color: 'border-purple-500/40 bg-purple-900/20', label: 'Screenshot' },
  'log_output': { icon: '📋', color: 'border-blue-500/40 bg-blue-900/20', label: 'Log Output' },
  'test_result': { icon: '✅', color: 'border-emerald-500/40 bg-emerald-900/20', label: 'Test Result' },
  'code_review': { icon: '🔍', color: 'border-yellow-500/40 bg-yellow-900/20', label: 'Code Review' },
  'deploy_proof': { icon: '🚀', color: 'border-orange-500/40 bg-orange-900/20', label: 'Deploy Proof' },
  'report_proof': { icon: '📨', color: 'border-cyan-500/40 bg-cyan-900/20', label: 'Report Proof' },
  'group_summary': { icon: '📊', color: 'border-sky-500/40 bg-sky-900/20', label: 'Group Summary' },
  'worker_result_ingest': { icon: '📥', color: 'border-indigo-500/40 bg-indigo-900/20', label: 'Worker Result' },
};

function getTypeStyle(type: string) {
  return TYPE_STYLES[type] || { icon: '📦', color: 'border-gray-500/40 bg-gray-800/50', label: type };
}

function cleanVisibleText(value: unknown): string {
  if (typeof value !== 'string') return '';
  return value
    .replace(/\b(project|dispatch|run|trace|worker)[-_ ]?id\b\s*[:=]\s*\S+/gi, '[已隐藏]')
    .replace(/\b(bearer|authorization)\s+\S+/gi, '[已隐藏]')
    .replace(/\b(sk-|ghp_|xoxb-)\S+/gi, '[已隐藏]')
    .replace(/-100\d{6,}/g, '[已隐藏]')
    .replace(/[{}[\]"]/g, '')
    .slice(0, 180)
    .trim();
}

function getProofSummary(payload: Artifact['payload']): string {
  if (!payload) return 'Proof 已存系统';
  if (typeof payload === 'string') return cleanVisibleText(payload) || 'Proof 已存系统';

  const candidates = [
    payload.proof_summary,
    payload.summary,
    payload.result,
    payload.command,
    payload.status,
    payload.path,
  ];

  for (const candidate of candidates) {
    const safe = cleanVisibleText(candidate);
    if (safe) return safe;
  }

  return 'Proof 已存系统';
}

function getVisibleArtifactTitle(artifact: Artifact): string {
  const payloadTitle = typeof artifact.payload === 'object' && artifact.payload
    ? cleanVisibleText(artifact.payload.title)
    : '';
  return payloadTitle || getTypeStyle(artifact.artifact_type).label;
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

    // V8_SSE_REPORT_GROUP_EVENT_HANDLERS: report/group SSE events are rendered as sanitized proof cards.
    switch (event.type) {
      case 'artifact_created': {
        const { id, artifact_type, task_id, payload, created_at } = event.data;
        setArtifacts((prev) => appendArtifactCard({
          id,
          artifact_type,
          task_id,
          payload,
          created_at: created_at || new Date().toISOString(),
        }, prev));
        break;
      }
      case 'report_created':
      case 'report_status_updated': {
        const { id, report_id, message_type, status, summary, created_at, updated_at } = event.data;
        setArtifacts((prev) => appendArtifactCard({
          id: id || report_id,
          artifact_type: 'report_proof',
          payload: { title: message_type || 'Report', proof_summary: summary, status },
          created_at: updated_at || created_at || new Date().toISOString(),
        }, prev));
        break;
      }
      case 'group_summary_created': {
        const { id, report_id, group_id, summary, status, created_at } = event.data;
        setArtifacts((prev) => appendArtifactCard({
          id: id || report_id || `group_summary:${group_id}`,
          artifact_type: 'group_summary',
          payload: { title: 'Group Summary', proof_summary: summary || 'Group summary proof sent', status },
          created_at: created_at || new Date().toISOString(),
        }, prev));
        break;
      }
      default:
        break;
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
                    <span>{getVisibleArtifactTitle(art)}</span>
                  </span>
                  <span className="text-[10px] font-mono text-gray-500">Proof 摘要</span>
                </div>

                {/* Card body */}
                <div className="p-4">
                  <div className="flex justify-between items-center mb-2">
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${style.color}`}>
                      {style.label}
                    </span>
                    {timeStr && <span className="text-[10px] font-mono text-gray-500">{timeStr}</span>}
                  </div>

                  <div className="mt-2 bg-black/30 rounded p-2 text-[10px] font-mono text-gray-300 overflow-hidden max-h-[80px]">
                    {getProofSummary(art.payload)}
                  </div>
                  <div className="mt-2 text-[10px] font-mono text-gray-500">Proof 已存系统</div>
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
