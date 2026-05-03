import React, { useState, useEffect } from 'react';

interface AgentRoster {
  agent_id: string;
  adapter_type: string;
  system_affinity: string;
  lane: string;
  status: 'active' | 'offline';
  last_heartbeat: string;
}

interface PMSettings {
  project_id: string;
  tenant_id: string;
  environment: string;
  jwt_secret_configured: boolean;
  webhook_url: string;
}

const SettingsPanel: React.FC = () => {
  const [agents, setAgents] = useState<AgentRoster[]>([]);
  const [settings, setSettings] = useState<PMSettings | null>(null);
  const [loading, setLoading] = useState(true);

  // In a real implementation, these would fetch from the API.
  // For the UI mockup / MVP, we will use some placeholder data.
  useEffect(() => {
    // Simulate API fetch
    setTimeout(() => {
      setAgents([
        { agent_id: 'long-coder-1', adapter_type: 'hermes_native', system_affinity: 'linux-x64', lane: 'DEV', status: 'active', last_heartbeat: new Date().toISOString() },
        { agent_id: 'design-bot-alpha', adapter_type: 'openclaw_http', system_affinity: 'cloud-gpu', lane: 'DESIGN', status: 'active', last_heartbeat: new Date().toISOString() },
        { agent_id: 'ops-deployer-1', adapter_type: 'mcp_stdio', system_affinity: 'linux-arm64', lane: 'OPS', status: 'offline', last_heartbeat: new Date(Date.now() - 3600000).toISOString() },
      ]);
      setSettings({
        project_id: 'nexus-dispatch',
        tenant_id: 'internal-rnd',
        environment: 'dev',
        jwt_secret_configured: true,
        webhook_url: 'http://localhost:8000/api/v1/webhook/artifacts'
      });
      setLoading(false);
    }, 500);
  }, []);

  if (loading) {
    return <div className="p-8 text-gray-400">Loading settings...</div>;
  }

  return (
    <div className="h-full w-full bg-gray-900 text-gray-200 p-6 overflow-y-auto">
      <div className="max-w-6xl mx-auto space-y-8">
        
        {/* PM Settings Section */}
        <section className="bg-gray-800 rounded-lg p-6 shadow-md border border-gray-700">
          <h2 className="text-xl font-bold text-white mb-4 border-b border-gray-700 pb-2">PM Core Settings</h2>
          
          {settings && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-gray-400 mb-1">Project ID</label>
                <div className="bg-gray-900 p-2 rounded border border-gray-700 font-mono text-sm">
                  {settings.project_id}
                </div>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-400 mb-1">Tenant ID</label>
                <div className="bg-gray-900 p-2 rounded border border-gray-700 font-mono text-sm">
                  {settings.tenant_id}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-400 mb-1">Environment</label>
                <div className="bg-gray-900 p-2 rounded border border-gray-700 font-mono text-sm">
                  <span className="px-2 py-1 rounded bg-blue-900 text-blue-200 text-xs uppercase tracking-wider">{settings.environment}</span>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-400 mb-1">JWT Secret</label>
                <div className="bg-gray-900 p-2 rounded border border-gray-700 font-mono text-sm flex items-center">
                  {settings.jwt_secret_configured ? (
                     <><span className="w-2 h-2 rounded-full bg-green-500 mr-2"></span> Configured (Hidden)</>
                  ) : (
                     <><span className="w-2 h-2 rounded-full bg-red-500 mr-2"></span> Missing</>
                  )}
                </div>
              </div>

              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-400 mb-1">Global Webhook URL (For Workers)</label>
                <div className="bg-gray-900 p-2 rounded border border-gray-700 font-mono text-sm text-blue-400">
                  {settings.webhook_url}
                </div>
              </div>
            </div>
          )}
        </section>

        {/* Agent Roster Section */}
        <section className="bg-gray-800 rounded-lg p-6 shadow-md border border-gray-700">
          <h2 className="text-xl font-bold text-white mb-4 border-b border-gray-700 pb-2 flex justify-between items-center">
            <span>Agent Roster & Capabilities</span>
            <span className="text-xs bg-gray-700 px-2 py-1 rounded text-gray-300 font-normal">
              Total Nodes: {agents.length}
            </span>
          </h2>
          
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-gray-700 bg-gray-900/50">
                  <th className="p-3 text-sm font-medium text-gray-400">Agent ID</th>
                  <th className="p-3 text-sm font-medium text-gray-400">Lane</th>
                  <th className="p-3 text-sm font-medium text-gray-400">Adapter Type</th>
                  <th className="p-3 text-sm font-medium text-gray-400">System Affinity</th>
                  <th className="p-3 text-sm font-medium text-gray-400">Status</th>
                  <th className="p-3 text-sm font-medium text-gray-400">Last Heartbeat</th>
                </tr>
              </thead>
              <tbody>
                {agents.map((agent) => (
                  <tr key={agent.agent_id} className="border-b border-gray-700/50 hover:bg-gray-700/30 transition-colors">
                    <td className="p-3 font-mono text-sm text-white">{agent.agent_id}</td>
                    <td className="p-3">
                      <span className="px-2 py-1 text-xs rounded bg-indigo-900 text-indigo-200 border border-indigo-700">
                        {agent.lane}
                      </span>
                    </td>
                    <td className="p-3 font-mono text-xs text-gray-300">{agent.adapter_type}</td>
                    <td className="p-3 text-xs text-gray-400">{agent.system_affinity}</td>
                    <td className="p-3">
                      {agent.status === 'active' ? (
                        <span className="flex items-center text-xs text-green-400">
                          <span className="w-2 h-2 rounded-full bg-green-500 mr-2 animate-pulse"></span> Active
                        </span>
                      ) : (
                        <span className="flex items-center text-xs text-gray-500">
                          <span className="w-2 h-2 rounded-full bg-gray-600 mr-2"></span> Offline
                        </span>
                      )}
                    </td>
                    <td className="p-3 text-xs text-gray-400 font-mono">
                      {new Date(agent.last_heartbeat).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          
          <div className="mt-4 p-4 bg-yellow-900/20 border border-yellow-700/50 rounded text-sm text-yellow-200">
            <strong>Note:</strong> Worker nodes automatically register to this roster upon first heartbeat. To update capabilities, the worker must push a new JSON schema via the <code>/api/v1/agent/register</code> endpoint.
          </div>
        </section>

      </div>
    </div>
  );
};

export default SettingsPanel;
