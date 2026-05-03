import React from 'react';

const FleetRadar: React.FC = () => {
  const agents = [
    { id: 'long-coder-1', lane: 'LANE_DEV', status: 'active', lastHeartbeat: '2s ago' },
    { id: 'long-coder-2', lane: 'LANE_DEV', status: 'active', lastHeartbeat: '1s ago' },
    { id: 'qa-bot-1', lane: 'LANE_TEST', status: 'active', lastHeartbeat: '5s ago' },
    { id: 'ops-bot-1', lane: 'LANE_OPS', status: 'offline', lastHeartbeat: '2h ago' },
  ];

  return (
    <div className="p-6 h-full overflow-auto bg-gray-900">
      <h2 className="text-xl font-mono mb-4 text-blue-400">Fleet Radar</h2>
      <div className="bg-gray-800 rounded-lg shadow overflow-hidden border border-gray-700">
        <table className="min-w-full divide-y divide-gray-700">
          <thead className="bg-gray-700">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Agent ID</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Lane</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Status</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Last Heartbeat</th>
            </tr>
          </thead>
          <tbody className="bg-gray-800 divide-y divide-gray-700">
            {agents.map((agent) => (
              <tr key={agent.id}>
                <td className="px-6 py-4 whitespace-nowrap text-sm font-mono text-gray-300">{agent.id}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-400">{agent.lane}</td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                    agent.status === 'active' ? 'bg-green-900 text-green-200 border border-green-500' : 'bg-gray-700 text-gray-300 border border-gray-500'
                  }`}>
                    {agent.status}
                  </span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-400">{agent.lastHeartbeat}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default FleetRadar;
