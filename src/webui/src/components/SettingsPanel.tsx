import React, { useState, useEffect } from 'react';

// PRD 8.3 & Lane Definitions
const STANDARD_LANES = ['DEV', 'OPS', 'DESIGN', 'CONTENT', 'RESEARCH', 'ORCHESTRATOR'];

// Mock or get from context/storage
const AUTH_TOKEN = 'valid-token';

interface AgentRoster {
  id: string;      // Internal UUID
  agent_id: string; // Business identifier (e.g., long-coder-1)
  lane: string;
  endpoint: string;
  dialect?: string;
  status: 'active' | 'offline';
  last_heartbeat?: string;
}

interface ControllerConfig {
  controller_id: string;
  name: string;
  entity_type: string;
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

  const fetchWithAuth = async (url: string, options: RequestInit = {}) => {
    return fetch(url, {
      ...options,
      headers: {
        ...options.headers,
        'Authorization': `Bearer ${AUTH_TOKEN}`
      }
    });
  };

  useEffect(() => {
    fetchInitialData();
  }, []);

  const fetchInitialData = async () => {
    try {
      setLoading(true);
      const [agentsRes, controllersRes] = await Promise.all([
        fetchWithAuth('/api/v1/agents'),
        fetchWithAuth('/api/v1/controllers')
      ]);

      const agentsData = await agentsRes.json();
      const controllersData = await controllersRes.json();

      setAgents(agentsData.agents || []);
      const ctrls = controllersData.controllers || [];
      setControllers(ctrls);

      if (ctrls.length > 0) {
        const main = ctrls.find((c: any) => c.controller_id === 'ctrl-pm-main') || ctrls[0];
        setSelectedControllerId(main.controller_id);
        setConfig(main.config_json || {});
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
      setConfig(ctrl.config_json || {});
    }
  };

  const saveConfig = async () => {
    if (!selectedControllerId) return;
    setSaving(true);
    setMessage(null);
    try {
      // PRD 8.3 requires specific fields or the entire config_json
      // The API schemas.ts 'controllerConfigUpdate' has additionalProperties: false
      // We must only send the recognized config fields
      const schemaFields = [
        'default_reviewer', 'poll_interval_seconds', 'dispatch_policy',
        'blueprint_auto_advance', 'max_concurrent_dispatches', 'retry_max_attempts',
        'acceptance_mode', 'reviewer_routing'
      ];

      const payload: any = {};
      schemaFields.forEach(f => {
        if (config[f] !== undefined) payload[f] = config[f];
      });

      const response = await fetchWithAuth(`/api/v1/controllers/${selectedControllerId}/config`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error?.message || 'Save failed');
      }

      setMessage({ type: 'success', text: 'Controller strategy synced with core successfully' });
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

  if (loading) {
    return (
      <div className="h-full w-full bg-[#0d1117] flex items-center justify-center">
        <div className="flex flex-col items-center">
          <div className="w-10 h-10 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
          <div className="mt-4 text-gray-500 font-mono text-sm tracking-widest uppercase">nexus_engine_initializing...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full w-full bg-[#0d1117] text-gray-300 flex flex-col overflow-hidden font-sans">
      {/* Header Tabs - GitHub Dark Style */}
      <div className="flex-none px-6 pt-4 border-b border-[#30363d] bg-[#161b22]">
        <div className="flex space-x-4">
          <button
            onClick={() => setActiveTab('review')}
            className={`pb-3 text-sm font-semibold border-b-2 transition-all flex items-center space-x-2 ${activeTab === 'review' ? 'border-[#f78166] text-[#e6edf3]' : 'border-transparent text-[#7d8590] hover:text-[#e6edf3] hover:border-[#8b949e]'}`}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"></path></svg>
            <span>Governance Strategy</span>
          </button>
          <button
            onClick={() => setActiveTab('roster')}
            className={`pb-3 text-sm font-semibold border-b-2 transition-all flex items-center space-x-2 ${activeTab === 'roster' ? 'border-[#f78166] text-[#e6edf3]' : 'border-transparent text-[#7d8590] hover:text-[#e6edf3] hover:border-[#8b949e]'}`}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z"></path></svg>
            <span>Worker Roster</span>
          </button>
          <button
            onClick={() => setActiveTab('system')}
            className={`pb-3 text-sm font-semibold border-b-2 transition-all flex items-center space-x-2 ${activeTab === 'system' ? 'border-[#f78166] text-[#e6edf3]' : 'border-transparent text-[#7d8590] hover:text-[#e6edf3] hover:border-[#8b949e]'}`}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
            <span>System Pulse</span>
          </button>
        </div>
      </div>

      <div className="flex-grow overflow-y-auto p-8 bg-[#0d1117]">
        <div className="max-w-6xl mx-auto">

          {message && (
            <div className={`mb-6 p-4 rounded-md border text-sm flex items-center animate-in fade-in slide-in-from-top-2 duration-300 ${message.type === 'success' ? 'bg-[#1f2d23] border-[#238636]/40 text-[#3fb950]' : 'bg-[#2d1f1f] border-[#f85149]/40 text-[#f85149]'}`}>
              <span className="mr-3 text-lg">{message.type === 'success' ? '✓' : '⚠'}</span>
              <span className="font-mono">{message.text}</span>
            </div>
          )}

          {activeTab === 'review' && (
            <div className="space-y-6 animate-in fade-in duration-500">
              {/* Controller Selection */}
              <div className="bg-[#161b22] border border-[#30363d] rounded-lg p-6 shadow-sm">
                <div className="flex justify-between items-start mb-6">
                  <div className="flex items-center">
                    <div className="p-2 bg-blue-500/10 rounded-lg mr-4">
                      <svg className="w-6 h-6 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"></path><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path></svg>
                    </div>
                    <div>
                      <h3 className="text-[#e6edf3] text-lg font-bold">FSM Governance Strategy</h3>
                      <p className="text-[#8b949e] text-xs font-mono uppercase">nexus_control_plane::hot_reload_enabled</p>
                    </div>
                  </div>
                  <button
                    onClick={saveConfig}
                    disabled={saving}
                    className={`px-6 py-2 rounded-md text-sm font-bold transition-all border shadow-sm ${saving ? 'bg-[#21262d] border-[#30363d] text-[#8b949e] cursor-not-allowed' : 'bg-[#238636] hover:bg-[#2ea043] border-[#238636] text-white'}`}
                  >
                    {saving ? 'SYNCING_CORE...' : 'SYNC_STRATEGY'}
                  </button>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 border-t border-[#30363d] pt-6">
                  <div>
                    <label className="block text-[10px] font-bold text-[#8b949e] mb-2 uppercase tracking-widest">Active State Machine</label>
                    <div className="relative">
                      <select
                        value={selectedControllerId}
                        onChange={(e) => handleControllerChange(e.target.value)}
                        className="w-full bg-[#0d1117] border border-[#30363d] rounded-md px-4 py-2 text-sm text-[#e6edf3] focus:border-[#58a6ff] focus:ring-1 focus:ring-[#58a6ff] outline-none appearance-none cursor-pointer font-mono"
                      >
                        {controllers.map(c => (
                          <option key={c.controller_id} value={c.controller_id}>
                            {c.controller_id} [{c.entity_type.toUpperCase()}]
                          </option>
                        ))}
                      </select>
                      <div className="absolute inset-y-0 right-0 flex items-center px-3 pointer-events-none text-[#8b949e]">
                        <svg className="w-4 h-4 fill-current" viewBox="0 0 20 20"><path d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z"/></svg>
                      </div>
                    </div>
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-[#8b949e] mb-2 uppercase tracking-widest">Global Default Auditor</label>
                    <select
                      value={config.default_reviewer || ''}
                      onChange={(e) => updateConfigField('default_reviewer', e.target.value)}
                      className="w-full bg-[#0d1117] border border-[#30363d] rounded-md px-4 py-2 text-sm text-[#e6edf3] focus:border-[#58a6ff] outline-none font-mono"
                    >
                      <option value="">-- SYSTEM_ORCHESTRATOR --</option>
                      {agents.map(a => (
                        <option key={a.agent_id} value={a.agent_id}>{a.agent_id} ({a.lane})</option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* System Tuning */}
                <div className="lg:col-span-1 space-y-6">
                  <section className="bg-[#161b22] border border-[#30363d] rounded-lg overflow-hidden flex flex-col h-full shadow-sm">
                    <div className="px-5 py-3 border-b border-[#30363d] bg-[#1c2128]">
                      <h4 className="text-[10px] font-bold text-[#e6edf3] uppercase tracking-widest flex items-center">
                        <span className="w-1.5 h-1.5 bg-[#f78166] rounded-full mr-2"></span>
                        Performance Tuner
                      </h4>
                    </div>
                    <div className="p-5 space-y-6 flex-grow">
                      <div>
                        <label className="block text-[10px] font-bold text-[#8b949e] mb-3 uppercase tracking-tighter">Dispatch Algorithm</label>
                        <div className="grid grid-cols-1 gap-2">
                          {['priority_first', 'fifo', 'round_robin'].map(policy => (
                            <button
                              key={policy}
                              onClick={() => updateConfigField('dispatch_policy', policy)}
                              className={`px-3 py-2 text-left text-[10px] font-mono rounded border transition-all ${config.dispatch_policy === policy ? 'bg-[#58a6ff]/10 border-[#58a6ff] text-[#58a6ff]' : 'bg-[#0d1117] border-[#30363d] text-[#7d8590] hover:border-[#8b949e]'}`}
                            >
                              {policy.toUpperCase()}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div className="space-y-4">
                        <div className="flex items-center justify-between p-3 bg-[#0d1117] border border-[#30363d] rounded-md">
                          <div className="text-[10px] font-bold text-[#e6edf3] uppercase tracking-tighter">Auto-Advance Blueprint</div>
                          <button
                            onClick={() => updateConfigField('blueprint_auto_advance', !config.blueprint_auto_advance)}
                            className={`w-10 h-5 rounded-full relative transition-colors border ${config.blueprint_auto_advance ? 'bg-[#238636] border-[#2ea043]' : 'bg-[#21262d] border-[#30363d]'}`}
                          >
                            <span className={`absolute top-[2px] w-3 h-3 rounded-full bg-[#e6edf3] transition-transform ${config.blueprint_auto_advance ? 'translate-x-[22px]' : 'translate-x-[3px]'}`}></span>
                          </button>
                        </div>

                        <div className="space-y-4">
                          {[
                            { label: 'Max Concurrency', field: 'max_concurrent_dispatches', min: 1, max: 100, color: '#58a6ff' },
                            { label: 'Tick Interval (s)', field: 'poll_interval_seconds', min: 1, max: 600, color: '#58a6ff' },
                            { label: 'Retry Threshold', field: 'retry_max_attempts', min: 0, max: 50, color: '#f78166' }
                          ].map(item => (
                            <div key={item.field} className="space-y-2 p-3 bg-[#0d1117] rounded-md border border-[#30363d]">
                              <div className="flex justify-between items-center mb-1">
                                <label className="text-[10px] font-bold text-[#8b949e] uppercase">{item.label}</label>
                                <input
                                  type="number"
                                  value={config[item.field] || item.min}
                                  onChange={(e) => updateConfigField(item.field, parseInt(e.target.value) || item.min)}
                                  className="w-12 bg-transparent text-right text-[10px] font-mono focus:outline-none"
                                  style={{ color: item.color }}
                                />
                              </div>
                              <input
                                type="range"
                                min={item.min}
                                max={item.max}
                                value={config[item.field] || item.min}
                                onChange={(e) => updateConfigField(item.field, parseInt(e.target.value))}
                                className="w-full h-1 bg-[#30363d] rounded-lg appearance-none cursor-pointer accent-blue-500"
                              />
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                    <div className="p-4 bg-[#1c2128] border-t border-[#30363d]">
                       <div className="text-[9px] text-[#8b949e] font-mono leading-relaxed">
                         <span className="text-[#f78166] font-bold">CORE_NOTICE:</span> Merged dispatch signals enabled. Review notifications route through assigned Agent bots.
                       </div>
                    </div>
                  </section>
                </div>

                {/* Acceptance Modes & Review Routing */}
                <div className="lg:col-span-2 space-y-6">
                  <section className="bg-[#161b22] border border-[#30363d] rounded-lg overflow-hidden shadow-sm">
                    <div className="px-5 py-3 border-b border-[#30363d] bg-[#1c2128]">
                      <h4 className="text-[10px] font-bold text-[#e6edf3] uppercase tracking-widest flex items-center">
                        <span className="w-1.5 h-1.5 bg-[#3fb950] rounded-full mr-2"></span>
                        Lane Audit & Auditor Routing
                      </h4>
                    </div>
                    <div className="p-0 overflow-x-auto">
                      <table className="w-full text-left border-collapse">
                        <thead>
                          <tr className="bg-[#0d1117] border-b border-[#30363d]">
                            <th className="px-6 py-3 text-[10px] font-bold text-[#8b949e] uppercase tracking-wider">Target Lane</th>
                            <th className="px-6 py-3 text-[10px] font-bold text-[#8b949e] uppercase tracking-wider">Acceptance Mode</th>
                            <th className="px-6 py-3 text-[10px] font-bold text-[#8b949e] uppercase tracking-wider">Assigned Auditor</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[#30363d]">
                          {STANDARD_LANES.map(lane => (
                            <tr key={lane} className="hover:bg-[#1c2128] transition-colors group">
                              <td className="px-6 py-4">
                                <div className="flex items-center">
                                  <span className={`w-2 h-2 rounded-full mr-3 ${agents.some(a => a.lane === lane && a.status === 'active') ? 'bg-green-500' : 'bg-gray-600'}`}></span>
                                  <span className="text-sm font-mono font-bold text-[#e6edf3] tracking-tighter">{lane}</span>
                                </div>
                              </td>
                              <td className="px-6 py-4">
                                <select
                                  value={config.acceptance_mode?.[lane] || 'machine_audit'}
                                  onChange={(e) => updateAcceptanceMode(lane, e.target.value)}
                                  className="w-full bg-[#0d1117] border border-[#30363d] rounded px-3 py-1.5 text-xs text-[#e6edf3] outline-none focus:border-[#58a6ff] font-mono cursor-pointer"
                                >
                                  <option value="machine_audit">MACHINE_AUDIT (Auto)</option>
                                  <option value="pm_audit">PM_AUDIT (Human/AI)</option>
                                  <option value="design_spec">DESIGN_SPEC (Review)</option>
                                </select>
                              </td>
                              <td className="px-6 py-4">
                                <select
                                  value={config.reviewer_routing?.[lane] || ''}
                                  onChange={(e) => updateReviewerRoute(lane, e.target.value)}
                                  className="w-full bg-[#0d1117] border border-[#30363d] rounded px-3 py-1.5 text-xs text-[#e6edf3] outline-none focus:border-[#58a6ff] font-mono cursor-pointer"
                                >
                                  <option value="">(Inherit Global Default)</option>
                                  {agents.map(a => (
                                    <option key={a.agent_id} value={a.agent_id}>{a.agent_id}</option>
                                  ))}
                                </select>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </section>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'roster' && (
            <div className="bg-[#161b22] border border-[#30363d] rounded-lg overflow-hidden shadow-lg animate-in slide-in-from-right-4 duration-400">
              <div className="px-6 py-5 border-b border-[#30363d] bg-[#1c2128] flex justify-between items-center">
                <div>
                  <h3 className="text-[#e6edf3] font-bold text-lg tracking-tight">Autonomous Worker Fleet</h3>
                  <p className="text-[#8b949e] text-[10px] font-mono mt-1 uppercase">fleet_status::total_nodes[{agents.length}] | ready_nodes[{agents.filter(a => a.status === 'active').length}]</p>
                </div>
                <button onClick={fetchInitialData} className="p-2 text-[#8b949e] hover:text-[#58a6ff] transition-colors bg-[#0d1117] rounded-md border border-[#30363d]">
                   <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path></svg>
                </button>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead>
                    <tr className="bg-[#0d1117] text-[#8b949e] border-b border-[#30363d]">
                      <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-wider">Agent Identifier</th>
                      <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-wider">Lane Baseline</th>
                      <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-wider">Protocol</th>
                      <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-wider">Status</th>
                      <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-wider text-right">Heartbeat</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#30363d]">
                    {agents.map(agent => (
                      <tr key={agent.id} className="hover:bg-[#1c2128] transition-colors group">
                        <td className="px-6 py-5">
                          <div className="font-mono text-xs font-bold text-[#58a6ff]">{agent.agent_id}</div>
                          <div className="text-[9px] text-[#8b949e] font-mono mt-1 opacity-60 group-hover:opacity-100 truncate max-w-xs">{agent.endpoint}</div>
                        </td>
                        <td className="px-6 py-5">
                          <span className="px-2 py-0.5 rounded text-[9px] font-bold bg-[#1c2128] text-[#e6edf3] border border-[#30363d] tracking-tighter uppercase">
                            lane_{agent.lane}
                          </span>
                        </td>
                        <td className="px-6 py-5 font-mono text-[10px] text-[#d2a8ff] uppercase">
                          {agent.dialect || 'hermes'}
                        </td>
                        <td className="px-6 py-5">
                          {agent.status === 'active' ? (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[9px] font-bold bg-[#1f2d23] text-[#3fb950] border border-[#238636]/30">
                              <span className="w-1.5 h-1.5 rounded-full bg-[#3fb950] mr-2 animate-pulse"></span> ONLINE
                            </span>
                          ) : (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[9px] font-bold bg-[#2d1f1f] text-[#f85149] border border-[#f85149]/30">
                              <span className="w-1.5 h-1.5 rounded-full bg-[#f85149] mr-2"></span> OFFLINE
                            </span>
                          )}
                        </td>
                        <td className="px-6 py-5 text-right text-[10px] font-mono text-[#8b949e]">
                          {agent.last_heartbeat ? new Date(agent.last_heartbeat).toLocaleTimeString() : 'SIGNAL_LOST'}
                        </td>
                      </tr>
                    ))}
                    {agents.length === 0 && (
                      <tr><td colSpan={5} className="px-6 py-20 text-center text-[#8b949e] font-mono text-xs italic tracking-widest bg-[#0d1117] uppercase">waiting_for_agent_registration...</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {activeTab === 'system' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 animate-in zoom-in-95 duration-300">
              <div className="bg-[#161b22] border border-[#30363d] rounded-lg p-8 flex flex-col shadow-md">
                <div className="flex items-center mb-8">
                  <div className="w-10 h-10 bg-blue-500/10 rounded-full flex items-center justify-center mr-4 border border-blue-500/20">
                     <svg className="w-5 h-5 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z"></path></svg>
                  </div>
                  <div>
                    <h4 className="text-[#e6edf3] font-bold text-base tracking-tight">Control Plane Architecture</h4>
                    <p className="text-[#8b949e] text-[9px] font-mono uppercase tracking-tighter">topology::central_brain_heterogeneous_workers</p>
                  </div>
                </div>
                <div className="space-y-3 flex-grow">
                  {[
                    { label: 'State Storage', value: 'SQLite v3 (WAL_MODE)', status: 'SYNCED' },
                    { label: 'Ingress Protocol', value: 'Unified REST Layer', status: 'ENFORCED' },
                    { label: 'SQL Exposure', value: 'Direct Entry Blocked', status: 'LOCKED' },
                    { label: 'Execution Logic', value: 'FSM Transition Map', status: 'ACTIVE' }
                  ].map(item => (
                    <div key={item.label} className="p-4 bg-[#0d1117] rounded-md border border-[#30363d] flex justify-between items-center group hover:border-[#8b949e] transition-all">
                      <div>
                        <div className="text-[9px] text-[#8b949e] font-bold uppercase mb-1">{item.label}</div>
                        <div className="text-xs font-mono text-[#e6edf3]">{item.value}</div>
                      </div>
                      <span className="text-[9px] font-bold px-2 py-0.5 rounded bg-[#30363d] text-[#e6edf3] font-mono group-hover:bg-[#58a6ff] group-hover:text-white transition-colors">{item.status}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="bg-[#161b22] border border-[#30363d] rounded-lg p-8 flex flex-col shadow-md">
                 <div className="flex items-center mb-8">
                  <div className="w-10 h-10 bg-purple-500/10 rounded-full flex items-center justify-center mr-4 border border-purple-500/20">
                     <svg className="w-5 h-5 text-purple-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"></path></svg>
                  </div>
                  <div>
                    <h4 className="text-[#e6edf3] font-bold text-base tracking-tight">Security & Trust Profile</h4>
                    <p className="text-[#8b949e] text-[9px] font-mono uppercase tracking-tighter">protocol::nexus_trust_v2.1_hardened</p>
                  </div>
                </div>
                <div className="space-y-3 flex-grow">
                  {[
                    { label: 'Bearer Token', value: 'Scoped JWT (SSoT)', status: 'VALID' },
                    { label: 'Artifact Sync', value: 'Webhook Signature Proof', status: 'VERIFIED' },
                    { label: 'Process Isolation', value: 'Sandboxed Workers', status: 'ISOLATED' },
                    { label: 'Audit Trail', value: 'Immutable Write-Ahead Log', status: 'LOGGING' }
                  ].map(item => (
                    <div key={item.label} className="p-4 bg-[#0d1117] rounded-md border border-[#30363d] flex justify-between items-center group hover:border-[#8b949e] transition-all">
                      <div>
                        <div className="text-[9px] text-[#8b949e] font-bold uppercase mb-1">{item.label}</div>
                        <div className="text-xs font-mono text-[#e6edf3]">{item.value}</div>
                      </div>
                      <span className="text-[9px] font-bold px-2 py-0.5 rounded bg-[#30363d] text-[#e6edf3] font-mono group-hover:bg-[#d2a8ff] group-hover:text-white transition-colors">{item.status}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

        </div>
      </div>

      {/* Footer System Status Bar */}
      <div className="flex-none p-3 bg-[#161b22] border-t border-[#30363d] flex justify-between items-center text-[10px] font-mono text-[#7d8590] px-8">
        <div className="flex items-center tracking-tighter">
          <span className="flex h-2 w-2 relative mr-3">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
          </span>
          NEXUS_DISPATCH::v0.7.5_STABLE_DESIGN
        </div>
        <div className="flex items-center space-x-10">
          <div className="flex items-center">
            <span className="mr-2 text-[#444c56] font-bold">CORE_STATE:</span>
            <span className="text-[#e6edf3] font-bold">OPERATIONAL</span>
          </div>
          <div className="flex items-center">
            <span className="mr-2 text-[#444c56] font-bold">ACTIVE_NODES:</span>
            <span className={agents.filter(a => a.status === 'active').length > 0 ? 'text-[#3fb950] font-bold' : 'text-[#f85149] font-bold'}>
              {agents.filter(a => a.status === 'active').length} SYNCED
            </span>
          </div>
          <div className="flex items-center text-[#444c56] font-bold italic">
             STAY_SHARP_AND_LEAN
          </div>
        </div>
      </div>
    </div>
  );
};

export default SettingsPanel;
