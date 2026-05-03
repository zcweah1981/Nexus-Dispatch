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
  Position
} from 'reactflow';

interface NodeData {
  label: string;
  status: 'created' | 'running' | 'completed' | 'failed' | 'blocked';
  workerId?: string;
  avatarUrl?: string;
}

// Custom Node Component
const CustomNode = ({ data }: { data: NodeData }) => {
  const getStatusStyles = () => {
    switch (data.status) {
      case 'created': return 'border-gray-500 border-dashed bg-gray-800 text-gray-400';
      case 'running': return 'border-blue-500 bg-blue-900 bg-opacity-50 text-blue-100 shadow-[0_0_10px_rgba(59,130,246,0.5)] animate-pulse';
      case 'completed': return 'border-green-500 bg-green-800 text-green-100 shadow-[0_0_10px_rgba(34,197,94,0.3)]';
      case 'failed': 
      case 'blocked': return 'border-red-500 bg-red-900 bg-opacity-80 text-red-100 animate-bounce shadow-[0_0_10px_rgba(239,68,68,0.5)]';
      default: return 'border-gray-500 bg-gray-800';
    }
  };

  const getStatusDot = () => {
    switch (data.status) {
      case 'created': return 'bg-gray-400';
      case 'running': return 'bg-blue-400 animate-ping';
      case 'completed': return 'bg-green-400';
      case 'failed': 
      case 'blocked': return 'bg-red-400';
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

const nodeTypes = {
  custom: CustomNode,
};

const initialNodes: Node[] = [
  { id: '1', type: 'custom', position: { x: 50, y: 150 }, data: { label: 'T1: Setup', status: 'completed', workerId: 'devops-1' } },
  { id: '2', type: 'custom', position: { x: 300, y: 50 }, data: { label: 'T2.1: DB Init', status: 'running', workerId: 'backend-1' } },
  { id: '3', type: 'custom', position: { x: 300, y: 250 }, data: { label: 'T2.2: API Config', status: 'completed', workerId: 'backend-2' } },
  { id: '4', type: 'custom', position: { x: 550, y: 150 }, data: { label: 'T3: Core Logic', status: 'created' } },
  { id: '5', type: 'custom', position: { x: 800, y: 150 }, data: { label: 'T4: Integration', status: 'created' } },
];

const initialEdges: Edge[] = [
  { id: 'e1-2', source: '1', target: '2', animated: true, style: { stroke: '#4b5563' } },
  { id: 'e1-3', source: '1', target: '3', animated: false, style: { stroke: '#22c55e' } },
  { id: 'e2-4', source: '2', target: '4', animated: false, style: { stroke: '#4b5563', strokeDasharray: '5,5' } },
  { id: 'e3-4', source: '3', target: '4', animated: false, style: { stroke: '#4b5563', strokeDasharray: '5,5' } },
  { id: 'e4-5', source: '4', target: '5', animated: false, style: { stroke: '#4b5563', strokeDasharray: '5,5' } },
];

const DAGView: React.FC = () => {
  const [nodes, setNodes] = useState<Node[]>(initialNodes);
  const [edges, setEdges] = useState<Edge[]>(initialEdges);
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  const onNodesChange = useCallback(
    (changes: NodeChange[]) => setNodes((nds) => applyNodeChanges(changes, nds)),
    []
  );
  const onEdgesChange = useCallback(
    (changes: EdgeChange[]) => setEdges((eds) => applyEdgeChanges(changes, eds)),
    []
  );

  // Use SSE stream instead of mock data
  useEffect(() => {
    const eventSource = new EventSource('/api/v1/events/stream');

    eventSource.onmessage = (event) => {
      try {
        const parsedData = JSON.parse(event.data);
        console.log('Received SSE:', parsedData);
        
        if (parsedData.type === 'task_status_updated') {
            setNodes((nds) => 
                nds.map((node) => {
                    // Match node.id with parsedData.data.task_id if possible, or update by label if ids differ
                    if (node.id === parsedData.data.task_id || node.data.label.includes(parsedData.data.task_id)) {
                        return { ...node, data: { ...node.data, status: parsedData.data.status } };
                    }
                    return node;
                })
            );
        }
        
        if (parsedData.type === 'run_status_updated') {
             // You can add logic to update edge styles based on run status
             // or update workerId if run_created provides it.
        }
      } catch (error) {
        console.error('Error parsing SSE data:', error);
      }
    };

    eventSource.onerror = (error) => {
      console.error('EventSource failed:', error);
      eventSource.close();
    };

    return () => {
      eventSource.close();
    };
  }, []);

  return (
    <div className="h-full w-full">
      {toastMsg && (
        <div className="absolute top-4 left-1/2 transform -translate-x-1/2 z-50 bg-red-900 border border-red-500 text-white px-4 py-2 rounded shadow-lg flex items-center gap-2 max-w-lg w-full">
          <svg className="w-5 h-5 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path></svg>
          <span className="text-sm font-mono">{toastMsg}</span>
        </div>
      )}
      
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
    </div>
  );
};

export default DAGView;