import React, { useState, useEffect } from 'react';

interface AgentRoster {
  id: string;
  lane: string;
  endpoint: string;
  dialect?: string;
  status: 'active' | 'offline';
  last_heartbeat?: string;
}

interface ControllerConfig {
  controller_id: string;
  project_id: string | null;
  config_json: {
    default_reviewer?: string;
    poll_interval_seconds?: number;
    dispatch_policy?: 'priority_first' | 'fifo' | 'round_robin';
    blueprint_auto_advance?: boolean;
    max_concurrent_dispatches?: number;
    retry_max_attempts?: number;
    acceptance_mode?: Record<string, 'pm_audit' | 'machine_audit' | 'design_spec'>;
    reviewer_routing?: Record<string, string>;
    [key: string]: any;
  };
}

const SettingsPanel: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'review' | 'roster' | 'system'>('review');
  const [agents, setAgents] = useState<AgentRoster[]>([]);
  const [controllers, setControllers] = useState<ControllerConfig[]>([]);
  const [selectedControllerId, setSelectedControllerId] = useState<string>('');
  const [config, setConfig] = useState<ControllerConfig['config_json']>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);

  useEffect(() => {
    fetchInitialData();
  }, []);

  const fetchInitialData = async () => {
    try {
      setLoading(true);
      const [agentsRes, controllersRes] = await Promise.all([
        fetch('/api/v1/agents'),
        fetch('/api/v1/controllers')
      ]);
      
      const agentsData = await agentsRes.json();
      const controllersData = await controllersRes.json();
      
      setAgents(agentsData.agents || []);
      const ctrls = controllersData.controllers || [];
      setControllers(ctrls);
      
      if (ctrls.length > 0) {
        // Default to ctrl-pm-main if available, otherwise first one
        const main = ctrls.find((c: any) => c.controller_id === 'ctrl-pm-main') || ctrls[0];
        setSelectedControllerId(main.controller_id);
        // Normalize config_json if it's a string
        const parsedConfig = typeof main.config_json === 'string' ? JSON.parse(main.config_json) : main.config_json;
        setConfig(parsedConfig || {});
      }
    } catch (err) {
      console.error('Failed to fetch settings:', err);
      setMessage({ type: 'error', text: 'Failed to load system settings' });
    } finally {
      setLoading(false);
    }
  };

  const handleControllerChange = (id: string) => {
    const ctrl = controllers.find(c => c.controller_id === id);
    if (ctrl) {
      setSelectedControllerId(id);
      const parsedConfig = typeof ctrl.config_json === 'string' ? JSON.parse(ctrl.config_json) : ctrl.config_json;
      setConfig(parsedConfig || {});
    }
  };

  const saveConfig = async () => {
    if (!selectedControllerId) return;
    setSaving(true);
    setMessage(null);
    try {
      const response = await fetch(`/api/v1/controllers/${selectedControllerId}/config`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      });
      
      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error?.message || 'Save failed');
      }
      
      setMessage({ type: 'success', text: 'Controller configuration updated successfully' });
      // Update local controllers list
      setControllers(prev => prev.map(c => 
        c.controller_id === selectedControllerId ? { ...c, config_json: config } : c
      ));
      
      setTimeout(() => setMessage(null), 3000);
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message });
    } finally {
      setSaving(false);
    }
  };

  const updateConfigField = (field: string, value: any) => {
    setConfig(prev => ({ ...prev, [field]: value }));
  };

  const updateAcceptanceMode = (lane: string, mode: any) => {
    setConfig(prev => ({
      ...prev,
      acceptance_mode: { ...(prev.acceptance_mode || {}), [lane]: mode }
    }));
  };

  const updateReviewerRoute = (lane: string, agentId: string) => {
    setConfig(prev => ({
      ...prev,
      reviewer_routing: { ...(prev.reviewer_routing || {}), [lane]: agentId }
    }));
  };

  const availableLanes = Array.from(new Set(agents.map(a => a.lane))).filter(Boolean).sort();

  if (loading) {
    return (
      <div className="h-full w-full bg-gray-900 flex items-center justify-center">
        <div className="flex flex-col items-center">
          <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
          <div className="mt-4 text-gray-500 font-mono">Loading Nexus Engine Settings...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full w-full bg-[#0d1117] text-gray-300 flex flex-col overflow-hidden">
      {/* Tab Switcher */}
      <div className="flex-none px-6 pt-4 border-b border-gray-800 bg-[#161b22]">
        <div className="flex space-x-6">
          <button 
            onClick={() => setActiveTab('review')}
            className={`pb-3 text-sm font-medium border-b-2 transition-colors ${activeTab === 'review' ? 'border-orange-500 text-white' : 'border-transparent text-gray-500 hover:text-gray-300'}`}
          >
            Review Rules
          </button>
          <button 
            onClick={() => setActiveTab('roster')}
            className={`pb-3 text-sm font-medium border-b-2 transition-colors ${activeTab === 'roster' ? 'border-orange-500 text-white' : 'border-transparent text-gray-500 hover:text-gray-300'}`}
          >
            Agent Roster
          </button>
          <button 
            onClick={() => setActiveTab('system')}
            className={`pb-3 text-sm font-medium border-b-2 transition-colors ${activeTab === 'system' ? 'border-orange-500 text-white' : 'border-transparent text-gray-500 hover:text-gray-300'}`}
          >
            System Info
          </button>
        </div>
      </div>

      <div className="flex-grow overflow-y-auto p-6">
        <div className="max-w-5xl mx-auto">
          
          {/* Messages */}
          {message && (
            <div className={`mb-6 p-4 rounded border ${message.type === 'success' ? 'bg-green-900/20 border-green-800 text-green-400' : 'bg-red-900/20 border-red-800 text-red-400'}`}>
              <div className="flex items-center">
                <span className="mr-2">{message.type === 'success' ? '✓' : '⚠'}</span>
                {message.text}
              </div>
            </div>
          )}

          {activeTab === 'review' && (
            <div className="space-y-8 animate-in fade-in duration-300">
              {/* Controller Selection */}
              <div className="bg-[#161b22] border border-gray-800 rounded-lg p-5">
                <div className="flex justify-between items-center mb-4">
                  <h3 className="text-white font-semibold">FSM Controller Context</h3>
                  <div className="text-[10px] text-gray-500 font-mono uppercase tracking-widest">Hot-Reload Enabled</div>
                </div>
                <div className="flex space-x-4 items-end">
                  <div className="flex-grow">
                    <label className="block text-xs text-gray-500 mb-1">Target Controller</label>
                    <select 
                      value={selectedControllerId}
                      onChange={(e) => handleControllerChange(e.target.value)}
                      className="w-full bg-[#0d1117] border border-gray-700 rounded p-2 text-sm focus:border-blue-500 outline-none"
                    >
                      {controllers.map(c => (
                        <option key={c.controller_id} value={c.controller_id}>{c.controller_id} ({c.project_id || 'Global'})</option>
                      ))}
                    </select>
                  </div>
                  <button 
                    onClick={saveConfig}
                    disabled={saving}
                    className={`px-6 py-2 rounded text-sm font-medium transition-all ${saving ? 'bg-gray-700 text-gray-500' : 'bg-[#238636] hover:bg-[#2ea043] text-white shadow-sm'}`}
                  >
                    {saving ? 'Applying...' : 'Save Config'}
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                {/* Default Reviewer */}
                <div className="space-y-4">
                  <section className="bg-[#161b22] border border-gray-800 rounded-lg p-5">
                    <h4 className="text-sm font-bold text-white mb-4 border-b border-gray-800 pb-2">Global Review Defaults</h4>
                    <div className="space-y-4">
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">Default Reviewer</label>
                        <select 
                          value={config.default_reviewer || ''}
                          onChange={(e) => updateConfigField('default_reviewer', e.target.value)}
                          className="w-full bg-[#0d1117] border border-gray-700 rounded p-2 text-sm"
                        >
                          <option value="">-- No Default (Orchestrator fallback) --</option>
                          {agents.map(a => (
                            <option key={a.id} value={a.id}>{a.id} ({a.lane})</option>
                          ))}
                        </select>
                        <p className="mt-1 text-[10px] text-gray-500 italic">Fallback auditor if no rule matches.</p>
                      </div>
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">Dispatch Policy</label>
                        <select 
                          value={config.dispatch_policy || 'priority_first'}
                          onChange={(e) => updateConfigField('dispatch_policy', e.target.value)}
                          className="w-full bg-[#0d1117] border border-gray-700 rounded p-2 text-sm"
                        >
                          <option value="priority_first">Priority First (Task Level)</option>
                          <option value="fifo">FIFO (Queue Order)</option>
                          <option value="round_robin">Round Robin (Load Balanced)</option>
                        </select>
                      </div>
                    </div>
                  </section>

                  <section className="bg-[#161b22] border border-gray-800 rounded-lg p-5">
                    <h4 className="text-sm font-bold text-white mb-4 border-b border-gray-800 pb-2">System Tuning</h4>
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="text-xs text-gray-300">Blueprint Auto-Advance</div>
                          <div className="text-[10px] text-gray-500">Thaw next phase when current is done</div>
                        </div>
                        <button 
                          onClick={() => updateConfigField('blueprint_auto_advance', !config.blueprint_auto_advance)}
                          className={`w-10 h-5 rounded-full relative transition-colors ${config.blueprint_auto_advance ? 'bg-blue-600' : 'bg-gray-700'}`}
                        >
                          <span className={`absolute top-1 w-3 h-3 rounded-full bg-white transition-transform ${config.blueprint_auto_advance ? 'left-6' : 'left-1'}`}></span>
                        </button>
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="block text-xs text-gray-500 mb-1">Max Concurrent</label>
                          <input 
                            type="number"
                            min="1"
                            max="100"
                            value={config.max_concurrent_dispatches || 5}
                            onChange={(e) => updateConfigField('max_concurrent_dispatches', parseInt(e.target.value))}
                            className="w-full bg-[#0d1117] border border-gray-700 rounded p-2 text-sm font-mono"
                          />
                        </div>
                        <div>
                          <label className="block text-xs text-gray-500 mb-1">Poll Interval (s)</label>
                          <input 
                            type="number"
                            min="1"
                            max="600"
                            value={config.poll_interval_seconds || 15}
                            onChange={(e) => updateConfigField('poll_interval_seconds', parseInt(e.target.value))}
                            className="w-full bg-[#0d1117] border border-gray-700 rounded p-2 text-sm font-mono"
                          />
                        </div>
                        <div>
                          <label className="block text-xs text-gray-500 mb-1">Max Retries</label>
                          <input 
                            type="number"
                            min="0"
                            max="10"
                            value={config.retry_max_attempts || 3}
                            onChange={(e) => updateConfigField('retry_max_attempts', parseInt(e.target.value))}
                            className="w-full bg-[#0d1117] border border-gray-700 rounded p-2 text-sm font-mono"
                          />
                        </div>
                      </div>
                    </div>
                  </section>
                </div>

                {/* Acceptance Modes */}
                <div className="space-y-4">
                  <section className="bg-[#161b22] border border-gray-800 rounded-lg p-5">
                    <h4 className="text-sm font-bold text-white mb-4 border-b border-gray-800 pb-2">Acceptance Modes per Lane</h4>
                    <div className="space-y-3">
                      {availableLanes.length === 0 ? (
                        <div className="text-xs text-gray-500 text-center py-4 italic">No active lanes detected. Register agents to configure.</div>
                      ) : (
                        availableLanes.map(lane => (
                          <div key={lane} className="flex items-center space-x-4">
                            <div className="w-20 text-xs font-mono text-blue-400">{lane}</div>
                            <select 
                              value={config.acceptance_mode?.[lane] || 'machine_audit'}
                              onChange={(e) => updateAcceptanceMode(lane, e.target.value)}
                              className="flex-grow bg-[#0d1117] border border-gray-700 rounded p-1.5 text-xs"
                            >
                              <option value="machine_audit">Machine Audit (FSM Auto)</option>
                              <option value="pm_audit">PM Audit (Dynamic Task)</option>
                              <option value="design_spec">Design Spec (Report Only)</option>
                            </select>
                          </div>
                        ))
                      )}
                    </div>
                  </section>

                  <section className="bg-[#161b22] border border-gray-800 rounded-lg p-5">
                    <h4 className="text-sm font-bold text-white mb-4 border-b border-gray-800 pb-2">Reviewer Routing Rules</h4>
                    <div className="space-y-3">
                      {availableLanes.map(lane => (
                        <div key={lane} className="flex items-center space-x-4">
                          <div className="w-20 text-xs font-mono text-purple-400">{lane}</div>
                          <select 
                            value={config.reviewer_routing?.[lane] || ''}
                            onChange={(e) => updateReviewerRoute(lane, e.target.value)}
                            className="flex-grow bg-[#0d1117] border border-gray-700 rounded p-1.5 text-xs"
                          >
                            <option value="">Default Reviewer</option>
                            {agents.map(a => (
                              <option key={a.id} value={a.id}>{a.id}</option>
                            ))}
                          </select>
                        </div>
                      ))}
                    </div>
                  </section>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'roster' && (
            <div className="bg-[#161b22] border border-gray-800 rounded-lg overflow-hidden animate-in slide-in-from-right-4 duration-300">
              <div className="p-4 border-b border-gray-800 bg-[#0d1117] flex justify-between items-center">
                <h3 className="text-sm font-bold text-white">Live Worker Roster</h3>
                <span className="text-[10px] bg-blue-900/30 text-blue-400 px-2 py-0.5 rounded border border-blue-800/50">{agents.length} Registered Nodes</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="bg-[#161b22] text-gray-500 border-b border-gray-800">
                      <th className="px-4 py-3 font-medium text-xs uppercase">Agent ID</th>
                      <th className="px-4 py-3 font-medium text-xs uppercase">Lane</th>
                      <th className="px-4 py-3 font-medium text-xs uppercase">Endpoint</th>
                      <th className="px-4 py-3 font-medium text-xs uppercase">Status</th>
                      <th className="px-4 py-3 font-medium text-xs uppercase">Heartbeat</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-800">
                    {agents.map(agent => (
                      <tr key={agent.id} className="hover:bg-gray-800/20 transition-colors">
                        <td className="px-4 py-3 font-mono text-white text-xs">{agent.id}</td>
                        <td className="px-4 py-3">
                          <span className="px-1.5 py-0.5 rounded text-[10px] bg-gray-700 text-gray-200 border border-gray-600 font-medium">
                            {agent.lane}
                          </span>
                        </td>
                        <td className="px-4 py-3 font-mono text-[10px] text-gray-500">{agent.endpoint}</td>
                        <td className="px-4 py-3">
                          {agent.status === 'active' ? (
                            <span className="flex items-center text-green-500 text-xs">
                              <span className="w-1.5 h-1.5 rounded-full bg-green-500 mr-2 animate-pulse"></span> Active
                            </span>
                          ) : (
                            <span className="flex items-center text-gray-600 text-xs">
                              <span className="w-1.5 h-1.5 rounded-full bg-gray-600 mr-2"></span> Offline
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-xs text-gray-500 font-mono">
                          {agent.last_heartbeat ? new Date(agent.last_heartbeat).toLocaleTimeString() : 'N/A'}
                        </td>
                      </tr>
                    ))}
                    {agents.length === 0 && (
                      <tr><td colSpan={5} className="px-4 py-8 text-center text-gray-600 italic">No agents found in registry.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {activeTab === 'system' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 animate-in zoom-in-95 duration-200">
              <div className="bg-[#161b22] border border-gray-800 rounded-lg p-5">
                <h4 className="text-white font-semibold mb-4 text-sm">Nexus Core Engine</h4>
                <div className="space-y-4">
                  <div className="p-3 bg-[#0d1117] rounded border border-gray-800">
                    <div className="text-[10px] text-gray-500 uppercase mb-1">Architecture</div>
                    <div className="text-sm font-mono text-blue-400">Single PM + Heterogeneous Workers</div>
                  </div>
                  <div className="p-3 bg-[#0d1117] rounded border border-gray-800">
                    <div className="text-[10px] text-gray-500 uppercase mb-1">State Database</div>
                    <div className="text-sm font-mono text-gray-300">SQLite (SSoT Mode)</div>
                  </div>
                  <div className="p-3 bg-[#0d1117] rounded border border-gray-800">
                    <div className="text-[10px] text-gray-500 uppercase mb-1">Governance</div>
                    <div className="text-sm font-mono text-gray-300">PRD V7.5 / RULES Enforcement</div>
                  </div>
                </div>
              </div>
              <div className="bg-[#161b22] border border-gray-800 rounded-lg p-5">
                <h4 className="text-white font-semibold mb-4 text-sm">Security & Networking</h4>
                <div className="space-y-4">
                  <div className="p-3 bg-[#0d1117] rounded border border-gray-800">
                    <div className="text-[10px] text-gray-500 uppercase mb-1">API Protocol</div>
                    <div className="text-sm font-mono text-gray-300">RESTful + SSE Streaming</div>
                  </div>
                  <div className="p-3 bg-[#0d1117] rounded border border-gray-800">
                    <div className="text-[10px] text-gray-500 uppercase mb-1">Sandboxing</div>
                    <div className="text-sm font-mono text-green-500">Isolation Active</div>
                  </div>
                  <div className="p-3 bg-[#0d1117] rounded border border-gray-800">
                    <div className="text-[10px] text-gray-500 uppercase mb-1">Zero-Trust</div>
                    <div className="text-sm font-mono text-gray-300">Artifact Webhook Verification</div>
                  </div>
                </div>
              </div>
            </div>
          )}

        </div>
      </div>
      
      {/* Footer Info */}
      <div className="flex-none p-3 bg-[#0d1117] border-t border-gray-800 flex justify-between items-center text-[10px] text-gray-600 px-6">
        <div>NEXUS DISPATCH v0.7.5-DESIGN-BETA</div>
        <div className="flex items-center">
          <span className="w-1.5 h-1.5 bg-green-500 rounded-full mr-2 shadow-[0_0_5px_rgba(34,197,94,0.5)]"></span>
          DAEMON ONLINE
        </div>
      </div>
    </div>
  );
};

export default SettingsPanel;
