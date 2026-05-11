/**
 * DAGView — Real-time DAG task visualization with SSE-driven node updates.
 *
 * AC: DAGView 节点颜色实时变化并仅展示 V8 状态机状态：灰(created)/蓝(in-progress)/绿(completed)/红(terminal/problem)
 *
 * Data flow:
 *  1. On mount, fetches project-scoped tasks from the V8 Runtime API boundary
 *  2. Builds initial nodes from task data
 *  3. Subscribes to SSE via useSSE hook
 *  4. On task_status_updated / task_created events, updates node data in-place
 *  5. Node colors are derived from task.status → CSS classes
 */

import React, { useState, useEffect, useCallback } from 'react';
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
import { PROJECT_ID, runtimeApi } from '../apiClient';
import { useSSE } from '../hooks/useSSE';

// ─── Status → visual mapping ──────────────────────────────────────
// V8 状态机：只展示 V8 task status；legacy status 由 Runtime API/FSM Controller 迁移后再进入 WebUI。
// 灰 = created (idle), 蓝 = active/gated/retry, 绿 = completed, 红 = blocked/dead/cancelled

type VisualStatus = 'created' | 'running' | 'completed' | 'problem';
type V8TaskStatus =
  | 'created'
  | 'dispatched'
  | 'running'
  | 'completion_pending'
  | 'review_pending'
  | 'completed'
  | 'retry_ready'
  | 'blocked'
  | 'dead_letter'
  | 'cancelled';

export const V8_TASK_STATUS_LABELS: Record<V8TaskStatus, string> = {
  created: 'CREATED',
  dispatched: 'DISPATCHED',
  running: 'RUNNING',
  completion_pending: 'COMPLETION_PENDING',
  review_pending: 'REVIEW_PENDING',
  completed: 'COMPLETED',
  retry_ready: 'RETRY_READY',
  blocked: 'BLOCKED',
  dead_letter: 'DEAD_LETTER',
  cancelled: 'CANCELLED',
};

interface NodeData {
  label: string;
  status: VisualStatus;
  taskStatus: V8TaskStatus;
  taskId: string;
  workerId?: string;
  avatarUrl?: string;
  phaseId?: string;
  groupId?: string;
  nextResponsible: string;
  dependencies: string[];
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
      case 'problem':
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
      case 'problem': return 'bg-red-400';
      default: return 'bg-gray-400';
    }
  };

  const displayStatus = V8_TASK_STATUS_LABELS[data.taskStatus];

  return (
    <div className={`px-4 py-3 rounded-lg border-2 min-w-[150px] transition-all duration-500 ${getStatusStyles()}`}>
      <Handle type="target" position={Position.Left} className="w-2 h-2 !bg-gray-400" />

      <div className="flex flex-col gap-2">
        <div className="flex justify-between items-center">
          <div className="text-xs font-mono font-bold">{data.label}</div>
          <div className={`w-2 h-2 rounded-full ${getStatusDot()}`} title={displayStatus} />
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

        <div className="grid grid-cols-1 gap-1 text-[10px] font-mono text-gray-300 bg-black bg-opacity-20 p-1.5 rounded">
          {data.phaseId && <div title={`Phase: ${data.phaseId}`}>Phase: {data.phaseId}</div>}
          {data.groupId && <div title={`Group: ${data.groupId}`}>Group: {data.groupId}</div>}
          <div title={`Next: ${data.nextResponsible}`}>Next: {data.nextResponsible}</div>
          <div title={`Deps: ${data.dependencies.join(', ') || 'none'}`}>Deps: {data.dependencies.length}</div>
        </div>
      </div>

      <Handle type="source" position={Position.Right} className="w-2 h-2 !bg-gray-400" />
    </div>
  );
};

const nodeTypes = { custom: CustomNode };

// ─── Task → Node mapper ────────────────────────────────────────────

function isV8TaskStatus(status: string): status is V8TaskStatus {
  return Object.prototype.hasOwnProperty.call(V8_TASK_STATUS_LABELS, status);
}

function normalizeTaskStatus(status: string): V8TaskStatus {
  return isV8TaskStatus(status) ? status : 'created';
}

function taskStatusToVisual(status: string): VisualStatus {
  const normalizedStatus = normalizeTaskStatus(status);
  if (normalizedStatus === 'created') return 'created';
  if (normalizedStatus === 'completed') return 'completed';
  if (normalizedStatus === 'blocked' || normalizedStatus === 'dead_letter' || normalizedStatus === 'cancelled') {
    return 'problem';
  }
  return 'running';
}

interface ApiTaskDependency {
  depends_on_id?: string;
  task_id?: string;
}

interface ApiTaskGroup {
  group_id?: string;
  phase_id?: string;
  ext_meta?: string | Record<string, unknown> | null;
}

interface ApiTask {
  id: string;
  title: string;
  status: string;
  objective?: string;
  lane_required?: string;
  reviewer?: string | null;
  task_group_id?: string | null;
  phase_id?: string | null;
  group_id?: string | null;
  taskGroup?: ApiTaskGroup | null;
  outgoing_deps?: ApiTaskDependency[];
  dependencies?: Array<string | ApiTaskDependency>;
}

function parseMeta(meta: ApiTaskGroup['ext_meta']): Record<string, unknown> {
  if (!meta) return {};
  if (typeof meta === 'object') return meta;
  try {
    const parsed = JSON.parse(meta);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function dependencyIdsForTask(task: ApiTask): string[] {
  const rawDeps = task.outgoing_deps ?? task.dependencies ?? [];
  return rawDeps
    .map((dep) => (typeof dep === 'string' ? dep : dep.depends_on_id ?? dep.task_id ?? ''))
    .filter((dep): dep is string => dep.length > 0);
}

function taskPhaseId(task: ApiTask): string | undefined {
  const groupMeta = parseMeta(task.taskGroup?.ext_meta);
  const metaPhaseId = typeof groupMeta.phase_id === 'string' ? groupMeta.phase_id : undefined;
  return task.phase_id ?? task.taskGroup?.phase_id ?? metaPhaseId;
}

function taskGroupId(task: ApiTask): string | undefined {
  return task.group_id ?? task.taskGroup?.group_id ?? task.task_group_id ?? undefined;
}

function deriveNextResponsible(task: ApiTask, taskStatus: V8TaskStatus): string {
  if (taskStatus === 'completed' || taskStatus === 'cancelled' || taskStatus === 'dead_letter') {
    return 'No next responsible';
  }
  if (taskStatus === 'completion_pending' || taskStatus === 'review_pending') {
    return task.reviewer ? `Reviewer: ${task.reviewer}` : 'Reviewer';
  }
  if (taskStatus === 'blocked') {
    return 'PM';
  }
  if (taskStatus === 'dispatched' || taskStatus === 'running') {
    return task.lane_required ? `Worker: ${task.lane_required}` : 'Worker';
  }
  return task.lane_required ? `Worker: ${task.lane_required}` : 'Worker';
}

// V8_DAG_DISPLAY_CONTRACT: DAG/phase/group/next responsible are display-only fields from the API payload.
function mapTaskToNode(task: ApiTask, idx: number): Node {
  const COLS = 3;
  const X_GAP = 280;
  const Y_GAP = 180;
  const X_OFFSET = 50;
  const Y_OFFSET = 50;
  const col = idx % COLS;
  const row = Math.floor(idx / COLS);
  const taskStatus = normalizeTaskStatus(task.status);

  return {
    id: task.id,
    type: 'custom',
    position: { x: X_OFFSET + col * X_GAP, y: Y_OFFSET + row * Y_GAP },
    data: {
      label: task.title || task.id,
      status: taskStatusToVisual(taskStatus),
      taskStatus,
      taskId: task.id,
      phaseId: taskPhaseId(task),
      groupId: taskGroupId(task),
      nextResponsible: deriveNextResponsible(task, taskStatus),
      dependencies: dependencyIdsForTask(task),
    },
  };
}

// Simple grid layout: arrange nodes in rows of 3
function layoutNodes(tasks: ApiTask[]): Node[] {
  return tasks.map((task, idx) => mapTaskToNode(task, idx));
}

function buildDependencyEdges(tasks: ApiTask[]): Edge[] {
  return tasks.flatMap((task) =>
    dependencyIdsForTask(task).map((dependsOnId) => ({
      id: `${dependsOnId}->${task.id}`,
      source: dependsOnId,
      target: task.id,
      type: 'smoothstep',
      animated: normalizeTaskStatus(task.status) !== 'completed',
      className: 'stroke-blue-400',
    })),
  );
}

// ─── Component ─────────────────────────────────────────────────────

const DAGView: React.FC = () => {
  const [nodes, setNodes] = useState<Node[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
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

  const refreshGraphFromApi = useCallback(async () => {
    // include_graph=true is preserved by runtimeApi.listTasks for R8/R37 graph metadata contracts.
    const data = await runtimeApi.listTasks(PROJECT_ID, { limit: 100, include_graph: true });
    const tasks: ApiTask[] = data.tasks || [];
    setNodes(layoutNodes(tasks));
    setEdges(buildDependencyEdges(tasks));
  }, []);

  // ─── Initial fetch ─────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await refreshGraphFromApi();
        if (!cancelled) {
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
  }, [refreshGraphFromApi]);

  // ─── SSE-driven real-time updates ──────────────────────────────
  useEffect(() => {
    if (!sse.lastEvent) return;
    const event = sse.lastEvent;

    // V8_SSE_TASK_GROUP_EVENT_HANDLERS: task/group events update display state or refetch graph metadata only.
    switch (event.type) {
      case 'task_status_updated':
      case 'task_transitioned': {
        const { task_id, new_status, status } = event.data;
        const taskStatus = normalizeTaskStatus(new_status || status || 'created');
        const visualStatus = taskStatusToVisual(taskStatus);
        setNodes((nds) =>
          nds.map((node) => {
            if (node.id === task_id) {
              return {
                ...node,
                data: {
                  ...node.data,
                  status: visualStatus,
                  taskStatus,
                },
              };
            }
            return node;
          }),
        );
        break;
      }

      case 'task_created': {
        const task: ApiTask = {
          ...event.data,
          id: event.data.task_id,
          title: event.data.title || event.data.task_id,
          status: event.data.status || 'created',
        };
        // Check if node already exists (avoid duplicate from initial fetch)
        setNodes((nds) => {
          if (nds.some((n) => n.id === task.id)) return nds;
          return [...nds, mapTaskToNode(task, nds.length)];
        });
        setEdges((currentEdges) => [...currentEdges, ...buildDependencyEdges([task])]);
        break;
      }

      case 'tasks_batch_injected':
      case 'group_status_updated': {
        refreshGraphFromApi().catch((err: any) => setError(err.message));
        break;
      }

      case 'run_created': {
        // Run created → keep task display on V8 task status while attaching worker info.
        const { task_id, agent_id } = event.data;
        setNodes((nds) =>
          nds.map((node) =>
            node.id === task_id
              ? {
                  ...node,
                  data: {
                    ...node.data,
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
  }, [sse.lastEvent, refreshGraphFromApi]);

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
