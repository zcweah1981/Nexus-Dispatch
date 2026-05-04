/**
 * DAGView — Real-time DAG task visualization with SSE-driven node updates.
 *
 * AC: DAGView 节点颜色实时变化: 灰(created)/蓝(running/dispatched)/绿(completed)/红(failed)
 *
 * Data flow:
 *  1. On mount, fetches all tasks from /api/v1/tasks?project_id=... (or all)
 *  2. Builds initial nodes from task data
 *  3. Subscribes to SSE via useSSE hook
 *  4. On task_status_updated / task_created events, updates node data in-place
 *  5. Node colors are derived from task.status → CSS classes
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import ReactFlow, {
  Node,
  Edge,
  Controls,
  Background,
  applyNodeChanges,
  applyEdgeChanges,
  NodeChange,
  EdgeChange,
  Handle,
  Position,
} from 'reactflow';
import { useSSE, SSEEvent } from '../hooks/useSSE';

// ─── Status → visual mapping ──────────────────────────────────────
// 灰 = created (idle), 蓝 = dispatched/running (active), 绿 = completed, 红 = failed/blocked

type VisualStatus = 'created' | 'running' | 'completed' | 'failed';

interface NodeData {
  label: string;
  status: VisualStatus;
  taskId: string;
  workerId?: string;
  avatarUrl?: string;
}

// ─── Custom Node Component ─────────────────────────────────────────

const CustomNode = ({ data }: { data: NodeData }) => {
  const getStatusStyles = () => {
    switch (data.status) {
      case 'created':
        return 'border-gray-500 border-dashed bg-gray-800 text-gray-400';
      case 'running':
        return 'border-blue-500 bg-blue-900 bg-opacity-50 text-blue-100 shadow-[0_0_10px_rgba(59,130,246,0.5)] animate-pulse';
      case 'completed':
        return 'border-green-500 bg-green-800 text-green-100 shadow-[0_0_10px_rgba(34,197,94,0.3)]';
      case 'failed':
        return 'border-red-500 bg-red-900 bg-opacity-80 text-red-100 animate-bounce shadow-[0_0_10px_rgba(239,68,68,0.5)]';
      default:
        return 'border-gray-500 bg-gray-800';
    }
  };

  const getStatusDot = () => {
    switch (data.status) {
      case 'created': return 'bg-gray-400';
      case 'running': return 'bg-blue-400 animate-ping';
      case 'completed': return 'bg-green-400';
      case 'failed': return 'bg-red-400';
      default: return 'bg-gray-400';
    }
  };

  return (
    <div className={`px-4 py-3 rounded-lg border-2 min-w-[150px] transition-all duration-500 ${getStatusStyles()}`}>
      <Handle type="target" position={Position.Left} className="w-2 h-2 !bg-gray-400" />

      <div className="flex flex-col gap-2">
        <div className="flex justify-between items-center">
          <div className="text-xs font-mono font-bold">{data.label}</div>
          <div className={`w-2 h-2 rounded-full ${getStatusDot()}`} title={data.status} />
        </div>

        {data.workerId && (
          <div className="flex items-center gap-2 mt-1 bg-black bg-opacity-30 p-1 rounded">
            {data.avatarUrl ? (
              <img src={data.avatarUrl} alt="avatar" className="w-5 h-5 rounded-full" />
            ) : (
              <div className="w-5 h-5 rounded-full bg-indigo-600 flex items-center justify-center text-[10px] font-bold">
                {data.workerId.charAt(0).toUpperCase()}
              </div>
            )}
            <span className="text-[10px] text-gray-300 font-mono truncate max-w-[90px]">{data.workerId}</span>
          </div>
        )}
      </div>

      <Handle type="source" position={Position.Right} className="w-2 h-2 !bg-gray-400" />
    </div>
  );
};

const nodeTypes = { custom: CustomNode };

// ─── Task → Node mapper ────────────────────────────────────────────

function taskStatusToVisual(status: string): VisualStatus {
  if (status === 'created') return 'created';
  if (status === 'dispatched' || status === 'accepted' || status === 'running' ||
      status === 'review_spawned' || status === 'completion_pending' || status === 'validating') {
    return 'running';
  }
  if (status === 'completed') return 'completed';
  if (status === 'failed') return 'failed';
  return 'created';
}

interface ApiTask {
  id: string;
  title: string;
  status: string;
  objective?: string;
  lane_required?: string;
}

// Simple grid layout: arrange nodes in rows of 3
function layoutNodes(tasks: ApiTask[]): Node[] {
  const COLS = 3;
  const X_GAP = 280;
  const Y_GAP = 160;
  const X_OFFSET = 50;
  const Y_OFFSET = 50;

  return tasks.map((task, idx) => {
    const col = idx % COLS;
    const row = Math.floor(idx / COLS);
    return {
      id: task.id,
      type: 'custom',
      position: { x: X_OFFSET + col * X_GAP, y: Y_OFFSET + row * Y_GAP },
      data: {
        label: task.title || task.id,
        status: taskStatusToVisual(task.status),
        taskId: task.id,
      },
    };
  });
}

// ─── Component ─────────────────────────────────────────────────────

const DAGView: React.FC = () => {
  const [nodes, setNodes] = useState<Node[]>([]);
  const [edges] = useState<Edge[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const sse = useSSE();

  const onNodesChange = useCallback(
    (changes: NodeChange[]) => setNodes((nds) => applyNodeChanges(changes, nds)),
    [],
  );
  const onEdgesChange = useCallback(
    (changes: EdgeChange[]) => { /* edges not dynamically updated */ },
    [],
  );

  // ─── Initial fetch ─────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/v1/tasks?limit=100');
        if (!res.ok) throw new Error(`API returned ${res.status}`);
        const data = await res.json();
        const tasks: ApiTask[] = data.tasks || [];
        if (!cancelled) {
          setNodes(layoutNodes(tasks));
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

    switch (event.type) {
      case 'task_status_updated': {
        const { task_id, new_status, status } = event.data;
        const visualStatus = taskStatusToVisual(new_status || status);
        setNodes((nds) =>
          nds.map((node) => {
            if (node.id === task_id) {
              return {
                ...node,
                data: {
                  ...node.data,
                  status: visualStatus,
                },
              };
            }
            return node;
          }),
        );
        break;
      }

      case 'task_created': {
        const { task_id, title, status } = event.data;
        // Check if node already exists (avoid duplicate from initial fetch)
        setNodes((nds) => {
          if (nds.some((n) => n.id === task_id)) return nds;
          // Add new node at a position below the last row
          const lastNode = nds[nds.length - 1];
          const newRow = lastNode ? Math.floor(nds.length / 3) + 1 : 0;
          const newCol = nds.length % 3;
          return [
            ...nds,
            {
              id: task_id,
              type: 'custom' as const,
              position: { x: 50 + newCol * 280, y: 50 + newRow * 160 },
              data: {
                label: title || task_id,
                status: taskStatusToVisual(status || 'created'),
                taskId: task_id,
              },
            },
          ];
        });
        break;
      }

      case 'task_accepted': {
        // Task accepted → completed visual
        const { task_id } = event.data;
        setNodes((nds) =>
          nds.map((node) =>
            node.id === task_id
              ? { ...node, data: { ...node.data, status: 'completed' as VisualStatus } }
              : node,
          ),
        );
        break;
      }

      case 'task_rejected': {
        // Task rejected → failed visual
        const { task_id } = event.data;
        setNodes((nds) =>
          nds.map((node) =>
            node.id === task_id
              ? { ...node, data: { ...node.data, status: 'failed' as VisualStatus } }
              : node,
          ),
        );
        break;
      }

      case 'run_created': {
        // Run created → update node with worker info, status = running
        const { task_id, agent_id } = event.data;
        setNodes((nds) =>
          nds.map((node) =>
            node.id === task_id
              ? {
                  ...node,
                  data: {
                    ...node.data,
                    status: 'running' as VisualStatus,
                    workerId: agent_id,
                  },
                }
              : node,
          ),
        );
        break;
      }

      default:
        break;
    }
  }, [sse.lastEvent]);

  // ─── Render ────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="h-full w-full flex items-center justify-center bg-[#0f1115]">
        <div className="flex flex-col items-center">
          <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
          <div className="mt-3 text-[#8b949e] font-mono text-xs tracking-[0.15em]">LOADING_DAG...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full w-full relative">
      {/* Connection status indicator */}
      <div className="absolute top-3 right-3 z-10 flex items-center gap-2">
        <div className={`w-2 h-2 rounded-full ${sse.connected ? 'bg-green-400' : 'bg-red-400 animate-pulse'}`} />
        <span className="text-[10px] font-mono text-[#8b949e]">
          {sse.connected ? 'LIVE' : `RECONNECTING (${sse.reconnectCount})`}
        </span>
      </div>

      {error && (
        <div className="absolute top-3 left-3 z-50 bg-red-900 border border-red-500 text-white px-3 py-2 rounded shadow-lg text-xs font-mono max-w-md">
          ⚠ {error}
        </div>
      )}

      {nodes.length === 0 ? (
        <div className="h-full w-full flex items-center justify-center bg-[#0f1115]">
          <div className="text-center">
            <div className="text-[#8b949e] font-mono text-sm">NO_TASKS_FOUND</div>
            <div className="text-[#484f58] font-mono text-xs mt-1">Tasks will appear here when created via API</div>
          </div>
        </div>
      ) : (
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          nodeTypes={nodeTypes}
          fitView
          className="bg-[#0f1115]"
          proOptions={{ hideAttribution: true }}
        >
          <Background color="#374151" gap={16} />
          <Controls className="bg-gray-800 border-gray-700 fill-gray-300" />
        </ReactFlow>
      )}
    </div>
  );
};

export default DAGView;
